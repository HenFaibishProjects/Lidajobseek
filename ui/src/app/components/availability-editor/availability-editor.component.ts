import { CommonModule } from '@angular/common';
import {
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AvailabilityBlock,
  AvailabilityService,
} from '../../services/availability.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-availability-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './availability-editor.component.html',
  styleUrls: ['./availability-editor.component.css'],
})
export class AvailabilityEditorComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @Input() block: AvailabilityBlock | null = null;
  @Input() selectedDate = '';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  saving = false;
  errorMessage = '';
  private previousDate = '';
  private readonly previousFocus = document.activeElement as HTMLElement | null;
  form = {
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '10:00',
    allDay: false,
    repeatWeekly: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reason: '',
  };

  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly toastService: ToastService,
    private readonly confirmService: ConfirmService,
    private readonly element: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    const date =
      this.selectedDate || this.availabilityService.localDate(new Date());
    this.form.startDate = date;
    this.form.endDate = date;
    if (this.block)
      this.form = {
        startDate: this.block.startDate,
        endDate: this.block.allDay ? this.block.startDate : this.block.endDate,
        startTime: this.block.startTime || '09:00',
        endTime: this.block.endTime || '10:00',
        allDay: this.block.allDay,
        repeatWeekly: this.block.repeatWeekly,
        timeZone: this.block.timeZone,
        reason: this.block.reason || '',
      };
  }

  ngAfterViewInit(): void {
    this.previousDate = this.form.startDate;
    this.element.nativeElement
      .querySelector<HTMLInputElement>('#block-date')
      ?.focus();
  }

  ngOnDestroy(): void {
    this.previousFocus?.focus();
  }

  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const controls = [
      ...this.element.nativeElement.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
      ),
    ];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  dateChanged(): void {
    if (!this.form.startDate) return;
    const span =
      Math.max(
        0,
        Math.round(
          (Date.parse(this.form.endDate) -
            Date.parse(this.previousDate || this.form.startDate)) /
            86400000,
        ),
      ) || 0;
    this.form.endDate = new Date(
      Date.parse(`${this.form.startDate}T12:00:00Z`) + span * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    this.previousDate = this.form.startDate;
  }

  save(): void {
    if (this.saving) return;
    this.errorMessage = '';
    const payload = { ...this.form, reason: this.form.reason.trim() || null };
    this.saving = true;
    const request = this.block
      ? this.availabilityService.updateBlock(this.block.id, payload)
      : this.availabilityService.createBlock(payload);
    request.subscribe({
      next: () => {
        this.toastService.show('Availability saved', 'success');
        this.saved.emit();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage =
          error.error?.message || 'Could not save availability. Try again.';
      },
    });
  }

  async delete(): Promise<void> {
    if (!this.block || this.saving) return;
    if (
      !(await this.confirmService.delete(
        this.block.repeatWeekly
          ? 'the entire weekly availability series'
          : 'this availability block',
      ))
    )
      return;
    this.saving = true;
    this.availabilityService.deleteBlock(this.block.id).subscribe({
      next: () => {
        this.toastService.show('Availability block removed', 'success');
        this.saved.emit();
      },
      error: () => {
        this.saving = false;
        this.errorMessage = 'Could not remove the block. Try again.';
      },
    });
  }
}
