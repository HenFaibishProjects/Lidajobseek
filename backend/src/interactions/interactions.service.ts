import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { Interaction } from './interaction.entity';
import { Process } from '../processes/process.entity';
import { Contact } from '../contacts/contact.entity';
import { CreateInteractionDto, ReminderItemDto } from './dto/create-interaction.dto';
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

  /**
   * Sanitize and normalize a reminders[] array.
   * Each entry gets its own beforeMinutes + channels object.
   * Delivery state (emailSentAt) is preserved when config is unchanged.
   */
  private sanitizeRemindersArray(
    reminders: ReminderItemDto[],
    user: any,
    existingReminders?: any[],
    resetDeliveryState = false,
  ): Interaction['reminders'] {
    if (!Array.isArray(reminders) || reminders.length === 0) return [];

    const pricingPlan = user?.pricingPlan || 'free';
    const isPremium = pricingPlan === 'premium' || pricingPlan === 'enterprise';

    const seen = new Set<number>();
    const result: Interaction['reminders'] = [];

    for (const r of reminders) {
      const beforeMinutesRaw = Number(r.beforeMinutes);
      if (!Number.isFinite(beforeMinutesRaw) || beforeMinutesRaw <= 0) continue;
      if (seen.has(beforeMinutesRaw)) continue; // deduplicate
      seen.add(beforeMinutesRaw);

      const email = r.channels?.email !== false;
      const sms = isPremium ? r.channels?.sms === true : false;
      const channels = email || sms ? { email, sms } : { email: true, sms: false };

      // Try to find matching existing entry to preserve delivery state
      const existing = existingReminders?.find(
        (e: any) => Number(e.beforeMinutes) === beforeMinutesRaw,
      );
      const sameConfig =
        existing?.channels?.email === channels.email &&
        existing?.channels?.sms === channels.sms;

      result.push({
        beforeMinutes: beforeMinutesRaw,
        channels,
        emailSentAt: sameConfig && !resetDeliveryState ? existing?.emailSentAt : undefined,
        smsSentAt: sameConfig && !resetDeliveryState ? existing?.smsSentAt : undefined,
      });
    }

    return result;
  }

  private buildReminderEmail(interaction: Interaction, beforeMinutes: number) {
    const interviewDate = new Date(interaction.date);

    let subject: string;
    if (interaction.process) {
      subject = `Interview reminder: ${interaction.process.companyName} - ${interaction.process.roleTitle}`;
    } else {
      subject = `Interview reminder: ${interaction.interviewType}`;
    }

    const dateText = interviewDate.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const summary = interaction.summary || 'Interview';
    const interviewType = interaction.interviewType || 'interview';
    const minutesLabel = beforeMinutes >= 60
      ? `${beforeMinutes / 60} hour(s)`
      : `${beforeMinutes} minute(s)`;

    const text = [
      `Hi,`,
      '',
      `This is your reminder for an upcoming ${interviewType} interview in ${minutesLabel}.`,
      interaction.process ? `Company: ${interaction.process.companyName}` : '',
      interaction.process ? `Role: ${interaction.process.roleTitle}` : '',
      `When: ${dateText}`,
      `Summary: ${summary}`,
      '',
      'Good luck! 🚀',
    ].filter(Boolean).join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hi,</p>
        <p>This is your reminder for an upcoming <strong>${interviewType}</strong> interview in <strong>${minutesLabel}</strong>.</p>
        <ul>
          ${interaction.process ? `<li><strong>Company:</strong> ${interaction.process.companyName}</li>` : ''}
          ${interaction.process ? `<li><strong>Role:</strong> ${interaction.process.roleTitle}</li>` : ''}
          <li><strong>When:</strong> ${dateText}</li>
          <li><strong>Summary:</strong> ${summary}</li>
        </ul>
        <p>Good luck! 🚀</p>
      </div>
    `;

    return { subject, text, html };
  }

  private async processDueEmailReminders() {
    if (this.isProcessingReminders) {
      this.logger.debug('Reminder job already running, skipping.');
      return;
    }
    if (!this.mailService.isConfigured()) {
      this.logger.warn('Mail not configured — reminder emails disabled.');
      return;
    }

    this.isProcessingReminders = true;
    const em = this.em.fork({ clear: true, useContext: false });

    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

      const upcomingInteractions = await em
        .getRepository(Interaction)
        .find(
          { date: { $gte: now, $lte: horizon } },
          { populate: ['process'], orderBy: { date: QueryOrder.ASC } },
        );

      this.logger.debug(
        `Reminder tick: ${upcomingInteractions.length} upcoming interaction(s) in next 7 days.`,
      );

      let hasChanges = false;

      for (const interaction of upcomingInteractions) {
        // ── NEW: iterate reminders[] array ──────────────────────────
        const remindersArr = Array.isArray((interaction as any).reminders)
          ? [...(interaction as any).reminders]
          : [];

        this.logger.debug(
          `Interaction #${interaction.id} date=${interaction.date.toISOString()} ` +
          `reminders[]:${remindersArr.length} legacy:${!!(interaction.reminder as any)?.enabled}`,
        );

        let remindersChanged = false;
        for (let idx = 0; idx < remindersArr.length; idx++) {
          const r = remindersArr[idx] as any;

          if (r?.emailSentAt) {
            this.logger.debug(`  [${idx}] beforeMinutes=${r.beforeMinutes} — already sent at ${r.emailSentAt}`);
            continue;
          }
          if (!r?.channels?.email) {
            this.logger.debug(`  [${idx}] beforeMinutes=${r.beforeMinutes} — email channel disabled`);
            continue;
          }

          const beforeMinutes = Number(r.beforeMinutes);
          if (!Number.isFinite(beforeMinutes) || beforeMinutes <= 0) {
            this.logger.debug(`  [${idx}] invalid beforeMinutes: ${r.beforeMinutes}`);
            continue;
          }

          const reminderTime = new Date(interaction.date.getTime() - beforeMinutes * 60 * 1000);
          this.logger.debug(
            `  [${idx}] beforeMinutes=${beforeMinutes} reminderTime=${reminderTime.toISOString()} now=${now.toISOString()} due=${reminderTime <= now}`,
          );

          if (reminderTime > now) continue;

          // Resolve user for recipient email
          const processRef = interaction.process as any;
          if (!processRef?.user) {
            this.logger.warn(`  [${idx}] No user on process — skipping.`);
            continue;
          }
          const userId = processRef.user?.id ?? processRef.user;
          const user = await em.findOne('User' as any, { id: userId }) as any;
          const recipientEmail = user?.email;
          if (!recipientEmail) {
            this.logger.warn(`  [${idx}] Could not resolve email for user id=${userId}`);
            continue;
          }

          this.logger.log(`  [${idx}] Sending reminder email to ${recipientEmail} for interaction #${interaction.id}`);
          const mail = this.buildReminderEmail(interaction, beforeMinutes);
          const sent = await this.mailService.sendMail({
            to: recipientEmail,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });

          if (sent) {
            this.logger.log(`  [${idx}] ✓ Reminder email sent successfully to ${recipientEmail}`);
            remindersArr[idx] = { ...r, emailSentAt: now.toISOString() };
            remindersChanged = true;
          } else {
            this.logger.error(`  [${idx}] ✗ mailService.sendMail returned false for ${recipientEmail}`);
          }
        }

        if (remindersChanged) {
          (interaction as any).reminders = remindersArr;
          hasChanges = true;
        }

        // ── LEGACY: single reminder object ──────────────────────────
        const reminder = interaction.reminder as any;
        if (reminder?.enabled && reminder?.channels?.email && !reminder?.emailSentAt) {
          const beforeMinutes = Number(reminder.beforeMinutes);
          if (Number.isFinite(beforeMinutes) && beforeMinutes > 0) {
            const reminderTime = new Date(interaction.date.getTime() - beforeMinutes * 60 * 1000);
            this.logger.debug(
              `  [legacy] beforeMinutes=${beforeMinutes} reminderTime=${reminderTime.toISOString()} due=${reminderTime <= now}`,
            );
            if (reminderTime <= now) {
              const processRef = interaction.process as any;
              if (processRef?.user) {
                const userId = processRef.user?.id ?? processRef.user;
                const user = await em.findOne('User' as any, { id: userId }) as any;
                const recipientEmail = user?.email;
                if (recipientEmail) {
                  const mail = this.buildReminderEmail(interaction, beforeMinutes);
                  const sent = await this.mailService.sendMail({
                    to: recipientEmail,
                    subject: mail.subject,
                    text: mail.text,
                    html: mail.html,
                  });
                  if (sent) {
                    this.logger.log(`  [legacy] ✓ Reminder email sent to ${recipientEmail}`);
                    interaction.reminder = { ...reminder, emailSentAt: now.toISOString() };
                    hasChanges = true;
                  }
                }
              }
            }
          }
        }
      }

      if (hasChanges) {
        await em.flush();
      }
    } catch (error) {
      this.logger.error('Failed to process reminder emails', error as any);
    } finally {
      em.clear();
      this.isProcessingReminders = false;
    }
  }

  /** Debug endpoint: returns status of all upcoming reminders and can force-send due ones */
  async debugReminders(forceAll = false): Promise<any> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
    const em = this.em.fork({ clear: true, useContext: false });

    try {
      const interactions = await em
        .getRepository(Interaction)
        .find(
          { date: { $gte: new Date(now.getTime() - 1000 * 60 * 60 * 24), $lte: horizon } },
          { populate: ['process'], orderBy: { date: QueryOrder.ASC } },
        );

      const report: any[] = [];
      const smtpOk = this.mailService.isConfigured();

      for (const interaction of interactions) {
        const remindersArr = Array.isArray((interaction as any).reminders)
          ? (interaction as any).reminders
          : [];

        const processRef = interaction.process as any;
        const userId = processRef?.user?.id ?? processRef?.user;
        const user = userId ? (await em.findOne('User' as any, { id: userId }) as any) : null;
        const recipientEmail = user?.email ?? null;

        const reminderStatuses = remindersArr.map((r: any, idx: number) => {
          const reminderTime = new Date(interaction.date.getTime() - Number(r.beforeMinutes) * 60 * 1000);
          return {
            index: idx,
            beforeMinutes: r.beforeMinutes,
            channels: r.channels,
            reminderFiresAt: reminderTime.toISOString(),
            isDue: reminderTime <= now,
            alreadySent: !!r.emailSentAt,
            emailSentAt: r.emailSentAt ?? null,
          };
        });

        report.push({
          interactionId: interaction.id,
          interviewDate: interaction.date.toISOString(),
          recipientEmail,
          smtpConfigured: smtpOk,
          reminders: reminderStatuses,
        });

        // Force-send any due, unsent reminders if requested
        if (forceAll && smtpOk && recipientEmail) {
          for (let idx = 0; idx < remindersArr.length; idx++) {
            const r = remindersArr[idx] as any;
            if (r.emailSentAt) continue;
            const reminderTime = new Date(interaction.date.getTime() - Number(r.beforeMinutes) * 60 * 1000);
            if (reminderTime > now) continue;
            const mail = this.buildReminderEmail(interaction, r.beforeMinutes);
            const sent = await this.mailService.sendMail({ to: recipientEmail, ...mail });
            reminderStatuses[idx].forceSentNow = sent;
            if (sent) {
              remindersArr[idx] = { ...r, emailSentAt: now.toISOString() };
              (interaction as any).reminders = remindersArr;
            }
          }
          await em.flush();
        }
      }

      return { now: now.toISOString(), smtpConfigured: smtpOk, interactions: report };
    } finally {
      em.clear();
    }
  }

  async create(dto: CreateInteractionDto, user?: any): Promise<Interaction> {
    this.logger.log(`Creating interaction for process ${dto.processId} and user ${user?.id || user?.userId}`);
    
    try {
      const userId = Number(user?.id || user?.userId);
      const processId = Number(dto.processId);

      if (!userId) {
        throw new Error('User identity is missing or invalid');
      }

      const process = await this.processRepository.findOne({ 
        id: processId, 
        user: userId 
      });

      if (!process) {
        this.logger.warn(`Process ${processId} not found for user ${userId}`);
        throw new NotFoundException(`Process with ID ${processId} not found`);
      }

      // 1. Create the Interaction entity
      const interaction = this.em.create(Interaction, {
        date: new Date(dto.date),
        interviewType: dto.interviewType,
        participants: dto.participants,
        summary: dto.summary,
        headsup: dto.headsup,
        notes: dto.notes,
        nextInviteDate: dto.nextInviteDate ? new Date(dto.nextInviteDate) : undefined,
        testsAssessment: dto.testsAssessment,
        roleInsights: dto.roleInsights,
        // Legacy single reminder
        reminder: this.sanitizeReminder(dto.reminder, user),
        // New: reminders[] array (takes priority if provided)
        reminders: dto.reminders?.length
          ? this.sanitizeRemindersArray(dto.reminders, user)
          : undefined,
        process,
      } as any);

      this.em.persist(interaction);

      // 2. Handle Contacts Synchronization
      if (dto.participants && Array.isArray(dto.participants)) {
        for (const participant of dto.participants) {
          if (!participant || !participant.name) continue;

          const existingContact = await this.contactRepository.findOne({
            process: processId,
            name: participant.name,
          });

          if (!existingContact) {
            const contact = this.em.create(Contact, {
              name: participant.name,
              role: participant.role,
              email: participant.email,
              phone: participant.phone,
              linkedIn: participant.linkedIn,
              socialHooks: participant.socialHooks,
              process,
            } as any);
            this.em.persist(contact);
          } else {
            // Optional: Update existing contact details if they are richer now
            this.em.assign(existingContact, {
              role: participant.role || existingContact.role,
              email: participant.email || existingContact.email,
              phone: participant.phone || existingContact.phone,
              linkedIn: participant.linkedIn || existingContact.linkedIn,
              socialHooks: participant.socialHooks || existingContact.socialHooks,
            });
          }
        }
      }

      // 3. Update the process's current stage and updatedAt
      process.updatedAt = new Date();
      // If this is a new interaction, it might imply a stage update? 
      // For now we just ensure updatedAt is bumped.

      await this.em.flush();
      this.logger.log(`Successfully created interaction ${interaction.id}`);
      
      return interaction;
    } catch (error) {
      this.logger.error(`Failed to create interaction for process ${dto.processId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(params: {
    processId?: number;
    startDate?: string;
    endDate?: string;
    userId: number;
  }): Promise<any[]> {
    const where: any = {};
    
    if (params.processId) {
      where.process = { id: Number(params.processId), user: params.userId };
    } else {
      where.process = { user: params.userId };
    }

    if (params.startDate) {
      where.date = { $gte: new Date(params.startDate) };
    }

    if (params.endDate) {
      if (!where.date) where.date = {};
      where.date.$lte = new Date(params.endDate);
    }

    const interactions = await this.interactionRepository.find(where, {
      populate: ['process'],
      orderBy: { date: QueryOrder.ASC },
    });

    return interactions.map(i => ({
      ...i,
      processId: i.process.id
    }));
  }

  async findByProcess(processId: number, userId: number): Promise<any[]> {
    const interactions = await this.interactionRepository.find(
      { process: { id: processId, user: userId } },
      { orderBy: { date: QueryOrder.DESC } },
    );

    return interactions.map(i => ({
      ...i,
      processId: processId
    }));
  }

  async update(id: number, dto: any, user?: any): Promise<Interaction> {
    const interaction = await this.interactionRepository.findOne({ id, process: { user: user?.userId } });
    if (!interaction) {
      throw new NotFoundException(`Interaction with ID ${id} not found`);
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

    if (Object.prototype.hasOwnProperty.call(dto, 'reminders')) {
      data.reminders = Array.isArray(dto.reminders) && dto.reminders.length
        ? this.sanitizeRemindersArray(
            dto.reminders,
            user,
            (interaction as any).reminders,
            !!dto.date,
          )
        : [];
    }

    Object.assign(interaction, data);
    await this.em.flush();
    return interaction;
  }

  async remove(id: number, userId: number): Promise<Interaction> {
    const interaction = await this.interactionRepository.findOne({ id, process: { user: userId } });
    if (!interaction) {
      throw new NotFoundException(`Interaction with ID ${id} not found`);
    }
    await this.em.removeAndFlush(interaction);
    return interaction;
  }

  async exportData(userId: number): Promise<any[]> {
    const interactions = await this.interactionRepository.find({
      process: { user: userId }
    }, {
      populate: ['process'],
    });

    return interactions.map(interaction => ({
      ...interaction,
      process: {
        id: interaction.process.id,
        companyName: interaction.process.companyName,
        roleTitle: interaction.process.roleTitle,
      },
      processId: interaction.process.id,
    }));
  }

  async importData(interactions: any[], mode: 'overwrite' | 'append', userId: number): Promise<{ count: number }> {
    if (mode === 'overwrite') {
      const allInteractions = await this.interactionRepository.find({ process: { user: userId } });
      await this.em.removeAndFlush(allInteractions);
    }

    let count = 0;
    for (const i of interactions) {
      const { id, process, ...interactionData } = i;

      // Convert date strings to Date objects
      if (interactionData.date) interactionData.date = new Date(interactionData.date);
      if (interactionData.nextInviteDate) interactionData.nextInviteDate = new Date(interactionData.nextInviteDate);
      if (interactionData.createdAt) interactionData.createdAt = new Date(interactionData.createdAt);

      // Check if process exists and belongs to user
      const processExists = await this.processRepository.findOne({ id: interactionData.processId, user: userId });

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