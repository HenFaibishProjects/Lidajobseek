import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
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
  agencies: any[] = [];
  loading = false;
  processSearch = '';

  /** 'process' = linked to a job process | 'recruiter' = meeting with a recruiter/agency */
  meetingMode: 'process' | 'recruiter' = 'process';

  interaction: any = {
    processId: null,
    agencyId: null,
    date: '',
    interviewType: DEFAULT_INTERVIEW_TYPE_ID,
    participants: [],
    summary: '',
    headsup: '',
    notes: '',
    testsAssessment: '',
    roleInsights: '',
    reminders: [] as Array<{ beforeMinutes: number; channels: { email: boolean; sms: boolean } }>
  };

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
  
  // State for participant selection
  processContacts: any[] = [];
  contactDropdownOpen = false;

  get selectedAgency(): any | null {
    const id = Number(this.interaction.agencyId);
    if (!id) return null;
    return this.agencies.find(a => Number(a.id) === id) ?? null;
  }

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
    const requiredCount = 4;
    let filled = 0;
    const linkedOk = this.meetingMode === 'process' ? !!this.selectedProcess : !!this.interaction.agencyId;
    if (linkedOk) filled += 1;
    if (this.interaction.date) filled += 1;
    if (this.interaction.interviewType) filled += 1;
    if (this.interaction.summary?.trim?.().length) filled += 1;
    return Math.round((filled / requiredCount) * 100);
  }

  get reminderTimingLabel(): string {
    // Legacy getter kept for snapshot card
    const r = this.interaction.reminders?.[0];
    if (!r) return 'None';
    const option = this.reminderOptions.find((o) => o.value === Number(r.beforeMinutes));
    return option?.label ?? 'Custom';
  }

  /** Add a new default reminder (avoids duplicates by beforeMinutes) */
  addReminder() {
    const used = new Set((this.interaction.reminders || []).map((r: any) => r.beforeMinutes));
    const next = this.reminderOptions.find(o => !used.has(o.value));
    if (!next) return; // all slots used
    this.interaction.reminders = [
      ...(this.interaction.reminders || []),
      { beforeMinutes: next.value, channels: { email: true }, sendWhatsAppReminder: false }
    ];
  }

  removeReminder(index: number) {
    this.interaction.reminders = (this.interaction.reminders || []).filter((_: any, i: number) => i !== index);
  }

  getReminderLabel(beforeMinutes: number): string {
    return this.reminderOptions.find(o => o.value === Number(beforeMinutes))?.label ?? 'Custom';
  }

  get availableContacts() {
    const participantNames = (this.interaction.participants || []).map((p: any) => p.name);
    return this.processContacts.filter(c => !participantNames.includes(c.name));
  }

  get canSubmit(): boolean {
    const linkedOk = this.meetingMode === 'process'
      ? !!this.selectedProcess
      : !!this.interaction.agencyId;
    return !!(
      linkedOk &&
      this.datePart &&
      this.timePart &&
      this.interaction.interviewType &&
      this.interaction.summary?.trim?.().length
    );
  }

  switchMode(mode: 'process' | 'recruiter') {
    if (this.meetingMode === mode) return;
    this.meetingMode = mode;
    // Clear the opposite field
    if (mode === 'process') {
      this.interaction.agencyId = null;
    } else {
      this.interaction.processId = null;
      this.processSearch = '';
      this.processContacts = [];
      this.interaction.participants = [];
    }
  }

  constructor(
    private processesService: ProcessesService,
    private interactionsService: InteractionsService,
    private agenciesService: RecruitmentAgenciesService,
    private router: Router,
    private route: ActivatedRoute,
    private toastService: ToastService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadProcesses();
    this.loadAgencies();
    this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);
    this.isPremiumUser = this.authService.isPremiumUser();

    // Set default date to now
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - tzOffset).toISOString();
    this.datePart = localIso.slice(0, 10);
    this.timePart = localIso.slice(11, 16);

    // Check for query parameters to prefill date
    this.route.queryParams.subscribe(params => {
      if (params['date']) {
        this.datePart = params['date'];
      }
    });

    this.interaction.date = `${this.datePart}T${this.timePart}`;
  }

  loadAgencies() {
    this.agenciesService.getAll().subscribe({
      next: (data) => { this.agencies = data; },
      error: (err) => { console.error('Failed to load agencies', err); }
    });
  }

  
  onReminderEnabledChange() {
    // No-op - kept for compatibility, logic moved to addReminder/removeReminder
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

  addParticipantFromContact(contact: any) {
    if (!this.interaction.participants) this.interaction.participants = [];
    const alreadyExists = this.interaction.participants.some((p: any) => p.name === contact.name);
    if (!alreadyExists) {
      this.interaction.participants.push({ 
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        linkedIn: contact.linkedIn,
        socialHooks: contact.socialHooks
      });
    }
    this.contactDropdownOpen = false;
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
    
    // Clear current participants as they might not belong to the new process
    this.interaction.participants = [];
    
    // Load contacts for this specific process
    this.processesService.getById(this.interaction.processId).subscribe({
      next: (data) => {
        this.processContacts = data.contacts || [];
      },
      error: (err) => {
        console.error('Failed to load process contacts', err);
        this.processContacts = [];
      }
    });
  }

  onSubmit() {
    const linkedOk = this.meetingMode === 'process' ? !!this.selectedProcess : !!this.interaction.agencyId;
    if (!linkedOk) {
      const msg = this.meetingMode === 'process'
        ? 'Please select an open process'
        : 'Please select a recruiter / agency';
      this.toastService.show(msg, 'warning');
      return;
    }

    this.loading = true;

    // Build payload based on mode — only one of processId / agencyId is set
    const payload: any = {
      date: new Date(this.interaction.date).toISOString(),
      interviewType: this.interaction.interviewType,
      summary: this.interaction.summary,
    };

    if (this.meetingMode === 'process') {
      payload.processId = Number(this.selectedProcess.id);
      payload.participants = this.interaction.participants;
    } else {
      payload.agencyId = Number(this.interaction.agencyId);
    }

    // Add optional fields only if they have values
    if (this.interaction.headsup) payload.headsup = this.interaction.headsup;
    if (this.interaction.notes) payload.notes = this.interaction.notes;
    if (this.interaction.testsAssessment) payload.testsAssessment = this.interaction.testsAssessment;
    if (this.interaction.roleInsights) payload.roleInsights = this.interaction.roleInsights;

    // Build reminders array — filter out any with no channels selected
    const validReminders = (this.interaction.reminders || []).filter((r: any) => {
      const hasEmail = !!r.channels?.email;
      const hasWhatsapp = !!r.sendWhatsAppReminder;
      return hasEmail || hasWhatsapp;
    }).map((r: any) => ({
      beforeMinutes: Number(r.beforeMinutes) || 60,
      channels: {
        email: !!r.channels?.email,
      },
      sendWhatsAppReminder: !!r.sendWhatsAppReminder
    }));
    if (validReminders.length > 0) payload.reminders = validReminders;


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
