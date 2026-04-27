import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ProcessesService.name);
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

    // Sync Initial Interaction
    if (process.initialInviteDate) {
      await this.syncInitialInteraction(process);
    }

    return process;
  }

  private async syncInitialInteraction(process: Process): Promise<void> {
    // Check if an "Initial Interaction" already exists for this process
    const existing = await this.em.findOne(Interaction, {
      process,
      summary: { $like: 'Initial Interaction:%' }
    });

    const method = process.firstContactChannel || process.initialInviteMethod || 'Direct';
    const summary = `Initial Interaction: [${process.initiatedBy || 'Unknown'}] via ${method}`;
    
    if (existing) {
      // Update existing if needed
      existing.date = process.initialInviteDate!;
      existing.interviewType = this.mapInviteMethodToInterviewType(method);
      existing.summary = summary;
      existing.notes = process.initialInviteContent || 'Initial contact for this role.';
    } else {
      // Create new
      const interaction = this.em.create(Interaction, {
        process,
        date: process.initialInviteDate!,
        interviewType: this.mapInviteMethodToInterviewType(method),
        summary: summary,
        notes: process.initialInviteContent || 'Initial contact for this role.',
        createdAt: new Date(),
      });
      process.interactions.add(interaction);
      this.em.persist(interaction);
    }
    await this.em.flush();
  }

  private mapInviteMethodToInterviewType(method?: string): string {
    if (!method) return 'virtual_video';
    const m = method.toLowerCase();
    if (m.includes('linkedin')) return 'virtual_video';
    if (m.includes('email')) return 'virtual_video';
    if (m.includes('phone') || m.includes('call')) return 'phone_screen';
    if (m.includes('referral')) return 'coffee_chat';
    return 'virtual_video';
  }

  async findAll(userId: number): Promise<any[]> {
    // First, check and update any processes that need automatic stage update
    await this.updateStaleProcesses(userId);

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

  async findOne(id: number, userId: number): Promise<Process> {
    // First, check and update any processes that need automatic stage update
    await this.updateStaleProcesses(userId);

    const process = await this.processRepository.findOne(
      { id, user: userId },
      {
        populate: ['interactions', 'reviews', 'contacts'],
      },
    );

    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }

    // Sort interactions and reviews
    process.interactions.getItems().sort((a, b) => b.date.getTime() - a.date.getTime());
    process.reviews.getItems().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    (process as any).isClosed = this.isClosedStage(process.currentStage);

    return process;
  }

  async update(id: number, dto: any, userId: number): Promise<Process> {
    const process = await this.processRepository.findOne({ id, user: userId });
    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }

    // Explicitly destructure allowed fields to prevent mass assignment
    const {
      companyName,
      roleTitle,
      techStack,
      location,
      workMode,
      daysFromOffice,
      source,
      salaryExpectation,
      salaryCurrency,
      salaryPeriod,
      currentStage,
      dataFromThePhoneCall,
      initialInviteDate,
      initialInviteMethod,
      initiatedBy,
      firstContactChannel,
      initialInviteContent,
      baseSalary,
      equity,
      bonus,
      signingBonus,
      benefits,
      offerDeadline,
      nextFollowUp,
      scoreTech,
      scoreWLB,
      scoreGrowth,
      scoreVibe,
    } = dto;

    const data: any = {};
    if (companyName !== undefined) data.companyName = companyName;
    if (roleTitle !== undefined) data.roleTitle = roleTitle;
    if (techStack !== undefined) data.techStack = techStack;
    if (location !== undefined) data.location = location;
    if (workMode !== undefined) data.workMode = workMode;
    if (daysFromOffice !== undefined) data.daysFromOffice = daysFromOffice === '' ? null : daysFromOffice;
    if (source !== undefined) data.source = source;
    if (salaryExpectation !== undefined) data.salaryExpectation = salaryExpectation === '' ? null : salaryExpectation;
    if (salaryCurrency !== undefined) data.salaryCurrency = salaryCurrency;
    if (salaryPeriod !== undefined) data.salaryPeriod = salaryPeriod;
    if (currentStage !== undefined) data.currentStage = currentStage;
    if (dataFromThePhoneCall !== undefined) data.dataFromThePhoneCall = dataFromThePhoneCall;
    if (initialInviteDate !== undefined) data.initialInviteDate = initialInviteDate ? new Date(initialInviteDate) : null;
    if (initialInviteMethod !== undefined) data.initialInviteMethod = initialInviteMethod;
    if (initiatedBy !== undefined) data.initiatedBy = initiatedBy;
    if (firstContactChannel !== undefined) data.firstContactChannel = firstContactChannel;
    if (initialInviteContent !== undefined) data.initialInviteContent = initialInviteContent;
    if (baseSalary !== undefined) data.baseSalary = baseSalary === '' ? null : baseSalary;
    if (equity !== undefined) data.equity = equity;
    if (bonus !== undefined) data.bonus = bonus;
    if (signingBonus !== undefined) data.signingBonus = signingBonus === '' ? null : signingBonus;
    if (benefits !== undefined) data.benefits = benefits;
    if (offerDeadline !== undefined) data.offerDeadline = offerDeadline ? new Date(offerDeadline) : null;
    if (nextFollowUp !== undefined) data.nextFollowUp = nextFollowUp ? new Date(nextFollowUp) : null;
    if (scoreTech !== undefined) data.scoreTech = scoreTech;
    if (scoreWLB !== undefined) data.scoreWLB = scoreWLB;
    if (scoreGrowth !== undefined) data.scoreGrowth = scoreGrowth;
    if (scoreVibe !== undefined) data.scoreVibe = scoreVibe;

    Object.assign(process, data);
    await this.em.flush();

    // Sync Initial Interaction after update
    if (process.initialInviteDate) {
      await this.syncInitialInteraction(process);
    }

    return process;
  }

  async remove(id: number, userId: number): Promise<Process> {
    const process = await this.processRepository.findOne({ id, user: userId });
    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }
    await this.em.removeAndFlush(process);
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
  private async updateStaleProcesses(userId: number): Promise<void> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    try {
      const staleProcesses = await this.processRepository.find({
        user: userId,
        updatedAt: { $lte: fourteenDaysAgo },
        currentStage: { $nin: [...this.CLOSED_STAGE_LABELS, 'No Response (14+ Days)'] },
      });

      if (staleProcesses.length > 0) {
        for (const process of staleProcesses) {
          process.currentStage = 'No Response (14+ Days)';
        }
        await this.em.flush();
        this.logger.log(
          `Automatically updated ${staleProcesses.length} process(es) to "No Response (14+ Days)"`,
        );
      }
    } catch (error) {
      this.logger.error('Error updating stale processes:', error instanceof Error ? error.stack : error);
      // Don't throw error to avoid breaking the main query
    }
  }
}