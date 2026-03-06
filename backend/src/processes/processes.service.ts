import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { Process } from './process.entity';
import { Interaction } from '../interactions/interaction.entity';
import { SelfReview } from '../reviews/self-review.entity';
import { Contact } from '../contacts/contact.entity';
import { User } from '../users/user.entity';
import { CreateProcessDto } from './dto/create-process.dto';

@Injectable()
export class ProcessesService {
  private readonly CLOSED_STAGE_LABELS = ['Rejected', 'Reject', 'Withdrawn','Offer Declined'];

  constructor(
    @InjectRepository(Process)
    private readonly processRepository: EntityRepository<Process>,
    private readonly em: EntityManager,
  ) { }

  private isClosedStage(stage?: string | null): boolean {
    const normalizedStage = stage?.trim().toLowerCase();
    return normalizedStage === 'rejected' || normalizedStage === 'reject' || normalizedStage === 'withdrawn' || normalizedStage === 'offer declined';
  }

  async create(dto: CreateProcessDto, userId: number): Promise<Process> {
    const data: any = { ...dto, user: this.em.getReference(User, userId) };
    
    // Convert date strings to Date objects
    if (dto.initialInviteDate) {
      data.initialInviteDate = new Date(dto.initialInviteDate);
    }
    if (dto.nextFollowUp) {
      data.nextFollowUp = new Date(dto.nextFollowUp);
    }

    // Convert empty strings to null for numeric fields
    if (data.salaryExpectation === '' || data.salaryExpectation === undefined) {
      data.salaryExpectation = null;
    }
    if (data.daysFromOffice === '' || data.daysFromOffice === undefined) {
      data.daysFromOffice = null;
    }
    if (data.scoreTech === '' || data.scoreTech === undefined) {
      data.scoreTech = 0;
    }
    if (data.scoreWLB === '' || data.scoreWLB === undefined) {
      data.scoreWLB = 0;
    }
    if (data.scoreGrowth === '' || data.scoreGrowth === undefined) {
      data.scoreGrowth = 0;
    }
    if (data.scoreVibe === '' || data.scoreVibe === undefined) {
      data.scoreVibe = 0;
    }

    const process = this.processRepository.create(data);
    await this.em.persistAndFlush(process);
    return process;
  }

  async findAll(userId: number): Promise<any[]> {
    // First, check and update any processes that need automatic stage update
    await this.updateStaleProcesses();

    const processes = await this.processRepository.find(
      { user: userId },
      {
        populate: ['interactions', 'reviews'],
        orderBy: { updatedAt: QueryOrder.DESC },
      },
    );

    // Add interaction count manually
    return processes.map(process => ({
      ...process,
      isClosed: this.isClosedStage(process.currentStage),
      _count: {
        interactions: process.interactions.length,
      },
    }));
  }

  async findOne(id: number, userId: number): Promise<Process | null> {
    // First, check and update any processes that need automatic stage update
    await this.updateStaleProcesses();

    const process = await this.processRepository.findOne(
      { id, user: userId },
      {
        populate: ['interactions', 'reviews', 'contacts'],
      },
    );

    if (process) {
      // Sort interactions and reviews
      process.interactions.getItems().sort((a, b) => b.date.getTime() - a.date.getTime());
      process.reviews.getItems().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      (process as any).isClosed = this.isClosedStage(process.currentStage);
    }

    return process;
  }

  async update(id: number, dto: any, userId: number): Promise<Process | null> {
    const process = await this.processRepository.findOne({ id, user: userId });
    if (!process) {
      return null;
    }

    const data: any = { ...dto };
    
    // Convert date strings to Date objects
    if (dto.initialInviteDate) {
      data.initialInviteDate = new Date(dto.initialInviteDate);
    }
    if (dto.nextFollowUp) {
      data.nextFollowUp = new Date(dto.nextFollowUp);
    }
    if (dto.offerDeadline) {
      data.offerDeadline = new Date(dto.offerDeadline);
    }

    // Convert empty strings to null for numeric fields
    if (data.salaryExpectation === '') {
      data.salaryExpectation = null;
    }
    if (data.daysFromOffice === '') {
      data.daysFromOffice = null;
    }
    if (data.baseSalary === '') {
      data.baseSalary = null;
    }
    if (data.signingBonus === '') {
      data.signingBonus = null;
    }

    Object.assign(process, data);
    await this.em.flush();
    return process;
  }

