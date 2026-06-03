import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { AgencyContact } from './agency-contact.entity';
import { RecruitmentAgency } from './recruitment-agency.entity';

@Injectable()
export class AgencyContactsService {
  constructor(
    @InjectRepository(AgencyContact)
    private readonly contactRepo: EntityRepository<AgencyContact>,
    private readonly em: EntityManager,
  ) {}

  private async verifyOwnership(agencyId: number, userId: number): Promise<RecruitmentAgency> {
    const agency = await this.em.findOne(RecruitmentAgency, { id: agencyId, user: userId });
    if (!agency) throw new NotFoundException(`Agency ${agencyId} not found or unauthorized`);
    return agency;
  }

  async create(data: any, userId: number): Promise<AgencyContact> {
    const agency = await this.verifyOwnership(data.agencyId, userId);
    const contact = this.contactRepo.create({
      fullName: data.fullName,
      phoneNumber: data.phoneNumber || null,
      email: data.email || null,
      roleTitle: data.roleTitle || null,
      linkedinUrl: data.linkedinUrl || null,
      notes: data.notes || null,
      isPrimaryContact: data.isPrimaryContact ?? false,
      agency,
    } as any);
    await this.em.persistAndFlush(contact);
    return contact;
  }

  async update(id: number, data: any, userId: number): Promise<AgencyContact> {
    const contact = await this.contactRepo.findOne({ id, agency: { user: userId } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);

    if (data.fullName !== undefined) contact.fullName = data.fullName;
    if (data.phoneNumber !== undefined) contact.phoneNumber = data.phoneNumber;
    if (data.email !== undefined) contact.email = data.email;
    if (data.roleTitle !== undefined) contact.roleTitle = data.roleTitle;
    if (data.linkedinUrl !== undefined) contact.linkedinUrl = data.linkedinUrl;
    if (data.notes !== undefined) contact.notes = data.notes;
    if (data.isPrimaryContact !== undefined) contact.isPrimaryContact = data.isPrimaryContact;

    await this.em.flush();
    return contact;
  }

  async remove(id: number, userId: number): Promise<void> {
    const contact = await this.contactRepo.findOne({ id, agency: { user: userId } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    await this.em.removeAndFlush(contact);
  }
}
