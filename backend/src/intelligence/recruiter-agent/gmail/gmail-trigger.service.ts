import { ResearchHandoffService } from '../handoff/research-handoff.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EmailProcessingAuditService } from '../audit/email-processing-audit.service';
import { RecruiterEmailPipelineService } from '../agent/recruiter-email-pipeline.service';
import { GmailClientService } from './gmail-client.service';
import { prefilterRecruiterEmail } from '../prefilter/recruiter-email-prefilter';
import type { IncomingEmail } from '../recruiter-agent.types';

@Injectable()
export class GmailTriggerService {
  private readonly logger = new Logger(GmailTriggerService.name);
  private polling = false;

  constructor(
    private readonly gmailClient: GmailClientService,
    private readonly audit: EmailProcessingAuditService,
    private readonly pipeline: RecruiterEmailPipelineService,
    private readonly handoffs: ResearchHandoffService,
    private readonly config: ConfigService,
  ) {}

  @Interval(60_000)
  async pollInbox(): Promise<void> {
    const enabled = this.config.get<boolean | string>('RECRUITER_GMAIL_POLLING_ENABLED');
    if (!(enabled === true || enabled === 'true')) return;
    if (this.polling) return;
    this.polling = true;
    try {
      // Durable unfinished work must not disappear when it leaves the latest inbox window.
      const processed = new Set<string>();
      const retryable = await this.audit.listRetryableEmails();
      await this.processEmails(retryable, processed);

      let recent: IncomingEmail[];
      try {
        recent = await this.gmailClient.getRecentInboxEmails(20);
      } catch (error) {
        this.logger.error(
          `Failed Gmail discovery (${error instanceof Error ? error.name : 'PollingError'})`,
        );
        return;
      }
      await this.processEmails(recent, processed);
    } catch (error) {
      this.logger.error(
        `Failed to poll Gmail inbox (${error instanceof Error ? error.name : 'PollingError'})`,
      );
    } finally {
      try {
        await this.handoffs.retryNotifications();
      } catch {
        this.logger.warn('Research handoff notification retry unavailable.');
      } finally {
        this.polling = false;
      }
    }
  }

  private async processEmails(
    emails: IncomingEmail[],
    processed: Set<string>,
  ): Promise<void> {
    for (const email of emails) {
      if (processed.has(email.id)) continue;
      processed.add(email.id);
      try {
        await this.pipeline.process(email, prefilterRecruiterEmail(email));
      } catch (error) {
        // Processing failures are recorded by the pipeline; continue the rest of the batch.
        this.logger.error(
          `Recruiter email ${email.id} failed (${error instanceof Error ? error.name : 'ProcessingError'})`,
        );
      }
    }
  }
}
