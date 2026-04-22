import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { SelfReview } from './self-review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { Process } from '../processes/process.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(SelfReview)
    private readonly reviewRepository: EntityRepository<SelfReview>,
    private readonly em: EntityManager,
  ) {}

  async create(dto: CreateReviewDto, userId: number): Promise<SelfReview> {
    const processExists = await this.em.findOne(Process, { id: dto.processId, user: userId });
    if (!processExists) {
      throw new NotFoundException(`Process with ID ${dto.processId} not found or unauthorized`);
    }
    const review = this.reviewRepository.create(dto as any);
    await this.em.persistAndFlush(review);
    return review;
  }

  async findByProcess(processId: number, userId: number): Promise<SelfReview[]> {
    return this.reviewRepository.find(
      { process: { id: processId, user: userId } },
      { orderBy: { createdAt: QueryOrder.DESC } },
    );
  }

  async update(id: number, data: any, userId: number): Promise<SelfReview> {
    const review = await this.reviewRepository.findOne({ id, process: { user: userId } });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    Object.assign(review, data);
    await this.em.flush();
    return review;
  }

  async remove(id: number, userId: number): Promise<SelfReview> {
    const review = await this.reviewRepository.findOne({ id, process: { user: userId } });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    await this.em.removeAndFlush(review);
    return review;
  }
}
