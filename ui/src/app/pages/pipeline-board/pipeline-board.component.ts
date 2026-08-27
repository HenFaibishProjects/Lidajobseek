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
    id: 'initial-call',
    label: 'Initial Call',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    tooltip: 'Initial screening call scheduled with recruitment/HR.',
    stages: ['Initial Call Scheduled'],
  },
  {
    id: 'interviews',
    label: 'Interviews',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    tooltip: 'Actively interviewing or waiting for interview feedback.',
    stages: ['Waiting for Interview Feedback', 'Awaiting Next Interview'],
  },
  {
    id: 'home-tasks',
    label: 'Home Tasks',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    tooltip: 'Home task assigned or submitted and under review.',
    stages: ['Home Task Assigned', 'Home Task Submitted (Under Review)'],
  },
  {
    id: 'references',
    label: 'References',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    tooltip: 'References have been requested by the company.',
    stages: ['References Requested'],
  },
];

// The default stage assigned when a card is dropped into a column
const COLUMN_DEFAULT_STAGE: Record<string, string> = {
  'initial-call': 'Initial Call Scheduled',
  'interviews': 'Waiting for Interview Feedback',
  'home-tasks': 'Home Task Assigned',
  'references': 'References Requested',
};

const CLOSED_STAGES = new Set<string>([]);

function stageToColumnId(stage: string): string {
  for (const col of BOARD_COLUMNS) {
    if (col.stages.includes(stage)) return col.id;
  }
  return 'initial-call';
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

    const updatePayload: any = { currentStage: newStage };

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
