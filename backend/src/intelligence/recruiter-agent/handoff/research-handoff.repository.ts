import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearchHandoffEntity } from './research-handoff.entity';
import {
  ResearchHandoffStatus,
  MAX_NOTIFICATION_ATTEMPTS,
  NOTIFICATION_LEASE_MS,
  NOTIFICATION_RETRY_MS,
  NOTIFICATION_BATCH_SIZE,
} from './research-handoff.types';
import type { ResearchHandoffContext } from './research-handoff.types';

const OPEN_STATUSES = [
  ResearchHandoffStatus.PENDING_CHATGPT,
  ResearchHandoffStatus.IN_PROGRESS,
];

@Injectable()
export class ResearchHandoffRepository {
  constructor(
    @InjectRepository(ResearchHandoffEntity, 'intelligence')
    private readonly repository: Repository<ResearchHandoffEntity>,
  ) {}

  findByMessage(gmailMessageId: string) {
    return this.repository.findOneBy({ gmailMessageId });
  }
  findById(id: string) {
    return this.repository.findOneBy({ id });
  }

  async createOrFind(
    gmailMessageId: string,
    context: ResearchHandoffContext,
    requestedResearch: string[],
    chatGptPrompt: string,
  ): Promise<ResearchHandoffEntity> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .values({
        gmailMessageId,
        companyName: context.companyName,
        roleTitle: context.roleTitle,
        recruiterName: context.recruiterName,
        eventType: context.eventType,
        researchReason: context.researchReason,
        existingReportId: context.existingResearch?.reportId ?? null,
        context,
        requestedResearch,
        chatGptPrompt,
      })
      .orIgnore()
      .execute();
    return this.repository.findOneByOrFail({ gmailMessageId });
  }

  list(
    status: ResearchHandoffStatus | 'pending' | undefined,
    limit: number,
    offset: number,
  ) {
    const query = this.repository.createQueryBuilder('handoff');
    if (status === 'pending')
      query.where('handoff.status IN (:...statuses)', {
        statuses: OPEN_STATUSES,
      });
    else if (status) query.where('handoff.status = :status', { status });
    return query
      .orderBy('handoff.createdAt', 'DESC')
      .addOrderBy('handoff.id', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();
  }

  async start(id: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ status: ResearchHandoffStatus.IN_PROGRESS })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .execute();
    return result.affected === 1;
  }

  async complete(
    id: string,
    serializedResult: string | null,
    now = new Date(),
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({
        status: ResearchHandoffStatus.COMPLETED,
        ...(serializedResult === null
          ? {}
          : { deepResearchResult: () => 'CAST(:result AS jsonb)' }),
        completedAt: now,
      })
      .setParameter('result', serializedResult)
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .execute();
    return result.affected === 1;
  }

  private eligibleNotifications(now: Date) {
    return this.repository
      .createQueryBuilder()
      .where('"notificationSentAt" IS NULL')
      .andWhere('status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .andWhere('"notificationAttempts" < :max', {
        max: MAX_NOTIFICATION_ATTEMPTS,
      })
      .andWhere(
        '("notificationRetryAt" IS NULL OR "notificationRetryAt" <= :now)',
        { now },
      )
      .andWhere(
        '("notificationClaimedAt" IS NULL OR "notificationClaimedAt" < :stale)',
        { stale: new Date(now.getTime() - NOTIFICATION_LEASE_MS) },
      );
  }

  listNotifications(now = new Date()) {
    return this.eligibleNotifications(now)
      .orderBy('"createdAt"', 'ASC')
      .take(NOTIFICATION_BATCH_SIZE)
      .getMany();
  }

  async claimNotification(
    id: string,
    now = new Date(),
  ): Promise<ResearchHandoffEntity | null> {
    const result = await this.eligibleNotifications(now)
      .update()
      .set({
        notificationAttempts: () => '"notificationAttempts" + 1',
        notificationClaimedAt: now,
        notificationError: null,
      })
      .andWhere('id = :id', { id })
      .returning('*')
      .execute();
    return (result.raw as ResearchHandoffEntity[])[0] ?? null;
  }

  async notificationSent(
    id: string,
    attempt: number,
    now = new Date(),
  ): Promise<void> {
    await this.repository.update(
      { id, notificationAttempts: attempt },
      {
        notificationSentAt: now,
        notificationClaimedAt: null,
        notificationError: null,
        notificationRetryAt: null,
      },
    );
  }

  async notificationFailed(
    id: string,
    attempt: number,
    message: string,
    now = new Date(),
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update()
      .set({
        notificationError: message,
        notificationClaimedAt: null,
        notificationRetryAt: new Date(now.getTime() + NOTIFICATION_RETRY_MS),
      })
      .where('id = :id', { id })
      .andWhere('"notificationAttempts" = :attempt', { attempt })
      .andWhere('"notificationSentAt" IS NULL')
      .execute();
  }

  async notificationUnconfigured(id: string): Promise<boolean> {
    const error = 'Notification email is not configured.';
    const updated = await this.repository
      .createQueryBuilder()
      .update()
      .set({ notificationError: error })
      .where('id = :id', { id })
      .andWhere('"notificationSentAt" IS NULL')
      .andWhere('"notificationError" IS DISTINCT FROM :error', { error })
      .execute();
    return updated.affected === 1;
  }
}
