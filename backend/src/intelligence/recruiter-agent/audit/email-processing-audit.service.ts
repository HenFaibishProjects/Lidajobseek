import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { RecruiterEmailDecision } from '../recruiter-email-decision.schema';
import {
  MAX_PROCESSING_ATTEMPTS,
  STALE_PROCESSING_MS,
} from './email-processing.constants';

import type {
  CheapRecruiterEmailClassification,
  RecruiterEmailAnalysis,
} from '../recruiter-email.schema';
import type { IncomingEmail } from '../recruiter-agent.types';
import {
  EmailProcessingStatus,
  EmailFilterDecision,
} from '../recruiter-agent.types';
import {
  EmailProcessingAuditEntity,
  EmailReviewStatus,
} from './email-processing-audit.entity';

@Injectable()
export class EmailProcessingAuditService {
  constructor(
    @InjectRepository(EmailProcessingAuditEntity, 'intelligence')
    private readonly repository: Repository<EmailProcessingAuditEntity>,
  ) {}

  async create(
    email: IncomingEmail,
    filterDecision: EmailFilterDecision,
    filterReason?: string | string[],
  ): Promise<EmailProcessingAuditEntity> {
    const existing = await this.repository.findOne({
      where: {
        gmailMessageId: email.id,
      },
    });

    if (existing) {
      return existing;
    }

    const audit = this.repository.create({
      gmailMessageId: email.id,
      from: email.from,
      subject: email.subject,
      body: email.body,
      receivedAt: email.receivedAt,

      processingStatus: EmailProcessingStatus.PENDING,
      processingAttempts: 0,
      processingError: null,
      filterDecision,
      filterReason: Array.isArray(filterReason)
        ? filterReason.join('; ')
        : (filterReason ?? null),

      sentToCheapLlm: false,
      cheapLlmClassification: null,
      cheapLlmConfidence: null,
      sentToExpensiveLlm: false,
      expensiveLlmResult: null,
      sentToLlm: false,
      llmClassification: null,
      llmConfidence: null,

      reviewStatus: EmailReviewStatus.UNREVIEWED,
      reviewNote: null,
    });

    // Gmail message ID has a unique constraint: concurrent inserts must not reset progress.
    await this.repository
      .createQueryBuilder()
      .insert()
      .values(audit)
      .orIgnore()
      .execute();
    return this.repository.findOneByOrFail({ gmailMessageId: email.id });
  }

