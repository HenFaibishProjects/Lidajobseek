import { UNKNOWN_IMPORTED_SUMMARY } from './chatgpt-research-import.schema';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { CompanyHistoryRepository } from '../../company-history/company-history.repository';
import { CompanyRepository } from '../../company-intelligence/company.repository';
import type { CompanyReport } from '../../company-intelligence/company-report.schema';
import {
  COMPANY_CACHE_TTL_MS,
  normalizeLookup,
} from '../../company-intelligence/research-cache';
import type { RecruiterEmailAnalysis } from '../recruiter-email.schema';
import { NotificationEmailService } from '../notification/notification-email.service';
import { ResearchHandoffRepository } from './research-handoff.repository';
import {
  HANDOFF_RESEARCH_CHECKLIST,
  ResearchHandoffStatus,
} from './research-handoff.types';
import {
  buildChatGptResearchPrompt,
  handoffContext,
} from './research-handoff-prompt';
import type { ResearchHandoffEntity } from './research-handoff.entity';

@Injectable()
export class ResearchHandoffService {
  private readonly logger = new Logger(ResearchHandoffService.name);
  constructor(
    private readonly repository: ResearchHandoffRepository,
    private readonly history: CompanyHistoryRepository,
    private readonly companies: CompanyRepository,
    private readonly notifications: NotificationEmailService,
  ) {}

  async ensure(
    gmailMessageId: string,
    analysis: Omit<RecruiterEmailAnalysis, 'eventType'> & { eventType: string },
    quickReport?: CompanyReport,
  ): Promise<ResearchHandoffEntity> {
    if (!analysis.companyName?.trim())
      throw new BadRequestException(
        'Company identity is required for a research handoff.',
      );
    let handoff = await this.repository.findByMessage(gmailMessageId);
    if (!handoff) {
      const report =
        quickReport ?? (await this.findFreshResearch(analysis.companyName));
      if (!report)
        throw new BadRequestException(
          'QUICK company research is required before creating a handoff.',
        );
      const context = handoffContext(analysis, report);
      handoff = await this.repository.createOrFind(
        gmailMessageId,
        context,
        [...HANDOFF_RESEARCH_CHECKLIST],
        buildChatGptResearchPrompt(context),
      );
    }
    await this.notifySafely(handoff);
    return handoff;
  }

  async findFreshResearch(companyName: string): Promise<CompanyReport | null> {
    const companyId = await this.history.findCompanyIdByNormalizedName(
      normalizeLookup(companyName),
    );
    const reference = companyId
      ? await this.history.findLatestReportReference(companyId)
      : null;
    if (!reference) return null;
    const age = Date.now() - reference.researchedAt.getTime();
    if (age < 0 || age >= COMPANY_CACHE_TTL_MS) return null;
    const report = await this.companies.findReport(reference.reportId);
    if (!report) return null;
    const summary = (
      report.quickBrief?.whatTheyDo || report.companySummary
    ).trim();
    return summary && summary !== UNKNOWN_IMPORTED_SUMMARY ? report : null;
  }

  listPendingResearch(limit = 20, offset = 0) {
    return this.list('pending', limit, offset);
  }

  getResearchHandoff(id: string) {
    return this.detail(id);
  }

  completeResearchHandoff(id: string, result: unknown) {
    return this.completeHandoff(id, result);
  }

  async retryNotifications(): Promise<void> {
    if (!this.notifications.isConfigured()) return;
    for (const handoff of await this.repository.listNotifications())
      await this.notifySafely(handoff);
  }

  private async notifySafely(handoff: ResearchHandoffEntity): Promise<void> {
    if (
      handoff.notificationSentAt ||
      ![
        ResearchHandoffStatus.PENDING_CHATGPT,
        ResearchHandoffStatus.IN_PROGRESS,
      ].includes(handoff.status)
    )
      return;
    let attempt: number | undefined;
    try {
      if (!this.notifications.isConfigured()) {
        if (await this.repository.notificationUnconfigured(handoff.id))
          this.logger.warn({
            event: 'research-handoff-notification-unconfigured',
            handoffId: handoff.id,
          });
        return;
      }
      const claimed = await this.repository.claimNotification(handoff.id);
      if (!claimed) return;
      attempt = claimed.notificationAttempts;
      await this.notifications.sendHandoff(claimed);
      await this.repository.notificationSent(handoff.id, attempt);
      this.logger.log({
        event: 'research-handoff-notified',
        handoffId: handoff.id,
        attempt,
      });
    } catch {
      if (attempt !== undefined) {
        try {
          await this.repository.notificationFailed(
            handoff.id,
            attempt,
            'Notification delivery failed; retries are bounded.',
          );
        } catch {
          this.logger.warn({
            event: 'research-handoff-notification-state-unavailable',
            handoffId: handoff.id,
            attempt,
          });
        }
      }
      this.logger.warn({
        event: 'research-handoff-notification-failed',
        handoffId: handoff.id,
        attempt,
      });
    }
  }

  async get(id: string) {
    const handoff = await this.repository.findById(id);
    if (!handoff) throw new NotFoundException('Research handoff not found.');
    return handoff;
  }

  async startHandoff(id: string) {
    if (!(await this.repository.start(id))) {
      await this.get(id);
      throw new ConflictException('Only pending handoffs can be started.');
    }
    return this.get(id);
  }

  async completeHandoff(id: string, result?: unknown) {
    let serialized: string | null = null;
    if (result !== undefined) {
      const parsed = z.record(z.string(), z.json()).safeParse(result);
      if (!parsed.success)
        throw new BadRequestException('Research result must be a JSON object.');
      serialized = JSON.stringify(parsed.data);
      if (serialized.length > 100000)
        throw new BadRequestException('Research result is too large.');
    }
    if (!(await this.repository.complete(id, serialized))) {
      const existing = await this.get(id);
      if (existing.status === ResearchHandoffStatus.COMPLETED) return existing;
      throw new ConflictException('Cancelled handoffs cannot be completed.');
    }
    return this.get(id);
  }

  async list(
    status: ResearchHandoffStatus | 'pending' | undefined,
    limit = 20,
    offset = 0,
  ) {
    return (
      await this.repository.list(
        status,
        Math.min(100, Math.max(1, limit)),
        Math.max(0, offset),
      )
    ).map((handoff) => this.summary(handoff));
  }

  summary(handoff: ResearchHandoffEntity) {
    return {
      id: handoff.id,
      companyName: handoff.companyName,
      roleTitle: handoff.roleTitle,
      eventType: handoff.eventType,
      researchReason: handoff.researchReason,
      status: handoff.status,
      createdAt: handoff.createdAt.toISOString(),
      notificationSentAt: handoff.notificationSentAt?.toISOString() ?? null,
    };
  }

  async detail(id: string) {
    const handoff = await this.get(id);
    return {
      ...this.summary(handoff),
      recruiterName: handoff.recruiterName,
      existingReportId: handoff.existingReportId,
      context: handoff.context,
      requestedResearch: handoff.requestedResearch,
      chatGptPrompt: buildChatGptResearchPrompt(handoff.context),
      deepResearchResult: handoff.deepResearchResult,
      notificationError: handoff.notificationError,
      notificationAttempts: handoff.notificationAttempts,
      completedAt: handoff.completedAt?.toISOString() ?? null,
    };
  }
}
