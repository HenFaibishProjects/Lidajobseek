import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  catchError,
  defer,
  from,
  switchMap,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { ConfirmService } from './confirm.service';

export interface AvailabilityBlock {
  id: number;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  allDay: boolean;
  repeatWeekly: boolean;
  reason: string | null;
}

export interface AvailabilityBlockPayload {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  timeZone: string;
  allDay: boolean;
  repeatWeekly: boolean;
  reason: string | null;
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

export interface AvailabilityResult {
  available: boolean;
  start: string;
  end: string;
  conflicts: OccupiedInterval[];
  conflictToken: string;
}

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly availabilityUrl = `${environment.apiUrl}/api/availability`;
  private readonly blocksUrl = `${environment.apiUrl}/api/availability-blocks`;
  readonly browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  constructor(
    private readonly http: HttpClient,
    private readonly confirmService: ConfirmService,
  ) {}

  getAvailability(fromDate: string, toDate: string) {
    return this.http.get<OccupiedInterval[]>(this.availabilityUrl, {
      params: new HttpParams().set('from', fromDate).set('to', toDate),
    });
  }

  getBlocks(fromDate: string, toDate: string) {
    return this.http.get<AvailabilityBlock[]>(this.blocksUrl, {
      params: new HttpParams().set('from', fromDate).set('to', toDate),
    });
  }

  getBlock(id: number) {
    return this.http.get<AvailabilityBlock>(`${this.blocksUrl}/${id}`);
  }
  createBlock(payload: AvailabilityBlockPayload) {
    return this.http.post<AvailabilityBlock>(this.blocksUrl, payload);
  }
  updateBlock(id: number, payload: AvailabilityBlockPayload) {
    return this.http.patch<AvailabilityBlock>(
      `${this.blocksUrl}/${id}`,
      payload,
    );
  }
  deleteBlock(id: number) {
    return this.http.delete<void>(`${this.blocksUrl}/${id}`);
  }

  check(start: string, durationMinutes = 60, excludeInterviewId?: number) {
    return this.http.post<AvailabilityResult>(`${this.availabilityUrl}/check`, {
      start,
      durationMinutes,
      excludeInterviewId,
    });
  }

  describeConflict(interval: OccupiedInterval): string {
    const start = new Date(interval.start).toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const end = new Date(interval.end).toLocaleString([], {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return `${interval.source === 'MANUAL_BLOCK' ? 'Blocked' : 'Existing interview'}: ${interval.title} · ${start} – ${end}${interval.allDay ? ' · Entire day' : ''}`;
  }

  saveWithConflictConfirmation<T>(
    operation: (override: {
      allowConflict?: boolean;
      conflictToken?: string;
    }) => Observable<T>,
    override: { allowConflict?: boolean; conflictToken?: string } = {},
  ): Observable<T> {
    return defer(() => operation(override)).pipe(
      catchError((error) => {
        if (
          error.status !== 409 ||
          error.error?.code !== 'AVAILABILITY_CONFLICT'
        )
          return throwError(() => error);
        const message = (error.error.conflicts as OccupiedInterval[])
          .map((conflict) => this.describeConflict(conflict))
          .join('\n');
        return from(
          this.confirmService.custom({
            title: 'Time Conflict Detected',
            message: `${override.allowConflict ? 'Availability changed. Review the updated conflicts.\n\n' : ''}${message}\n\nSchedule this interview despite these conflicts?`,
            confirmText: 'Schedule Anyway',
            cancelText: 'Choose Another Time',
          }),
        ).pipe(
          switchMap((confirmed) =>
            confirmed
              ? this.saveWithConflictConfirmation(operation, {
                  allowConflict: true,
                  conflictToken: error.error.conflictToken,
                })
              : throwError(() => error),
          ),
        );
      }),
    );
  }

  localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  interviewInstant(value: string): string {
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime()))
      throw new Error('Choose a valid interview date and time');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      const rendered = `${this.localDate(instant)}T${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
      if (rendered !== value)
        throw new Error(
          'This local time does not exist because of a timezone transition',
        );
    }
    return instant.toISOString();
  }
}
