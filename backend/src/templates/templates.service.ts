import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Template } from './template.entity';
import { User } from '../users/user.entity';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: EntityRepository<Template>,
    @InjectRepository(User)
    private readonly userRepo: EntityRepository<User>,
    private readonly em: EntityManager,
  ) {}

  async create(dto: CreateTemplateDto, userId: number): Promise<Template> {
    const user = await this.userRepo.findOneOrFail({ id: userId });
    const template = this.em.create(Template, {
      name: dto.name,
      versions: dto.versions ?? [],
      user,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.em.persistAndFlush(template);
    return template;
  }

  async findAll(userId: number): Promise<Template[]> {
    return this.templateRepo.find({ user: { id: userId } }, { orderBy: { updatedAt: 'DESC' } });
  }

  async findOne(id: number, userId: number): Promise<Template> {
    const template = await this.templateRepo.findOne({ id, user: { id: userId } });
    if (!template) throw new NotFoundException(`Template #${id} not found`);
    return template;
  }

  async update(id: number, dto: Partial<CreateTemplateDto>, userId: number): Promise<Template> {
    const template = await this.findOne(id, userId);
    this.em.assign(template, dto);
    await this.em.flush();
    return template;
  }

  async remove(id: number, userId: number): Promise<void> {
    const template = await this.findOne(id, userId);
    await this.em.removeAndFlush(template);
  }
}
