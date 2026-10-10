export class AvailabilityBlockDto {
  startDate!: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  timeZone!: string;
  allDay!: boolean;
  repeatWeekly!: boolean;
  reason?: string | null;
}

export class AvailabilityCheckDto {
  start!: string;
  durationMinutes?: number;
  excludeInterviewId?: number;
}

export interface ConflictOverride {
  allowConflict?: boolean;
  conflictToken?: string;
}

export interface OccupiedInterval {
  source: 'INTERVIEW' | 'MANUAL_BLOCK';
  recordId: number;
  start: string;
  end: string;
  title: string;
  allDay: boolean;
  repeatWeekly: boolean;
  timeZone?: string;
  processId?: number;
  agencyId?: number;
}
