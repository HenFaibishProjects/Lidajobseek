import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { RecruitmentAgency } from './recruitment-agency.entity';
import { User } from '../users/user.entity';

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  PHONE_CALL: 'Phone Call',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  OTHER: 'Other',
};

@Injectable()
export class RecruitmentAgenciesService {
  constructor(
    @InjectRepository(RecruitmentAgency)
    private readonly agencyRepo: EntityRepository<RecruitmentAgency>,
    private readonly em: EntityManager,
  ) {}

  async findAll(userId: number): Promise<any[]> {
    const agencies = await this.agencyRepo.find(
      { user: userId },
      {
        populate: ['contacts', 'interactions', 'interactions.contact'],
        orderBy: { updatedAt: QueryOrder.DESC },
      },
    );

    return agencies.map((agency) => {
      const contacts = agency.contacts.getItems();
      const interactions = agency.interactions.getItems();
      const primary = contacts.find((c) => c.isPrimaryContact) ?? contacts[0] ?? null;
      const sorted = [...interactions].sort(
        (a, b) => b.interactionDate.getTime() - a.interactionDate.getTime(),
      );
      const last = sorted[0] ?? null;

      return {
        id: agency.id,
        agencyName: agency.agencyName,
        website: agency.website,
        notes: agency.notes,
        createdAt: agency.createdAt,
        updatedAt: agency.updatedAt,
        primaryContactName: primary?.fullName ?? null,
        contactCount: contacts.length,
        lastInteractionDate: last?.interactionDate ?? null,
        lastInteractionType: last ? (INTERACTION_TYPE_LABELS[last.interactionType] ?? last.interactionType) : null,
        lastInteractionContact: last?.contact?.fullName ?? null,
        lastInteractionSummary: last?.summary ?? null,
        cvEverSent: interactions.some((i) => i.cvSent),
      };
    });
  }

  async findOne(id: number, userId: number): Promise<RecruitmentAgency> {
    const agency = await this.agencyRepo.findOne(
      { id, user: userId },
      { populate: ['contacts', 'interactions', 'interactions.contact'] },
    );
    if (!agency) throw new NotFoundException(`Agency ${id} not found`);

    agency.contacts.getItems().sort((a, b) => {
      if (a.isPrimaryContact !== b.isPrimaryContact) return a.isPrimaryContact ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });

    agency.interactions.getItems().sort(
      (a, b) => b.interactionDate.getTime() - a.interactionDate.getTime(),
    );

    return agency;
  }

  async create(data: any, userId: number): Promise<RecruitmentAgency> {
    const agency = this.agencyRepo.create({
      agencyName: data.agencyName,
      website: data.website || null,
      notes: data.notes || null,
      user: this.em.getReference(User, userId),
    } as any);
    await this.em.persistAndFlush(agency);
    return agency;
  }

  async update(id: number, data: any, userId: number): Promise<RecruitmentAgency> {
    const agency = await this.agencyRepo.findOne({ id, user: userId });
    if (!agency) throw new NotFoundException(`Agency ${id} not found`);

    if (data.agencyName !== undefined) agency.agencyName = data.agencyName;
    if (data.website !== undefined) agency.website = data.website;
    if (data.notes !== undefined) agency.notes = data.notes;

    await this.em.flush();
    return agency;
  }

  async remove(id: number, userId: number): Promise<void> {
    const agency = await this.agencyRepo.findOne(
      { id, user: userId },
      { populate: ['contacts', 'interactions'] },
    );
    if (!agency) throw new NotFoundException(`Agency ${id} not found`);
    await this.em.removeAndFlush(agency);
  }
}
