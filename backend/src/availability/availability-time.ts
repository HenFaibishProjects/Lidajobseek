import { BadRequestException } from '@nestjs/common';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function validateTimeZone(timeZone: unknown): string {
  if (typeof timeZone !== 'string' || timeZone.length > 100) {
    throw new BadRequestException('A valid timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
    return timeZone;
  } catch {
    throw new BadRequestException('Unknown timezone');
  }
}

export function validateCalendarDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Use a valid calendar date (YYYY-MM-DD)');
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid calendar date');
  }
  return value;
}

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function localDateTime(instant: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function zonedInstant(
  date: string,
  time: string,
  timeZone: string,
  allowGap = false,
): Date {
  const wallTime = `${date}T${time}:00`;
  const wallTimestamp = Date.parse(`${wallTime}Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = new Date(wallTimestamp + hours * 3600000);
    offsets.add(
      Date.parse(`${localDateTime(sample, timeZone)}Z`) - sample.getTime(),
    );
  }
  const candidates = [...offsets].map(
    (offset) => new Date(wallTimestamp - offset),
  );
  const matches = candidates.filter(
    (candidate) => localDateTime(candidate, timeZone) === wallTime,
  );
  if (matches.length)
    return new Date(
      Math.min(...matches.map((candidate) => candidate.getTime())),
    );
  if (allowGap) {
    const shifted = candidates
      .filter((candidate) => localDateTime(candidate, timeZone) > wallTime)
      .sort((first, second) =>
        localDateTime(first, timeZone).localeCompare(
          localDateTime(second, timeZone),
        ),
      );
    if (shifted.length) return shifted[0];
  }
  throw new BadRequestException(
    'This local time does not exist because of a timezone transition. Choose another time.',
  );
}

export function validateInstant(value: unknown): Date {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new BadRequestException(
      'An ISO date and time with timezone offset is required',
    );
  }
  validateCalendarDate(value.slice(0, 10));
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()))
    throw new BadRequestException('Invalid date and time');
  return instant;
}
