import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
} from '@angular/core';
import { Subject, Subscription, catchError, of, switchMap, timer } from 'rxjs';
import {
  AvailabilityResult,
  AvailabilityService,
  OccupiedInterval,
} from '../../services/availability.service';

@Component({
  selector: 'app-availability-check',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './availability-check.component.html',
  styleUrls: ['./availability-check.component.css'],
})
export class AvailabilityCheckComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() durationMinutes = 60;
  @Input() excludeInterviewId?: number;
  @Output() scheduleAnyway = new EventEmitter<void>();
  @Output() chooseAnotherTime = new EventEmitter<void>();
  result: AvailabilityResult | null = null;
  state: 'idle' | 'checking' | 'available' | 'conflict' | 'error' = 'idle';
  get timeZone(): string {
    return this.availabilityService.browserTimeZone;
  }
  private readonly requests = new Subject<{
    start: string;
    duration: number;
    excludedId?: number;
  } | null>();
  private readonly subscription: Subscription;

  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.subscription = this.requests
      .pipe(
        switchMap((request) =>
          request
            ? timer(300).pipe(
                switchMap(() =>
                  this.availabilityService.check(
                    request.start,
                    request.duration,
                    request.excludedId,
                  ),
                ),
                catchError(() => of(null)),
              )
            : of(null),
        ),
      )
      .subscribe((result) => {
        if (this.state === 'idle') return;
        this.result = result;
        this.state = result
          ? result.available
            ? 'available'
            : 'conflict'
          : 'error';
        this.changeDetector.detectChanges();
      });
  }

  ngOnChanges(): void {
    this.refresh();
  }
  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  refresh(): void {
    this.result = null;
    if (!this.date || !this.durationMinutes) {
      this.state = 'idle';
      this.requests.next(null);
      return;
    }
    try {
      const start = this.availabilityService.interviewInstant(this.date);
      this.state = 'checking';
      this.requests.next({
        start,
        duration: Number(this.durationMinutes),
        excludedId: this.excludeInterviewId,
      });
    } catch {
      this.state = 'error';
      this.requests.next(null);
    }
  }

  describeConflict(interval: OccupiedInterval): string {
    return this.availabilityService.describeConflict(interval);
  }
}
