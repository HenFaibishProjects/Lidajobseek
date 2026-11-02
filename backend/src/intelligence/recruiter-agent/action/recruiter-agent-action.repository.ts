import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MAX_PROCESSING_ATTEMPTS,
  STALE_PROCESSING_MS,
} from '../audit/email-processing.constants';
import { EmailProcessingStatus } from '../recruiter-agent.types';
import { RecruiterAgentActionEntity } from './recruiter-agent-action.entity';
import {
  MAX_ACTION_ATTEMPTS,
  RecruiterAgentActionError,
  RecruiterAgentActionStatus,
} from './recruiter-agent-action.types';
import type {
  RecruiterAgentActionType,
  RecruiterAgentActionResult,
} from './recruiter-agent-action.types';

@Injectable()
export class RecruiterAgentActionRepository {
  constructor(
    @InjectRepository(RecruiterAgentActionEntity, 'intelligence')
    private readonly repository: Repository<RecruiterAgentActionEntity>,
  ) {}

  async createOrFind(
    gmailMessageId: string,
    actionType: RecruiterAgentActionType,
  ): Promise<RecruiterAgentActionEntity> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({
        gmailMessageId,
        actionType,
      })
      .orIgnore()
      .execute();
    return this.find(gmailMessageId, actionType);
  }

  find(gmailMessageId: string, actionType: RecruiterAgentActionType) {
    return this.repository.findOneByOrFail({ gmailMessageId, actionType });
  }

  async claim(
    gmailMessageId: string,
    actionType: RecruiterAgentActionType,
    emailProcessingAttempt: number,
  ): Promise<RecruiterAgentActionEntity | null> {
    const claimed = await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: RecruiterAgentActionStatus.RUNNING,
        attempts: () => '"attempts" + 1',
        emailProcessingAttempt,
        error: null,
      })
      .where('"gmailMessageId" = :gmailMessageId', { gmailMessageId })
      .andWhere('"actionType" = :actionType', { actionType })
      .andWhere('"attempts" < :max', { max: MAX_ACTION_ATTEMPTS })
      .andWhere(
        `("status" IN (:...ready) OR
        ("status" = :running AND "emailProcessingAttempt" < :emailProcessingAttempt))`,
        {
          ready: [
            RecruiterAgentActionStatus.PENDING,
            RecruiterAgentActionStatus.FAILED,
          ],
          running: RecruiterAgentActionStatus.RUNNING,
          emailProcessingAttempt,
        },
      )
      .andWhere(
        `EXISTS (SELECT 1 FROM email_processing_audit email
        WHERE email."gmailMessageId" = :gmailMessageId
        AND email."processingStatus" = :processing
        AND email."processingAttempts" = :emailProcessingAttempt)`,
        {
          processing: EmailProcessingStatus.PROCESSING,
          emailProcessingAttempt,
        },
      )
      .returning('*')
      .execute();
    return (claimed.raw as RecruiterAgentActionEntity[])[0] ?? null;
  }

  complete(
    action: RecruiterAgentActionEntity,
    result: RecruiterAgentActionResult,
  ) {
    return this.finish(
      action,
      RecruiterAgentActionStatus.COMPLETED,
      result,
      null,
    );
  }

  defer(action: RecruiterAgentActionEntity) {
    return this.finish(
      action,
      RecruiterAgentActionStatus.DEFERRED,
      { reason: 'Action execution is not implemented yet.' },
      null,
    );
  }

  fail(action: RecruiterAgentActionEntity, error: RecruiterAgentActionError) {
    return this.finish(
      action,
      RecruiterAgentActionStatus.FAILED,
      null,
      error.message,
    );
  }

  async recoverExhausted(
    gmailMessageId: string,
    now = new Date(),
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: RecruiterAgentActionStatus.FAILED,
        error: 'Email processing attempts exhausted before action completion.',
      })
      .where('"gmailMessageId" = :gmailMessageId', { gmailMessageId })
      .andWhere('"status" IN (:...unfinished)', {
        unfinished: [
          RecruiterAgentActionStatus.PENDING,
          RecruiterAgentActionStatus.RUNNING,
        ],
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM email_processing_audit email
        WHERE email."gmailMessageId" = :gmailMessageId
        AND (email."processingStatus" = :failed OR
          (email."processingStatus" = :processing AND email."updatedAt" < :staleBefore))
        AND email."processingAttempts" >= :max)`,
        {
          failed: EmailProcessingStatus.FAILED,
          processing: EmailProcessingStatus.PROCESSING,
          staleBefore: new Date(now.getTime() - STALE_PROCESSING_MS),
          max: MAX_PROCESSING_ATTEMPTS,
        },
      )
      .execute();
  }

  async deferLegacyResearch(
    gmailMessageId: string,
    emailProcessingAttempt: number,
  ): Promise<RecruiterAgentActionEntity | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: RecruiterAgentActionStatus.DEFERRED,
        result: {
          reason:
            'Legacy analysis has no research-depth authorization; company research deferred.',
        },
        error: null,
        emailProcessingAttempt,
      })
      .where('"gmailMessageId" = :gmailMessageId', { gmailMessageId })
      .andWhere('"actionType" = :actionType', {
        actionType: 'RESEARCH_COMPANY',
      })
      .andWhere('"status" IN (:...unfinished)', {
        unfinished: [
          RecruiterAgentActionStatus.PENDING,
          RecruiterAgentActionStatus.RUNNING,
          RecruiterAgentActionStatus.FAILED,
        ],
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM email_processing_audit email
        WHERE email."gmailMessageId" = :gmailMessageId
        AND email."processingStatus" = :processing
        AND email."processingAttempts" = :emailProcessingAttempt
        AND NOT (email."expensiveLlmResult" ? 'researchDepth'))`,
        {
          processing: EmailProcessingStatus.PROCESSING,
          emailProcessingAttempt,
        },
      )
      .returning('*')
      .execute();
    return (result.raw as RecruiterAgentActionEntity[])[0] ?? null;
  }

  private async finish(
    action: RecruiterAgentActionEntity,
    status: RecruiterAgentActionStatus,
    result: RecruiterAgentActionResult | null,
    error: string | null,
  ): Promise<RecruiterAgentActionEntity> {
    const updated = await this.repository.update(
      {
        id: action.id,
        status: RecruiterAgentActionStatus.RUNNING,
        attempts: action.attempts,
        emailProcessingAttempt: action.emailProcessingAttempt!,
      },
      { status, result, error },
    );
    if (updated.affected !== 1) {
      throw new RecruiterAgentActionError(
        'Action attempt is no longer owned by this worker.',
      );
    }
    return this.find(action.gmailMessageId, action.actionType);
  }
}
