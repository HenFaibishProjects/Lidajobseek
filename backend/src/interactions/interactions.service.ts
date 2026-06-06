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
import { RecruitmentAgency } from '../recruitment-agencies/recruitment-agency.entity';
import { CreateInteractionDto, ReminderItemDto } from './dto/create-interaction.dto';
import { MailService } from '../mail/mail.service';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

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
    private readonly whatsappReminderService: WhatsAppReminderService,
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

    const email = reminder?.channels?.email !== false;
    const normalizedChannels = { email };

    const sendWhatsAppReminder = reminder.sendWhatsAppReminder === true;

    const sameConfigAsExisting =
      existingReminder?.beforeMinutes === beforeMinutes &&
      existingReminder?.channels?.email === normalizedChannels.email &&
      existingReminder?.sendWhatsAppReminder === sendWhatsAppReminder;

    const preserveDeliveryState = sameConfigAsExisting && !resetDeliveryState;

    return {
      enabled: true,
      beforeMinutes,
      channels: normalizedChannels,
      sendWhatsAppReminder,
      emailSentAt: preserveDeliveryState ? existingReminder?.emailSentAt : undefined,
      whatsAppSentAt: preserveDeliveryState ? existingReminder?.whatsAppSentAt : undefined,
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

    const seen = new Set<number>();
    const result: Interaction['reminders'] = [];

    for (const r of reminders) {
      const beforeMinutesRaw = Number(r.beforeMinutes);
      if (!Number.isFinite(beforeMinutesRaw) || beforeMinutesRaw <= 0) continue;
      if (seen.has(beforeMinutesRaw)) continue; // deduplicate
      seen.add(beforeMinutesRaw);

      const email = r.channels?.email !== false;
      const channels = { email };
      const sendWhatsAppReminder = (r as any).sendWhatsAppReminder === true;

      // Try to find matching existing entry to preserve delivery state
      const existing = existingReminders?.find(
        (e: any) => Number(e.beforeMinutes) === beforeMinutesRaw,
      );
      const sameConfig =
        existing?.channels?.email === channels.email &&
        existing?.sendWhatsAppReminder === sendWhatsAppReminder;

      result.push({
        beforeMinutes: beforeMinutesRaw,
        channels,
        sendWhatsAppReminder,
        emailSentAt: sameConfig && !resetDeliveryState ? existing?.emailSentAt : undefined,
        whatsAppSentAt: sameConfig && !resetDeliveryState ? existing?.whatsAppSentAt : undefined,
      });
    }

    return result;
  }

  private buildReminderEmail(interaction: Interaction, beforeMinutes: number) {
    const interviewDate = new Date(interaction.date);

    let subject: string;
    if (interaction.process) {
      subject = `Interview reminder: ${interaction.process.companyName} - ${interaction.process.roleTitle}`;
    } else if ((interaction as any).agency) {
      subject = `Meeting reminder: ${(interaction as any).agency.agencyName}`;
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
      (interaction as any).agency ? `Recruiter / Agency: ${(interaction as any).agency.agencyName}` : '',
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
          ${(interaction as any).agency ? `<li><strong>Recruiter / Agency:</strong> ${(interaction as any).agency.agencyName}</li>` : ''}
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
    const smtpOk = this.mailService.isConfigured();
    const greenApiOk = this.whatsappReminderService.isConfigured();

    if (!smtpOk && !greenApiOk) {
      this.logger.warn('Neither Mail nor GREEN-API WhatsApp is configured — reminders disabled.');
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
          { populate: ['process', 'agency'], orderBy: { date: QueryOrder.ASC } },
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

          const beforeMinutes = Number(r.beforeMinutes);
          if (!Number.isFinite(beforeMinutes) || beforeMinutes <= 0) {
            this.logger.debug(`  [${idx}] invalid beforeMinutes: ${r.beforeMinutes}`);
            continue;
          }

          const reminderTime = new Date(interaction.date.getTime() - beforeMinutes * 60 * 1000);
          if (reminderTime > now) continue;

          // --- 1. Process Email Channel ---
          if (r.channels?.email && !r.emailSentAt) {
            if (smtpOk) {
              const ownerRef = (interaction.process || (interaction as any).agency) as any;
              if (ownerRef?.user) {
                const userId = ownerRef.user?.id ?? ownerRef.user;
                const user = await em.findOne('User' as any, { id: userId }) as any;
                const recipientEmail = user?.email;
                if (recipientEmail) {
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
                    r.emailSentAt = now.toISOString();
                    remindersChanged = true;
                  } else {
                    this.logger.error(`  [${idx}] ✗ mailService.sendMail returned false for ${recipientEmail}`);
                  }
                } else {
                  this.logger.warn(`  [${idx}] Could not resolve email for user id=${userId}`);
                }
              } else {
                this.logger.warn(`  [${idx}] No user on process or agency — skipping email.`);
              }
            } else {
              this.logger.warn(`  [${idx}] Mail not configured — skipping email reminder.`);
            }
          }

          // --- 2. Process WhatsApp Channel ---
          if (r.sendWhatsAppReminder && !r.whatsAppSentAt) {
            if (greenApiOk) {
              this.logger.log(`  [${idx}] Sending WhatsApp reminder via GREEN-API for interaction #${interaction.id}`);
              const text = this.whatsappReminderService.buildReminderWhatsAppText(interaction);
              await this.whatsappReminderService.sendInterviewReminder(text);
              r.whatsAppSentAt = now.toISOString();
              remindersChanged = true;
            } else {
              this.logger.warn(`  [${idx}] GREEN-API not configured — skipping WhatsApp reminder.`);
            }
          }
        }

        if (remindersChanged) {
          (interaction as any).reminders = remindersArr;
          hasChanges = true;
        }

        // ── LEGACY: single reminder object ──────────────────────────
        const reminder = interaction.reminder as any;
        if (reminder?.enabled) {
          const beforeMinutes = Number(reminder.beforeMinutes);
          if (Number.isFinite(beforeMinutes) && beforeMinutes > 0) {
            const reminderTime = new Date(interaction.date.getTime() - beforeMinutes * 60 * 1000);
            if (reminderTime <= now) {
              let legacyChanged = false;
              const newReminderState = { ...reminder };

              // --- 1. Process Email ---
              if (reminder.channels?.email && !reminder.emailSentAt) {
                if (smtpOk) {
                  const ownerRef = (interaction.process || (interaction as any).agency) as any;
                  if (ownerRef?.user) {
                    const userId = ownerRef.user?.id ?? ownerRef.user;
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
                        newReminderState.emailSentAt = now.toISOString();
                        legacyChanged = true;
                      }
                    }
                  }
                } else {
                  this.logger.warn(`  [legacy] Mail not configured — skipping email reminder.`);
                }
              }

              // --- 2. Process WhatsApp ---
              if (reminder.sendWhatsAppReminder && !reminder.whatsAppSentAt) {
                if (greenApiOk) {
                  this.logger.log(`  [legacy] Sending WhatsApp reminder via GREEN-API for interaction #${interaction.id}`);
                  const text = this.whatsappReminderService.buildReminderWhatsAppText(interaction);
                  await this.whatsappReminderService.sendInterviewReminder(text);
                  newReminderState.whatsAppSentAt = now.toISOString();
                  legacyChanged = true;
                } else {
                  this.logger.warn(`  [legacy] GREEN-API not configured — skipping WhatsApp reminder.`);
                }
              }

              if (legacyChanged) {
                interaction.reminder = newReminderState;
                hasChanges = true;
              }
            }
          }
        }
      }

      if (hasChanges) {
        await em.flush();
      }
    } catch (error) {
      this.logger.error('Failed to process reminder emails/whatsapps', error as any);
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
          { populate: ['process', 'agency'], orderBy: { date: QueryOrder.ASC } },
        );

      const report: any[] = [];
      const smtpOk = this.mailService.isConfigured();
      const greenApiOk = this.whatsappReminderService.isConfigured();

      for (const interaction of interactions) {
        const remindersArr = Array.isArray((interaction as any).reminders)
          ? (interaction as any).reminders
          : [];

        const ownerRef = (interaction.process || (interaction as any).agency) as any;
        const userId = ownerRef?.user?.id ?? ownerRef?.user;
        const user = userId ? (await em.findOne('User' as any, { id: userId }) as any) : null;
        const recipientEmail = user?.email ?? null;

        const reminderStatuses = remindersArr.map((r: any, idx: number) => {
          const reminderTime = new Date(interaction.date.getTime() - Number(r.beforeMinutes) * 60 * 1000);
          return {
            index: idx,
            beforeMinutes: r.beforeMinutes,
            channels: r.channels,
            sendWhatsAppReminder: r.sendWhatsAppReminder ?? false,
            reminderFiresAt: reminderTime.toISOString(),
            isDue: reminderTime <= now,
            alreadySent: !!r.emailSentAt,
            emailSentAt: r.emailSentAt ?? null,
            whatsAppSentAt: r.whatsAppSentAt ?? null,
          };
        });

        report.push({
          interactionId: interaction.id,
          interviewDate: interaction.date.toISOString(),
          recipientEmail,
          smtpConfigured: smtpOk,
          greenApiConfigured: greenApiOk,
          reminders: reminderStatuses,
        });

        // Force-send any due, unsent reminders if requested
        if (forceAll) {
          let remindersChanged = false;
          for (let idx = 0; idx < remindersArr.length; idx++) {
            const r = remindersArr[idx] as any;
            const reminderTime = new Date(interaction.date.getTime() - Number(r.beforeMinutes) * 60 * 1000);
            if (reminderTime > now) continue;

            if (r.channels?.email && !r.emailSentAt && smtpOk && recipientEmail) {
              const mail = this.buildReminderEmail(interaction, r.beforeMinutes);
              const sent = await this.mailService.sendMail({ to: recipientEmail, ...mail });
              if (sent) {
                remindersArr[idx] = { ...remindersArr[idx], emailSentAt: now.toISOString() };
                reminderStatuses[idx].emailSentAt = now.toISOString();
                remindersChanged = true;
              }
            }

            if (r.sendWhatsAppReminder && !r.whatsAppSentAt && greenApiOk) {
              const text = this.whatsappReminderService.buildReminderWhatsAppText(interaction);
              await this.whatsappReminderService.sendInterviewReminder(text);
              remindersArr[idx] = { ...remindersArr[idx], whatsAppSentAt: now.toISOString() };
              reminderStatuses[idx].whatsAppSentAt = now.toISOString();
              remindersChanged = true;
            }
          }
          if (remindersChanged) {
            (interaction as any).reminders = remindersArr;
            await em.flush();
          }
        }
      }

      return {
        now: now.toISOString(),
        smtpConfigured: smtpOk,
        greenApiConfigured: greenApiOk,
        interactions: report,
      };
    } finally {
      em.clear();
    }
  }

  async create(dto: CreateInteractionDto, user?: any): Promise<Interaction> {
    this.logger.log(`Creating interaction for process/agency. Process: ${dto.processId}, Agency: ${dto.agencyId}, User: ${user?.id || user?.userId}`);
    
    try {
      const userId = Number(user?.id || user?.userId);

      if (!userId) {
        throw new Error('User identity is missing or invalid');
      }

      let process: Process | undefined;
      if (dto.processId && !Number.isNaN(Number(dto.processId))) {
        const processId = Number(dto.processId);
        process = await this.processRepository.findOne({ 
          id: processId, 
          user: userId 
        }) || undefined;

        if (!process) {
          this.logger.warn(`Process ${processId} not found for user ${userId}`);
          throw new NotFoundException(`Process with ID ${processId} not found`);
        }
      }

      let agency: any;
      if (dto.agencyId && !Number.isNaN(Number(dto.agencyId))) {
        const agencyId = Number(dto.agencyId);
        agency = await this.em.findOne(RecruitmentAgency, {
          id: agencyId,
          user: userId
        }) || undefined;

        if (!agency) {
          this.logger.warn(`Agency ${agencyId} not found for user ${userId}`);
          throw new NotFoundException(`Agency with ID ${agencyId} not found`);
        }
      }

      if (!process && !agency) {
        throw new Error('Either processId or agencyId must be provided and valid');
      }

      // 1. Create the Interaction entity
      const interaction = this.interactionRepository.create({
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
        agency,
      } as any);

      this.em.persist(interaction);

      // 2. Handle Contacts Synchronization (only if linked to a process)
      if (process && dto.participants && Array.isArray(dto.participants)) {
        for (const participant of dto.participants) {
          if (!participant || !participant.name) continue;

          const existingContact = await this.contactRepository.findOne({
            process: process.id,
            name: participant.name,
          });

          if (!existingContact) {
            const contact = this.contactRepository.create({
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

      // 3. Update the process's current stage and updatedAt (only if process is set)
      if (process) {
        process.updatedAt = new Date();
      }

      await this.em.flush();
      this.logger.log(`Successfully created interaction ${interaction.id}`);
      
      return interaction;
    } catch (error) {
      this.logger.error(`Failed to create interaction: ${error.message}`, error.stack);
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
      where.$or = [
        { process: { user: params.userId } },
        { agency: { user: params.userId } }
      ];
    }

    if (params.startDate) {
      where.date = { $gte: new Date(params.startDate) };
    }

    if (params.endDate) {
      if (!where.date) where.date = {};
      where.date.$lte = new Date(params.endDate);
    }

    const interactions = await this.interactionRepository.find(where, {
      populate: ['process', 'agency'],
      orderBy: { date: QueryOrder.ASC },
    });

    return interactions.map(i => ({
      ...i,
      processId: i.process?.id || null,
      agencyId: i.agency?.id || null
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
    const userId = user?.userId ?? user?.id;
    const interaction = await this.interactionRepository.findOne({
      id,
      $or: [
        { process: { user: userId } },
        { agency: { user: userId } }
      ]
    });
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
    const interaction = await this.interactionRepository.findOne({
      id,
      $or: [
        { process: { user: userId } },
        { agency: { user: userId } }
      ]
    });
    if (!interaction) {
      throw new NotFoundException(`Interaction with ID ${id} not found`);
    }
    await this.em.removeAndFlush(interaction);
    return interaction;
  }

  async exportData(userId: number): Promise<any[]> {
    const interactions = await this.interactionRepository.find({
      $or: [
        { process: { user: userId } },
        { agency: { user: userId } }
      ]
    }, {
      populate: ['process', 'agency'],
    });

    return interactions.map(interaction => ({
      ...interaction,
      process: interaction.process ? {
        id: interaction.process.id,
        companyName: interaction.process.companyName,
        roleTitle: interaction.process.roleTitle,
      } : undefined,
      processId: interaction.process?.id || null,
      agency: (interaction as any).agency ? {
        id: (interaction as any).agency.id,
        agencyName: (interaction as any).agency.agencyName,
      } : undefined,
      agencyId: (interaction as any).agency?.id || null,
    }));
  }

  async importData(interactions: any[], mode: 'overwrite' | 'append', userId: number): Promise<{ count: number }> {
    if (mode === 'overwrite') {
      const allInteractions = await this.interactionRepository.find({
        $or: [
          { process: { user: userId } },
          { agency: { user: userId } }
        ]
      });
      await this.em.removeAndFlush(allInteractions);
    }

    let count = 0;
    for (const i of interactions) {
      const { id, process, agency, ...interactionData } = i;

      // Convert date strings to Date objects
      if (interactionData.date) interactionData.date = new Date(interactionData.date);
      if (interactionData.nextInviteDate) interactionData.nextInviteDate = new Date(interactionData.nextInviteDate);
      if (interactionData.createdAt) interactionData.createdAt = new Date(interactionData.createdAt);

      // Check if process exists and belongs to user
      let processExists = null;
      if (interactionData.processId) {
        processExists = await this.processRepository.findOne({ id: interactionData.processId, user: userId });
      }

      // Check if agency exists and belongs to user
      let agencyExists = null;
      if (interactionData.agencyId) {
        agencyExists = await this.em.findOne(RecruitmentAgency, { id: interactionData.agencyId, user: userId });
      }

      if (processExists || agencyExists) {
        const { processId, agencyId, ...data } = interactionData;
        const interaction = this.interactionRepository.create({
          ...data,
          process: processExists || undefined,
          agency: agencyExists || undefined,
        } as any);
        this.em.persist(interaction);
        count++;
      }
    }

    await this.em.flush();
    return { count };
  }
}