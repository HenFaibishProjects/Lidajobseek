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
    id: 'in-process',
    label: 'In Progress',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    tooltip: 'Actively progressing — interviews happening, tasks submitted, or awaiting further decisions.',
    stages: [
      'Application Submitted',
      'Resume Under Review',
      'Initial Call Scheduled',
      'Initial Call Completed',
      'Interview Scheduled',
      'Waiting for Interview Feedback',
      'Awaiting Next Interview',
      'Home Task Assigned',
      'Home Task Submitted (Under Review)',
      'Final Interview Scheduled',
      'References Requested',
      'Background Check in Progress',
      'Offer Received',
      'Offer in Negotiation',
      'Offer Accepted'
    ],
  },
  {
    id: 'withdrew',
    label: 'Withdrawn',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    tooltip: 'You chose to step back from this opportunity — your call, your reasons.',
    stages: ['Withdrawn', 'Offer Declined'],
  },
  {
    id: 'not-respond-reject',
    label: 'Not Respond or Reject',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    tooltip: 'Not selected or put on hold, or no response after following up.',
    stages: ['Rejected', 'Position Put On Hold', 'Ghosted / No Response'],
  },
];

// The default stage assigned when a card is dropped into a column
const COLUMN_DEFAULT_STAGE: Record<string, string> = {
  'in-process': 'Application Submitted',
  withdrew: 'Withdrawn',
  'not-respond-reject': 'Rejected',
};

const CLOSED_STAGES = new Set(['Withdrawn', 'Rejected', 'Position Put On Hold', 'Ghosted / No Response', 'Offer Declined']);

function stageToColumnId(stage: string): string {
  for (const col of BOARD_COLUMNS) {
    if (col.stages.includes(stage)) return col.id;
  }
  return 'in-process';
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
    
    let withdrawReason: string | undefined = undefined;
    if (newStage === 'Withdrawn') {
      const reason = window.prompt("Please provide a reason for withdrawing from this application:");
      if (reason === null) {
        return;
      }
      withdrawReason = reason;
    }

    process.currentStage = newStage;
    if (withdrawReason !== undefined) {
      process.withdrawReason = withdrawReason;
    }
    this.cdr.markForCheck();

    const updatePayload: any = { currentStage: newStage };
    if (withdrawReason !== undefined) {
        updatePayload.withdrawReason = withdrawReason;
    }

    this.processesService.update(processId, updatePayload).subscribe({
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

  searchGlassdoor(companyName: string, event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (!companyName) return;
    const query = `site:glassdoor.com/Interview ${companyName} interview questions`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
