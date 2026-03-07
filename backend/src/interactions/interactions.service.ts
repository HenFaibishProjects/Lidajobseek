import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { Interaction } from './interaction.entity';
import { Process } from '../processes/process.entity';
import { Contact } from '../contacts/contact.entity';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class InteractionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InteractionsService.name);
  private reminderTimer?: NodeJS.Timeout;
  private isProcessingReminders = false;

  constructor(
    @InjectRepository(Interaction)
    private readonly interactionRepository: EntityRepository<Interaction>,
    @InjectRepository(Contact)
    private readonly contactRepository: EntityRepository<Contact>,
    @InjectRepository(Process)
    private readonly processRepository: EntityRepository<Process>,
    private readonly em: EntityManager,
    private readonly mailService: MailService,
  ) { }

  onModuleInit() {
    this.reminderTimer = setInterval(() => {
      void this.processDueEmailReminders();
    }, 60 * 1000);

    void this.processDueEmailReminders();
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
    }
  }

  private sanitizeReminder(
    reminder: any,
    user: any,
    existingReminder?: any,
    resetDeliveryState = false,
  ) {
    if (!reminder || reminder.enabled !== true) {
      return undefined;
    }

    const beforeMinutesRaw = Number(reminder.beforeMinutes);
    const beforeMinutes = Number.isFinite(beforeMinutesRaw) && beforeMinutesRaw > 0
      ? beforeMinutesRaw
      : 60;

    const pricingPlan = user?.pricingPlan || 'free';
    const isPremium = pricingPlan === 'premium' || pricingPlan === 'enterprise';

    const email = reminder?.channels?.email !== false;
    const smsRequested = reminder?.channels?.sms === true;
    const sms = isPremium ? smsRequested : false;

    const normalizedChannels = email || sms
      ? { email, sms }
      : { email: true, sms: false };

    const sameConfigAsExisting =
      existingReminder?.beforeMinutes === beforeMinutes &&
      existingReminder?.channels?.email === normalizedChannels.email &&
      existingReminder?.channels?.sms === normalizedChannels.sms;

    const preserveDeliveryState = sameConfigAsExisting && !resetDeliveryState;

    return {
      enabled: true,
      beforeMinutes,
      channels: normalizedChannels,
      emailSentAt: preserveDeliveryState ? existingReminder?.emailSentAt : undefined,
      smsSentAt: preserveDeliveryState ? existingReminder?.smsSentAt : undefined,
    };
  }

  private buildReminderEmail(interaction: Interaction) {
    const interviewDate = new Date(interaction.date);
    const subject = `Interview reminder: ${interaction.process.companyName} — ${interaction.process.roleTitle}`;

    const dateText = interviewDate.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const summary = interaction.summary || 'Interview';
    const interviewType = interaction.interviewType || 'interview';

    const text = [
      `Hi,`,
      '',
      `This is your reminder for an upcoming ${interviewType} interview.`,
      `Company: ${interaction.process.companyName}`,
      `Role: ${interaction.process.roleTitle}`,
      `When: ${dateText}`,
      `Summary: ${summary}`,
      '',
      'Good luck! 🚀',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hi,</p>
        <p>This is your reminder for an upcoming <strong>${interviewType}</strong> interview.</p>
        <ul>
          <li><strong>Company:</strong> ${interaction.process.companyName}</li>
          <li><strong>Role:</strong> ${interaction.process.roleTitle}</li>
          <li><strong>When:</strong> ${dateText}</li>
          <li><strong>Summary:</strong> ${summary}</li>
        </ul>
        <p>Good luck! 🚀</p>
      </div>
    `;

    return { subject, text, html };
  }

  private async processDueEmailReminders() {
    if (this.isProcessingReminders || !this.mailService.isConfigured()) {
      return;
    }

    this.isProcessingReminders = true;

    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

      const upcomingInteractions = await this.interactionRepository.find(
        {
          date: {
            $gte: now,
            $lte: horizon,
          },
        },
        {
          populate: ['process', 'process.user'],
          orderBy: { date: QueryOrder.ASC },
        },
      );

      let hasChanges = false;

      for (const interaction of upcomingInteractions) {
        const reminder = interaction.reminder as any;
        if (!reminder?.enabled || !reminder?.channels?.email || reminder?.emailSentAt) {
          continue;
        }

        const beforeMinutes = Number(reminder.beforeMinutes);
        if (!Number.isFinite(beforeMinutes) || beforeMinutes <= 0) {
          continue;
        }

        const reminderTime = new Date(interaction.date.getTime() - beforeMinutes * 60 * 1000);
        if (reminderTime > now) {
          continue;
        }

        const recipientEmail = interaction.process?.user?.email;
        if (!recipientEmail) {
          continue;
        }

        const mail = this.buildReminderEmail(interaction);
        const sent = await this.mailService.sendMail({
          to: recipientEmail,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });

        if (!sent) {
          continue;
        }

        interaction.reminder = {
          ...reminder,
          emailSentAt: now.toISOString(),
        };
        hasChanges = true;
      }

      if (hasChanges) {
        await this.em.flush();
      }
    } catch (error) {
      this.logger.error('Failed to process reminder emails', error as any);
    } finally {
      this.isProcessingReminders = false;
    }
  }

  async create(dto: CreateInteractionDto, user?: any): Promise<Interaction> {
    const process = await this.processRepository.findOne({ id: dto.processId });
    if (!process) {
      throw new Error('Process not found');
    }

    const interaction = this.interactionRepository.create({
      date: new Date(dto.date),
      interviewType: dto.interviewType,
      participants: dto.participants,
      summary: dto.summary,
      testsAssessment: dto.testsAssessment,
      roleInsights: dto.roleInsights,
      notes: dto.notes,
      headsup: dto.headsup,
      reminder: this.sanitizeReminder(dto.reminder, user),
      nextInviteStatus: dto.nextInviteStatus,
      nextInviteDate: dto.nextInviteDate ? new Date(dto.nextInviteDate) : undefined,
      nextInviteLink: dto.nextInviteLink,
      nextInviteType: dto.nextInviteType,
      invitationExtended: dto.invitationExtended,
      process,
    } as any);

    await this.em.persistAndFlush(interaction);

    // Auto-add network contacts
    if (dto.participants && Array.isArray(dto.participants)) {
      for (const p of dto.participants) {
        const participant = p as any;
        if (participant.name) {
          // Check if this contact already exists for this process
          const existingContact = await this.contactRepository.findOne({
            process: dto.processId,
            name: participant.name,
          });

          if (!existingContact) {
            const contact = this.contactRepository.create({
              name: participant.name,
              role: participant.role || 'Interviewer',
              process,
            } as any);
            await this.em.persistAndFlush(contact);
          }
        }
      }
    }

    return interaction;
  }

  async findAll(startDate?: string, endDate?: string, processId?: number): Promise<any[]> {
    const where: any = {};

    if (processId) {
      where.process = processId;
    }

    if (startDate && endDate) {
      where.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (startDate) {
      where.date = {
        $gte: new Date(startDate),
      };
    } else if (endDate) {
      where.date = {
        $lte: new Date(endDate),
      };
    }

    const interactions = await this.interactionRepository.find(where, {
      populate: ['process'],
      orderBy: { date: QueryOrder.ASC },
    });

    // Format response to match expected structure
    return interactions.map(interaction => ({
      ...interaction,
      process: {
        companyName: interaction.process.companyName,
        roleTitle: interaction.process.roleTitle,
      },
    }));
  }

  async findByProcess(processId: number): Promise<Interaction[]> {
    return this.interactionRepository.find(
      { process: processId },
      { orderBy: { date: QueryOrder.DESC } },
    );
  }

  async update(id: number, dto: any, user?: any): Promise<Interaction | null> {
    const interaction = await this.interactionRepository.findOne({ id });
    if (!interaction) {
      return null;
    }

    const data: any = { ...dto };
    if (dto.date) data.date = new Date(dto.date);
    if (dto.nextInviteDate) data.nextInviteDate = new Date(dto.nextInviteDate);

    if (dto.date && interaction.reminder?.enabled && !Object.prototype.hasOwnProperty.call(dto, 'reminder')) {
      data.reminder = {
        ...interaction.reminder,
        emailSentAt: undefined,
        smsSentAt: undefined,
      };
    }

    if (Object.prototype.hasOwnProperty.call(dto, 'reminder')) {
      data.reminder = this.sanitizeReminder(
        dto.reminder,
        user,
        interaction.reminder,
        !!dto.date,
      );
    }

    Object.assign(interaction, data);
    await this.em.flush();
    return interaction;
  }

  async remove(id: number): Promise<Interaction | null> {
    const interaction = await this.interactionRepository.findOne({ id });
    if (interaction) {
      await this.em.removeAndFlush(interaction);
    }
    return interaction;
  }

  async exportData(): Promise<any[]> {
    const interactions = await this.interactionRepository.findAll({
      populate: ['process'],
    });

    return interactions.map(interaction => ({
      ...interaction,
      process: {
        companyName: interaction.process.companyName,
        roleTitle: interaction.process.roleTitle,
      },
    }));
  }

  async importData(interactions: any[], mode: 'overwrite' | 'append'): Promise<{ count: number }> {
    if (mode === 'overwrite') {
      const allInteractions = await this.interactionRepository.findAll();
      await this.em.removeAndFlush(allInteractions);
    }

    let count = 0;
    for (const i of interactions) {
      const { id, process, ...interactionData } = i;

      // Convert date strings to Date objects
      if (interactionData.date) interactionData.date = new Date(interactionData.date);
      if (interactionData.nextInviteDate) interactionData.nextInviteDate = new Date(interactionData.nextInviteDate);
      if (interactionData.createdAt) interactionData.createdAt = new Date(interactionData.createdAt);

      // Check if process exists
      const processExists = await this.processRepository.findOne({ id: interactionData.processId });

      if (processExists) {
        const { processId, ...data } = interactionData;
        const interaction = this.interactionRepository.create({ ...data, process: processExists } as any);
        this.em.persist(interaction);
        count++;
      }
    }
    
    await this.em.flush();
    return { count };
  }
}