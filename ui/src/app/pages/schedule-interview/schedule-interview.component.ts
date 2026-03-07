import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import {
  DEFAULT_INTERVIEW_TYPE_ID,
  INTERVIEW_TYPES,
  getInterviewTypeLabel,
  normalizeInterviewType
} from '../../shared/interview-types';

@Component({
  selector: 'app-schedule-interview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
  templateUrl: './schedule-interview.component.html',
  styleUrls: ['./schedule-interview.component.css']
})
export class ScheduleInterviewComponent implements OnInit {
  processes: any[] = [];
  loading = false;
  processSearch = '';

  interaction: any = {
    processId: null,
    date: '',
    interviewType: DEFAULT_INTERVIEW_TYPE_ID,
    participants: [],
    summary: '',
    headsup: '',
    notes: '',
    testsAssessment: '',
    roleInsights: '',
     reminder: {
      enabled: false,
      beforeMinutes: 60,
      channels: {
        email: true,
        sms: false,
      }
    }
  };

  availableRoles = ['HR', 'Tech Lead', 'Team Member', 'Team Lead', 'Manager', 'CTO', 'Director', 'Group Leader', 'Architect'];
  interviewTypes = INTERVIEW_TYPES;
    reminderOptions = [
    { value: 15, label: '15 minutes before' },
    { value: 30, label: '30 minutes before' },
    { value: 60, label: '1 hour before' },
    { value: 120, label: '2 hours before' },
    { value: 1440, label: '1 day before' },
    { value: 2880, label: '2 days before' },
  ];

  isPremiumUser = false;
  datePart: string = '';
  timePart: string = '';

  get selectedInterviewTypeLabel(): string {
    return getInterviewTypeLabel(this.interaction.interviewType);
  }

  private isClosedProcess(process: any): boolean {
    if (typeof process?.isClosed === 'boolean') {
      return process.isClosed;
    }

    const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
    return stage === 'rejected' || stage === 'reject' || stage === 'withdrawn';
  }

  get filteredProcesses(): any[] {
    const term = this.processSearch.trim().toLowerCase();
    if (!term) return [];
    return this.processes.filter((p) => {
      if (this.isClosedProcess(p)) return false;
      const haystack = `${p.companyName ?? ''} ${p.roleTitle ?? ''} ${p.currentStage ?? ''} ${p.location ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }

  get hasProcessSearch(): boolean {
    return this.processSearch.trim().length > 0;
  }

  get selectedProcess(): any | null {
    const id = Number(this.interaction.processId);
    if (!id) return null;
    const process = this.processes.find((p) => Number(p.id) === id) ?? null;
    if (!process) return null;
    return this.isClosedProcess(process) ? null : process;
  }

  get completionPercent(): number {
    const requiredCount = 4; // processId, date, interviewType, summary
    let filled = 0;
    if (this.selectedProcess) filled += 1;
    if (this.interaction.date) filled += 1;
    if (this.interaction.interviewType) filled += 1;
    if (this.interaction.summary?.trim?.().length) filled += 1;
    return Math.round((filled / requiredCount) * 100);
  }

   get reminderTimingLabel(): string {
    const option = this.reminderOptions.find((o) => o.value === Number(this.interaction?.reminder?.beforeMinutes));
    return option?.label ?? 'Custom';
  }

  get canSubmit(): boolean {
    return !!(
      this.selectedProcess &&
      this.datePart &&
      this.timePart &&
      this.interaction.interviewType &&
      this.interaction.summary?.trim?.().length
    );
  }

  constructor(
    private processesService: ProcessesService,
    private interactionsService: InteractionsService,
    private router: Router,
    private toastService: ToastService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadProcesses();
    this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);
    this.isPremiumUser = this.authService.isPremiumUser();

    // Set default date to now
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - tzOffset).toISOString();
    this.datePart = localIso.slice(0, 10);
    this.timePart = localIso.slice(11, 16);
    this.interaction.date = `${this.datePart}T${this.timePart}`;
  }

  
  onReminderEnabledChange() {
    if (!this.interaction.reminder.enabled) {
      this.interaction.reminder.channels.sms = false;
      return;
    }

    if (!this.isPremiumUser) {
      this.interaction.reminder.channels.sms = false;
    }
  }

  onSmsReminderChange() {
    if (!this.isPremiumUser) {
      this.interaction.reminder.channels.sms = false;
    }
  }

  updateDateTime() {
    if (this.datePart && this.timePart) {
      this.interaction.date = `${this.datePart}T${this.timePart}`;
    }
  }

  loadProcesses() {
    this.processesService.getAll().subscribe({
      next: (processes) => {
        this.processes = processes;
      },
      error: (err) => {
        console.error('Failed to load processes', err);
      }
    });
  }

  addParticipant() {
    this.interaction.participants.push({ role: 'HR', name: '' });
  }

  removeParticipant(index: number) {
    this.interaction.participants.splice(index, 1);
  }

  selectProcess(process: any) {
    if (this.isClosedProcess(process)) {
      this.toastService.show('Interview interactions can only be added to open processes', 'warning');
      return;
    }
    this.interaction.processId = Number(process?.id);
  }

  onSubmit() {
    if (!this.selectedProcess) {
      this.toastService.show('Please select an open process', 'warning');
      return;
    }

    this.loading = true;

    // Prepare the payload with only the fields we want to send
    const payload: any = {
      processId: Number(this.selectedProcess.id),
      date: new Date(this.interaction.date).toISOString(),
      interviewType: this.interaction.interviewType,
      participants: this.interaction.participants,
      summary: this.interaction.summary
    };

    // Add optional fields only if they have values
    if (this.interaction.headsup) payload.headsup = this.interaction.headsup;
    if (this.interaction.notes) payload.notes = this.interaction.notes;
    if (this.interaction.testsAssessment) payload.testsAssessment = this.interaction.testsAssessment;
    if (this.interaction.roleInsights) payload.roleInsights = this.interaction.roleInsights;
     if (this.interaction?.reminder?.enabled) {
      const channels = {
        email: !!this.interaction.reminder.channels.email,
        sms: this.isPremiumUser && !!this.interaction.reminder.channels.sms,
      };

      // Reminders are optional. If no channel is selected, continue without reminder payload.
      if (channels.email || channels.sms) {
        payload.reminder = {
          enabled: true,
          beforeMinutes: Number(this.interaction.reminder.beforeMinutes) || 60,
          channels,
        };
      }
    }

    this.interactionsService.create(payload).subscribe({
      next: () => {
        this.toastService.show('Interview scheduled successfully', 'success');
        this.router.navigate(['/calendar']);
      },
      error: (err) => {
        console.error('Failed to schedule interview', err);
        this.toastService.show('Failed to schedule interview', 'error');
        this.loading = false;
      }
    });
  }

  onCancel() {
    this.router.navigate(['/calendar']);
  }
}
