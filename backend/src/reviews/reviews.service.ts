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
  ) { }

  async create(dto: CreateReviewDto, userId: number): Promise<SelfReview> {
    const process = await this.em.findOne(Process, { id: dto.processId, user: userId });
    if (!process) {
      throw new NotFoundException(`Process with ID ${dto.processId} not found or unauthorized`);
    }

    const review = this.reviewRepository.create({
      stage: dto.stage,
      confidence: dto.confidence,
      whatWentWell: dto.whatWentWell,
      whatFailed: dto.whatFailed,
      gaps: dto.gaps,
      mood: dto.mood,
      energyLevel: dto.energyLevel,
      keyLearning: dto.keyLearning,
      nextActionPlan: dto.nextActionPlan,
      contactPersonId: dto.contactPersonId,
      interactionId: dto.interactionId,
      process,
    } as any);

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

    // Whitelist safe fields -never overwrite process relation via raw data
    const allowed = [
      'stage', 'confidence', 'whatWentWell', 'whatFailed', 'gaps',
      'mood', 'energyLevel', 'keyLearning', 'nextActionPlan',
      'contactPersonId', 'interactionId',
    ];
    for (const field of allowed) {
      if (field in data) (review as any)[field] = data[field];
    }

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
