import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { createHash } from 'crypto';
import { AvailabilityBlock } from './availability-block.entity';
import { Interaction } from '../interactions/interaction.entity';
import { User } from '../users/user.entity';
import {
  AvailabilityBlockDto,
  AvailabilityCheckDto,
  ConflictOverride,
  OccupiedInterval,
} from './dto/availability.dto';
import {
  addCalendarDays,
  localDateTime,
  validateCalendarDate,
  validateInstant,
  validateTimeZone,
  zonedInstant,
} from './availability-time';

@Injectable()
export class AvailabilityService {
  constructor(private readonly entityManager: EntityManager) {}

  async lockUser(userId: number): Promise<void> {
    await this.entityManager
      .getConnection()
      .execute(
        'select pg_advisory_xact_lock(70123, ?)',
        [userId],
        'all',
        this.entityManager.getTransactionContext(),
      );
  }

  interviewDuration(value?: number | null): number {
    if (value === undefined || value === null) return 60;
    if (!Number.isInteger(value) || value < 1 || value > 10080) {
      throw new BadRequestException(
        'Interview duration must be between 1 and 10080 minutes',
      );
    }
    return value;
  }

  async createBlock(
    data: AvailabilityBlockDto,
    userId: number,
  ): Promise<AvailabilityBlock> {
    const normalized = this.normalizeBlock(data);
    return this.entityManager.transactional(async () => {
      await this.lockUser(userId);
      const block = this.entityManager.create(AvailabilityBlock, {
        ...normalized,
        user: this.entityManager.getReference(User, userId),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.entityManager.persistAndFlush(block);
      return block;
    });
  }

  async updateBlock(
    id: number,
    data: AvailabilityBlockDto,
    userId: number,
  ): Promise<AvailabilityBlock> {
    return this.entityManager.transactional(async () => {
      await this.lockUser(userId);
      const block = await this.findBlock(id, userId);
      this.entityManager.assign(
        block,
        this.normalizeBlock({ ...block, ...data }),
      );
      await this.entityManager.flush();
      return block;
    });
  }

  async deleteBlock(id: number, userId: number): Promise<void> {
    await this.entityManager.transactional(async () => {
      await this.lockUser(userId);
      await this.entityManager.removeAndFlush(await this.findBlock(id, userId));
    });
  }

  async findBlock(id: number, userId: number): Promise<AvailabilityBlock> {
    const block = await this.entityManager.findOne(AvailabilityBlock, {
      id,
      user: userId,
    });
    if (!block) throw new NotFoundException('Availability block not found');
    return block;
  }

  async findBlocks(
    from: string,
    to: string,
    userId: number,
  ): Promise<AvailabilityBlock[]> {
    const range = this.validateRange(from, to);
    const blocks = await this.entityManager.find(
      AvailabilityBlock,
      {
        user: userId,
        $or: [
          { repeatWeekly: true, startsAt: { $lt: range.end } },
          { startsAt: { $lt: range.end }, endsAt: { $gt: range.start } },
        ],
      },
      { orderBy: { startsAt: QueryOrder.ASC } },
    );
    return blocks.filter(
      (block) =>
        this.blockOccurrences(block, range.start, range.end).length > 0,
    );
  }

  async occupiedIntervals(
    from: string,
    to: string,
    userId: number,
    excludeInterviewId?: number,
  ): Promise<OccupiedInterval[]> {
    const range = this.validateRange(from, to);
    if (excludeInterviewId !== undefined) {
      if (!Number.isInteger(excludeInterviewId) || excludeInterviewId < 1)
        throw new BadRequestException('Invalid interview identifier');
      const owned = await this.entityManager.findOne(Interaction, {
        id: excludeInterviewId,
        $or: [{ process: { user: userId } }, { agency: { user: userId } }],
      });
      if (!owned) throw new NotFoundException('Interview not found');
    }
    const [blocks, interviews] = await Promise.all([
      this.findBlocks(from, to, userId),
      this.entityManager.find(
        Interaction,
        {
          date: { $lt: range.end },
          $or: [{ process: { user: userId } }, { agency: { user: userId } }],
        },
        { populate: ['process', 'agency'], orderBy: { date: QueryOrder.ASC } },
      ),
    ]);
    const intervals = blocks.flatMap((block) =>
      this.blockOccurrences(block, range.start, range.end),
    );
    for (const interview of interviews) {
      if (
        interview.id === excludeInterviewId ||
        interview.summary?.startsWith('Initial Interaction:') ||
        !this.isScheduledInterview(interview.interviewType)
      )
        continue;
      const start = new Date(interview.date);
      const end = new Date(
        start.getTime() + (interview.durationMinutes || 60) * 60000,
      );
      if (!this.overlaps(start, end, range.start, range.end)) continue;
      intervals.push({
        source: 'INTERVIEW',
        recordId: interview.id,
        start: start.toISOString(),
        end: end.toISOString(),
        title:
          interview.process?.companyName ||
          interview.agency?.agencyName ||
          'Interview',
        processId: interview.process?.id,
        agencyId: interview.agency?.id,
        allDay: false,
        repeatWeekly: false,
      });
    }
    return intervals.sort(
      (first, second) =>
        first.start.localeCompare(second.start) ||
        first.recordId - second.recordId,
    );
  }

  isScheduledInterview(interviewType?: string): boolean {
    return !['email', 'whatsapp', 'linkedin', 'cancelled', 'canceled'].includes(
      interviewType?.trim().toLowerCase() || '',
    );
  }

  async check(data: AvailabilityCheckDto, userId: number) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Interview date and duration are required');
    }
    const start = validateInstant(data.start);
    const end = new Date(
      start.getTime() + this.interviewDuration(data.durationMinutes) * 60000,
    );
    const conflicts = await this.occupiedIntervals(
      start.toISOString(),
      end.toISOString(),
      userId,
      data.excludeInterviewId,
    );
    const conflictToken = createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          start: start.toISOString(),
          end: end.toISOString(),
          conflicts,
        }),
      )
      .digest('hex');
    return {
      available: conflicts.length === 0,
      start: start.toISOString(),
      end: end.toISOString(),
      conflicts,
      conflictToken,
    };
  }

  async assertInterviewAvailable(
    start: string,
    durationMinutes: number | undefined,
    userId: number,
    override: ConflictOverride = {},
    excludeInterviewId?: number,
  ): Promise<void> {
    if (
      override.allowConflict !== undefined &&
      typeof override.allowConflict !== 'boolean'
    ) {
      throw new BadRequestException(
        'Conflict override must be an explicit boolean',
      );
    }
    const result = await this.check(
      { start, durationMinutes, excludeInterviewId },
      userId,
    );
    if (
      !result.available &&
      !(
        override.allowConflict === true &&
        override.conflictToken === result.conflictToken
      )
    ) {
      throw new ConflictException({
        message: 'Time Conflict Detected',
        code: 'AVAILABILITY_CONFLICT',
        ...result,
      });
    }
  }

  private validateRange(from: string, to: string): { start: Date; end: Date } {
    const start = validateInstant(from);
    const end = validateInstant(to);
    if (end <= start || end.getTime() - start.getTime() > 366 * 86400000) {
      throw new BadRequestException(
        'Choose a date range of up to 366 days with an end after its start',
      );
    }
    return { start, end };
  }

  private normalizeBlock(data: AvailabilityBlockDto) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Availability block details are required');
    }
    const timeZone = validateTimeZone(data.timeZone);
    const startDate = validateCalendarDate(data.startDate);
    if (
      typeof data.allDay !== 'boolean' ||
      typeof data.repeatWeekly !== 'boolean'
    ) {
      throw new BadRequestException(
        'All-day and repeat-weekly settings must be boolean',
      );
    }
    if (
      data.reason !== undefined &&
      data.reason !== null &&
      typeof data.reason !== 'string'
    ) {
      throw new BadRequestException('Reason must be text');
    }
    const reason = data.reason?.trim() || null;
    if (reason && reason.length > 2000)
      throw new BadRequestException('Reason is too long');
    const endDate = data.allDay
      ? addCalendarDays(startDate, 1)
      : validateCalendarDate(data.endDate || startDate);
    const startTime = data.allDay ? undefined : data.startTime;
    const endTime = data.allDay ? undefined : data.endTime;
    if (
      !data.allDay &&
      (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '') ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || ''))
    ) {
      throw new BadRequestException('Valid start and end times are required');
    }
    const startsAt = zonedInstant(
      startDate,
      startTime || '00:00',
      timeZone,
      data.allDay,
    );
    const endsAt = zonedInstant(
      endDate,
      endTime || '00:00',
      timeZone,
      data.allDay,
    );
    if (
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 7 * 86400000
    ) {
      throw new BadRequestException(
        'The block must end after it starts and last no more than seven days',
      );
    }
    return {
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      startsAt,
      endsAt,
      timeZone,
      allDay: data.allDay,
      repeatWeekly: data.repeatWeekly,
      reason,
    };
  }

  private blockOccurrences(
    block: AvailabilityBlock,
    from: Date,
    to: Date,
  ): OccupiedInterval[] {
    const interval = (start: Date, end: Date): OccupiedInterval => ({
      source: 'MANUAL_BLOCK',
      recordId: block.id,
      start: start.toISOString(),
      end: end.toISOString(),
      title: block.reason || 'Blocked time',
      allDay: block.allDay,
      repeatWeekly: block.repeatWeekly,
      timeZone: block.timeZone,
    });
    if (!block.repeatWeekly)
      return this.overlaps(block.startsAt, block.endsAt, from, to)
        ? [interval(block.startsAt, block.endsAt)]
        : [];
    const firstDate = localDateTime(from, block.timeZone).slice(0, 10);
    const lastDate = addCalendarDays(
      localDateTime(to, block.timeZone).slice(0, 10),
      1,
    );
    const anchorTimestamp = Date.parse(`${block.startDate}T12:00:00Z`);
    const earliestDate = addCalendarDays(firstDate, -7);
    const elapsedDays = Math.floor(
      (Date.parse(`${earliestDate}T12:00:00Z`) - anchorTimestamp) / 86400000,
    );
    let occurrenceDate = addCalendarDays(
      block.startDate,
      Math.max(0, Math.ceil(elapsedDays / 7)) * 7,
    );
    const daySpan = Math.round(
      (Date.parse(`${block.endDate}T12:00:00Z`) - anchorTimestamp) / 86400000,
    );
    const intervals: OccupiedInterval[] = [];
    while (occurrenceDate < lastDate) {
      const start = zonedInstant(
        occurrenceDate,
        block.startTime || '00:00',
        block.timeZone,
        true,
      );
      let end = zonedInstant(
        addCalendarDays(occurrenceDate, daySpan),
        block.endTime || '00:00',
        block.timeZone,
        true,
      );
      if (end <= start)
        end = new Date(
          start.getTime() + block.endsAt.getTime() - block.startsAt.getTime(),
        );
      if (end > start && this.overlaps(start, end, from, to))
        intervals.push(interval(start, end));
      occurrenceDate = addCalendarDays(occurrenceDate, 7);
    }
    return intervals;
  }

  private overlaps(
    start: Date,
    end: Date,
    proposedStart: Date,
    proposedEnd: Date,
  ): boolean {
    return start < proposedEnd && end > proposedStart;
  }
}
