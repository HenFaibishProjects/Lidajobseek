import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { Contact } from './contact.entity';
import { Process } from '../processes/process.entity';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: EntityRepository<Contact>,
    private readonly em: EntityManager,
  ) {}

  async create(data: any, userId: number): Promise<Contact> {
    const processExists = await this.em.findOne(Process, { id: data.process, user: userId });
    if (!processExists) {
      throw new NotFoundException(`Process with ID ${data.process} not found or unauthorized`);
    }
    const contact = this.contactRepository.create(data);
    await this.em.persistAndFlush(contact);
    return contact;
  }

  async findAllByProcess(processId: number, userId: number): Promise<Contact[]> {
    return this.contactRepository.find({ process: { id: processId, user: userId } });
  }

  async update(id: number, data: any, userId: number): Promise<Contact> {
    const contact = await this.contactRepository.findOne({ id, process: { user: userId } });
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    Object.assign(contact, data);
    await this.em.flush();
    return contact;
  }

  async remove(id: number, userId: number): Promise<Contact> {
    const contact = await this.contactRepository.findOne({ id, process: { user: userId } });
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    await this.em.removeAndFlush(contact);
    return contact;
  }
}
