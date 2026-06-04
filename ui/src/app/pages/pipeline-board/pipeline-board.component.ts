import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

// Kanban column definitions — simplified pipeline
const BOARD_COLUMNS: { id: string; label: string; icon: string; tooltip: string; stages: string[] }[] = [
  {
    id: 'initial-scheduled',
    label: 'Initial Conversation Scheduled',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    tooltip: 'Applications you\'ve submitted or are awaiting an initial call — your pipeline is warming up.',
    stages: ['Application Submitted', 'Resume Under Review', 'Initial Call Scheduled'],
  },
  {
    id: 'first-conversation',
    label: 'After First Conversation',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    tooltip: 'You\'ve had the first conversation. Now waiting for the next step or an interview to be scheduled.',
    stages: [
      'Initial Call Completed',
      'Interview Scheduled',
    ],
  },
  {
    id: 'first-interview-scheduled',
    label: 'First Interview Scheduled',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    tooltip: 'Your first formal interview is booked. Time to prepare!',
    stages: [
      'Interview Scheduled',
    ],
  },
  {
    id: 'in-process',
    label: 'In Process',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    tooltip: 'Actively progressing — interviews happening, tasks submitted, or awaiting further decisions.',
    stages: [
      'Waiting for Interview Feedback',
      'Awaiting Next Interview',
      'Home Task Assigned',
      'Home Task Submitted (Under Review)',
      'Final Interview Scheduled',
      'References Requested',
      'Background Check in Progress',
    ],
  },
  {
    id: 'offer',
    label: 'Offer',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
    tooltip: 'You\'ve received an offer! Review the terms, negotiate if needed.',
    stages: ['Offer Received', 'Offer in Negotiation'],
  },
  {
    id: 'withdrew',
    label: 'Withdrew',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    tooltip: 'You chose to step back from this opportunity — your call, your reasons.',
    stages: ['Withdrawn', 'Offer Declined'],
  },
  {
    id: 'rejected',
    label: 'Rejected',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    tooltip: 'Not selected or put on hold. Keep your head up — every no gets you closer to the right yes.',
    stages: ['Rejected', 'Position Put On Hold'],
  },
  {
    id: 'ghosted',
    label: 'Ghosted',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 17.5 22 22"/><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 4.5 22 22"/><path d="M11.5 14.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/><path d="M16 14.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z"/><path d="M12 22v-3"/><path d="M9 20.5c.5.5 1 1 3 1s2.5-.5 3-1"/></svg>',
    tooltip: 'No response after following up. It happens — log it and move forward.',
    stages: ['Ghosted / No Response'],
  },
  {
    id: 'hired',
    label: 'Hired',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    tooltip: 'Congratulations! Offer accepted. Your journey here is complete. 🎉',
    stages: ['Offer Accepted'],
  },
];

// The default stage assigned when a card is dropped into a column
const COLUMN_DEFAULT_STAGE: Record<string, string> = {
  'initial-scheduled': 'Application Submitted',
  'first-conversation': 'Initial Call Completed',
  'first-interview-scheduled': 'Interview Scheduled',
  'in-process': 'Waiting for Interview Feedback',
  offer: 'Offer Received',
  withdrew: 'Withdrawn',
  rejected: 'Rejected',
  ghosted: 'Ghosted / No Response',
  hired: 'Offer Accepted',
};

const CLOSED_STAGES = new Set(['Withdrawn', 'Rejected', 'Position Put On Hold', 'Ghosted / No Response', 'Offer Declined']);

function stageToColumnId(stage: string): string {
  for (const col of BOARD_COLUMNS) {
    if (col.stages.includes(stage)) return col.id;
  }
  return 'first-conversation';
}