  async listRetryableEmails(now = new Date()): Promise<IncomingEmail[]> {
    const rows = await this.repository.find({
      where: [
        {
          processingStatus: EmailProcessingStatus.PENDING,
          processingAttempts: LessThan(MAX_PROCESSING_ATTEMPTS),
        },
        {
          processingStatus: EmailProcessingStatus.FAILED,
          processingAttempts: LessThan(MAX_PROCESSING_ATTEMPTS),
        },
        {
          processingStatus: EmailProcessingStatus.PROCESSING,
          updatedAt: LessThan(new Date(now.getTime() - STALE_PROCESSING_MS)),
        },
      ],
      order: { updatedAt: 'ASC' },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.gmailMessageId,
      from: row.from,
      subject: row.subject,
      body: row.body,
      receivedAt: row.receivedAt,
    }));
  }

  async claim(
    gmailMessageId: string,
    countAttempt: boolean,
    filterDecision: EmailFilterDecision,
    reasons: string[],
    now = new Date(),
  ): Promise<EmailProcessingAuditEntity | null> {
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
    // A crashed final attempt becomes terminal FAILED, rather than PROCESSING forever.
    await this.repository
      .createQueryBuilder()
      .update()
      .set({
        processingStatus: EmailProcessingStatus.FAILED,
        processingError: 'Final processing attempt expired',
      })
      .where('"gmailMessageId" = :gmailMessageId', { gmailMessageId })
      .andWhere('"processingStatus" = :status', {
        status: EmailProcessingStatus.PROCESSING,
      })
      .andWhere('"processingAttempts" >= :max', {
        max: MAX_PROCESSING_ATTEMPTS,
      })
      .andWhere('"updatedAt" < :staleBefore', { staleBefore })
      .execute();

    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({
        processingStatus: EmailProcessingStatus.PROCESSING,
        processingAttempts: () =>
          countAttempt ? '"processingAttempts" + 1' : '"processingAttempts"',
        processingError: null,
        filterDecision,
        filterReason: reasons.join('; '),
      })
      .where('"gmailMessageId" = :gmailMessageId', { gmailMessageId })
      .andWhere('"processingAttempts" < :max', { max: MAX_PROCESSING_ATTEMPTS })
      .andWhere(
        '("processingStatus" IN (:...ready) OR ("processingStatus" = :active AND "updatedAt" < :staleBefore))',
        {
          ready: [EmailProcessingStatus.PENDING, EmailProcessingStatus.FAILED],
          active: EmailProcessingStatus.PROCESSING,
          staleBefore,
        },
      )
      .returning('*')
      .execute();
    return (result.raw as EmailProcessingAuditEntity[])[0] ?? null;
  }

  async complete(gmailMessageId: string, attempt: number): Promise<void> {
    await this.repository.update(
      {
        gmailMessageId,
        processingAttempts: attempt,
        processingStatus: EmailProcessingStatus.PROCESSING,
      },
      {
        processingStatus: EmailProcessingStatus.COMPLETED,
        processingError: null,
      },
    );
  }

  async fail(
    gmailMessageId: string,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    // Keep a concise first-line diagnostic, redacting common credential formats.
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message.split('\n')[0]}`
        : 'Unknown processing error';
    await this.repository.update(
      {
        gmailMessageId,
        processingAttempts: attempt,
        processingStatus: EmailProcessingStatus.PROCESSING,
      },
      {
        processingStatus: EmailProcessingStatus.FAILED,
        processingError: message
          .replace(/Bearer \S+/gi, 'Bearer [redacted]')
          .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
          .slice(0, 500),
      },
    );
  }

  async markSentToCheapLlm(
    gmailMessageId: string,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      sentToLlm: true,
      sentToCheapLlm: true,
    });
  }

  async saveCheapLlmResult(
    gmailMessageId: string,
    result: CheapRecruiterEmailClassification,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      cheapLlmClassification: result,
      cheapLlmConfidence: result.confidence,
      llmClassification: result.emailType,
      llmConfidence: result.confidence,
    });
  }

  async markSentToExpensiveLlm(
    gmailMessageId: string,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      sentToLlm: true,
      sentToExpensiveLlm: true,
    });
  }

  async saveExpensiveLlmResult(
    gmailMessageId: string,
    result: RecruiterEmailAnalysis,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      expensiveLlmResult: result,
    });
  }

  async markSentToDecisionLlm(
    gmailMessageId: string,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      sentToDecisionLlm: true,
      sentToLlm: true,
    });
  }

  async saveDecisionLlmResult(
    gmailMessageId: string,
    result: RecruiterEmailDecision,
    attempt?: number,
  ): Promise<void> {
    await this.repository.update(this.attemptScope(gmailMessageId, attempt), {
      decisionLlmResult: result,
    });
  }

  async markSentToLlm(gmailMessageId: string): Promise<void> {
    await this.repository.update(
      { gmailMessageId },
      {
        sentToLlm: true,
      },
    );
  }

  async saveLlmResult(
    gmailMessageId: string,
    classification: string,
    confidence: number,
  ): Promise<void> {
    await this.repository.update(
      { gmailMessageId },
      {
        sentToLlm: true,
        llmClassification: classification,
        llmConfidence: confidence,
      },
    );
  }

  async markCorrect(gmailMessageId: string, note?: string): Promise<void> {
    await this.setReviewStatus(gmailMessageId, EmailReviewStatus.CORRECT, note);
  }

  async markFalsePositive(
    gmailMessageId: string,
    note?: string,
  ): Promise<void> {
    await this.setReviewStatus(
      gmailMessageId,
      EmailReviewStatus.FALSE_POSITIVE,
      note,
    );
  }

  async markFalseNegative(
    gmailMessageId: string,
    note?: string,
  ): Promise<void> {
    await this.setReviewStatus(
      gmailMessageId,
      EmailReviewStatus.FALSE_NEGATIVE,
      note,
    );
  }

  async wasProcessed(gmailMessageId: string): Promise<boolean> {
    return this.repository.exists({
      where: {
        gmailMessageId,
        processingStatus: EmailProcessingStatus.COMPLETED,
      },
    });
  }

  private attemptScope(gmailMessageId: string, attempt?: number) {
    return {
      gmailMessageId,
      ...(attempt === undefined
        ? {}
        : {
            processingStatus: EmailProcessingStatus.PROCESSING,
            processingAttempts: attempt,
          }),
    };
  }

  private async setReviewStatus(
    gmailMessageId: string,
    reviewStatus: EmailReviewStatus,
    reviewNote?: string,
  ): Promise<void> {
    await this.repository.update(
      { gmailMessageId },
      {
        reviewStatus,
        reviewNote: reviewNote ?? null,
      },
    );
  }
}
