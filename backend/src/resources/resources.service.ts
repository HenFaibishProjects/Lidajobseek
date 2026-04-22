import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { Resource } from './resource.entity';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: EntityRepository<Resource>,
    private readonly em: EntityManager,
  ) { }

  async create(data: any, userId: number): Promise<Resource> {
    const resource = this.resourceRepository.create({ ...data, user: userId } as any);
    await this.em.persistAndFlush(resource);
    return resource;
  }

  async findAll(userId: number): Promise<Resource[]> {
    return this.resourceRepository.find(
      { user: userId } as any,
      { orderBy: { updatedAt: QueryOrder.DESC } },
    );
  }

  async findOne(id: number, userId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ id, user: userId } as any);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    return resource;
  }

  async update(id: number, data: any, userId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ id, user: userId } as any);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    Object.assign(resource, data);
    await this.em.flush();
    return resource;
  }

  async remove(id: number, userId: number): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ id, user: userId } as any);
    if (!resource) {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    await this.em.removeAndFlush(resource);
    return resource;
  }
}