@Component({
  selector: 'app-pipeline-board',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, LucideAngularModule],
  templateUrl: './pipeline-board.component.html',
  styleUrl: './pipeline-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineBoardComponent implements OnInit, OnDestroy {
  columns = BOARD_COLUMNS;

  // Raw data from API
  allProcesses: any[] = [];

  // Filter state
  searchText = '';
  filterWorkMode = '';
  filterActiveOnly = false;

  // Tip state
  showTip = true;

  // Drag state
  draggingId: number | null = null;
  dragOverColumnId: string | null = null;

  loading = true;

  private sub!: Subscription;

  constructor(
    private processesService: ProcessesService,
    private toastService: ToastService,
    protected cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadProcesses();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  loadProcesses() {
    this.loading = true;
    this.sub = this.processesService.getAll().subscribe({
      next: (data) => {
        this.allProcesses = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastService.show('Failed to load processes', 'error');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Filtering ────────────────────────────────────────────────────────────

  get filteredProcesses(): any[] {
    const term = this.searchText.trim().toLowerCase();
    return this.allProcesses.filter((p) => {
      if (this.filterActiveOnly && CLOSED_STAGES.has(p.currentStage)) return false;
      if (this.filterWorkMode && p.workMode !== this.filterWorkMode) return false;
      if (term) {
        const haystack = `${p.companyName} ${p.roleTitle} ${p.location}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }

  getColumnCards(columnId: string): any[] {
    const col = BOARD_COLUMNS.find((c) => c.id === columnId)!;
    return this.filteredProcesses.filter((p) => col.stages.includes(p.currentStage));
  }

  totalVisible(): number {
    return this.filteredProcesses.length;
  }

  // ─── Score helpers ────────────────────────────────────────────────────────

  hasScore(p: any): boolean {
    return p.scoreTech || p.scoreWLB || p.scoreGrowth || p.scoreVibe;
  }

  avgScore(p: any): number {
    const scores = [p.scoreTech, p.scoreWLB, p.scoreGrowth, p.scoreVibe].filter(
      (s) => s != null && s > 0
    );
    if (!scores.length) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  scoreClass(score: number): string {
    if (score >= 8) return 'score-high';
    if (score >= 5) return 'score-mid';
    return 'score-low';
  }

  // ─── Status pill ──────────────────────────────────────────────────────────

  getStatusClass(stage: string): string {
    if (!stage) return '';
    return 'status-' + stage.toLowerCase().replace(/[\s/()]+/g, '-').replace(/-+$/, '');
  }

  // ─── Drag & Drop (native HTML5) ────────────────────────────────────────────

  onDragStart(event: DragEvent, processId: number) {
    this.draggingId = processId;
    event.dataTransfer?.setData('text/plain', String(processId));
    // Let browser do its default ghost image
    const el = event.currentTarget as HTMLElement;
    el.classList.add('dragging');
  }

  onDragEnd(event: DragEvent) {
    this.draggingId = null;
    this.dragOverColumnId = null;
    (event.currentTarget as HTMLElement).classList.remove('dragging');
    this.cdr.markForCheck();
  }

  onDragOver(event: DragEvent, columnId: string) {
    event.preventDefault();
    if (this.dragOverColumnId !== columnId) {
      this.dragOverColumnId = columnId;
      this.cdr.markForCheck();
    }
  }

  onDragLeave(event: DragEvent, columnId: string) {
    // Only clear if leaving the column (not entering a child element)
    const related = event.relatedTarget as HTMLElement | null;
    const col = event.currentTarget as HTMLElement;
    if (!col.contains(related)) {
      if (this.dragOverColumnId === columnId) {
        this.dragOverColumnId = null;
        this.cdr.markForCheck();
      }
    }
  }

  onDrop(event: DragEvent, columnId: string) {
    event.preventDefault();
    this.dragOverColumnId = null;

    const idStr = event.dataTransfer?.getData('text/plain');
    if (!idStr) return;
    const processId = Number(idStr);
    if (!processId) return;

    const process = this.allProcesses.find((p) => p.id === processId);
    if (!process) return;

    // Already in this column -no-op
    if (stageToColumnId(process.currentStage) === columnId) return;

    const newStage = COLUMN_DEFAULT_STAGE[columnId];
    if (!newStage) return;

    // Optimistic update
    const previousStage = process.currentStage;
    process.currentStage = newStage;
    this.cdr.markForCheck();

    this.processesService.update(processId, { currentStage: newStage }).subscribe({
      next: () => {
        this.toastService.show(`Moved to ${newStage}`, 'success');
      },
      error: () => {
        // Roll back
        process.currentStage = previousStage;
        this.toastService.show('Failed to update stage', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Misc ─────────────────────────────────────────────────────────────────

  trackById(_: number, item: any): number {
    return item.id;
  }

  trackByColumnId(_: number, col: any): string {
    return col.id;
  }

  clearFilters() {
    this.searchText = '';
    this.filterWorkMode = '';
    this.filterActiveOnly = false;
  }

  dismissTip() {
    this.showTip = false;
  }

  // ─── Time-ago badge ──────────────────────────────────────────────────────

  getDaysAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return '1d';
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }

  getAgeBadgeClass(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days <= 3) return 'age-fresh';
    if (days <= 7) return 'age-recent';
    if (days <= 14) return 'age-stale';
    return 'age-overdue';
  }
}