  async remove(id: number, userId: number): Promise<Process | null> {
    const process = await this.processRepository.findOne({ id, user: userId });
    if (process) {
      await this.em.removeAndFlush(process);
    }
    return process;
  }

  async exportData(userId: number): Promise<Process[]> {
    return this.processRepository.find(
      { user: userId },
      {
        populate: ['interactions', 'reviews', 'contacts'],
      },
    );
  }

  async importData(processes: any[], mode: 'overwrite' | 'append', userId: number): Promise<{ count: number }> {
    if (mode === 'overwrite') {
      const userProcesses = await this.processRepository.find({ user: userId });
      await this.em.removeAndFlush(userProcesses);
    }

    let count = 0;
    for (const p of processes) {
      const { id, interactions, reviews, contacts, _count, userId: oldUserId, ...processData } = p;

      // Convert date strings to Date objects
      if (processData.createdAt) processData.createdAt = new Date(processData.createdAt);
      if (processData.updatedAt) processData.updatedAt = new Date(processData.updatedAt);
      if (processData.initialInviteDate) processData.initialInviteDate = new Date(processData.initialInviteDate);
      if (processData.offerDeadline) processData.offerDeadline = new Date(processData.offerDeadline);
      if (processData.nextFollowUp) processData.nextFollowUp = new Date(processData.nextFollowUp);

      const process = this.processRepository.create({
        ...processData,
        user: this.em.getReference(User, userId),
      });

      // Add nested relations
      if (interactions && interactions.length > 0) {
        for (const i of interactions) {
          const { id, processId, ...iData } = i;
          if (iData.date) iData.date = new Date(iData.date);
          if (iData.nextInviteDate) iData.nextInviteDate = new Date(iData.nextInviteDate);
          if (iData.createdAt) iData.createdAt = new Date(iData.createdAt);
          
          const interaction = this.em.create(Interaction, { ...iData, process });
          process.interactions.add(interaction);
        }
      }

      if (reviews && reviews.length > 0) {
        for (const r of reviews) {
          const { id, processId, ...rData } = r;
          if (rData.createdAt) rData.createdAt = new Date(rData.createdAt);
          
          const review = this.em.create(SelfReview, { ...rData, process });
          process.reviews.add(review);
        }
      }

      if (contacts && contacts.length > 0) {
        for (const c of contacts) {
          const { id, processId, ...cData } = c;
          
          const contact = this.em.create(Contact, { ...cData, process });
          process.contacts.add(contact);
        }
      }

      this.em.persist(process);
      count++;
    }
    
    await this.em.flush();
    return { count };
  }

  /**
   * Automatically update processes to "No Response (14+ Days)" if:
   * - Last update was 14+ days ago
   * - Current stage is NOT "Rejected" / "Reject" / "Withdrawn"
   * - Current stage is NOT already "No Response (14+ Days)"
   */
  private async updateStaleProcesses(): Promise<void> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    try {
      const staleProcesses = await this.processRepository.find({
        updatedAt: { $lte: fourteenDaysAgo },
        currentStage: { $nin: [...this.CLOSED_STAGE_LABELS, 'No Response (14+ Days)'] },
      });

      if (staleProcesses.length > 0) {
        for (const process of staleProcesses) {
          process.currentStage = 'No Response (14+ Days)';
        }
        await this.em.flush();
        console.log(
          `Automatically updated ${staleProcesses.length} process(es) to "No Response (14+ Days)"`,
        );
      }
    } catch (error) {
      console.error('Error updating stale processes:', error);
      // Don't throw error to avoid breaking the main query
    }
  }
}