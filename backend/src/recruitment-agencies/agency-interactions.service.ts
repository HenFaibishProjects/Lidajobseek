import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { AgencyInteraction } from './agency-interaction.entity';
import { RecruitmentAgency } from './recruitment-agency.entity';
import { AgencyContact } from './agency-contact.entity';

@Injectable()
export class AgencyInteractionsService {
  constructor(
    @InjectRepository(AgencyInteraction)
    private readonly interactionRepo: EntityRepository<AgencyInteraction>,
    private readonly em: EntityManager,
  ) {}

  private async verifyOwnership(agencyId: number, userId: number): Promise<RecruitmentAgency> {
    const agency = await this.em.findOne(RecruitmentAgency, { id: agencyId, user: userId });
    if (!agency) throw new NotFoundException(`Agency ${agencyId} not found or unauthorized`);
    return agency;
  }

  async create(data: any, userId: number): Promise<AgencyInteraction> {
    const agency = await this.verifyOwnership(data.agencyId, userId);

    let contact: AgencyContact | null = null;
    if (data.contactId) {
      contact = await this.em.findOne(AgencyContact, { id: data.contactId, agency: { user: userId } });
    }

    const interaction = this.interactionRepo.create({
      interactionDate: new Date(data.interactionDate),
      interactionType: data.interactionType,
      direction: data.direction,
      summary: data.summary,
      cvSent: data.cvSent ?? false,
      notes: data.notes || null,
      agency,
      contact: contact ?? undefined,
    } as any);
    await this.em.persistAndFlush(interaction);
    return interaction;
  }

  async update(id: number, data: any, userId: number): Promise<AgencyInteraction> {
    const interaction = await this.interactionRepo.findOne({ id, agency: { user: userId } });
    if (!interaction) throw new NotFoundException(`Interaction ${id} not found`);

    if (data.interactionDate !== undefined) interaction.interactionDate = new Date(data.interactionDate);
    if (data.interactionType !== undefined) interaction.interactionType = data.interactionType;
    if (data.direction !== undefined) interaction.direction = data.direction;
    if (data.summary !== undefined) interaction.summary = data.summary;
    if (data.cvSent !== undefined) interaction.cvSent = data.cvSent;
    if (data.notes !== undefined) interaction.notes = data.notes;
    if ('contactId' in data) {
      interaction.contact = data.contactId
        ? (await this.em.findOne(AgencyContact, { id: data.contactId, agency: { user: userId } })) ?? undefined
        : undefined;
    }

    await this.em.flush();
    return interaction;
  }

  async remove(id: number, userId: number): Promise<void> {
    const interaction = await this.interactionRepo.findOne({ id, agency: { user: userId } });
    if (!interaction) throw new NotFoundException(`Interaction ${id} not found`);
    await this.em.removeAndFlush(interaction);
  }
}
