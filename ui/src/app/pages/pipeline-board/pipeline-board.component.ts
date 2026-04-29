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

// Kanban column definitions — ordered pipeline stages
const BOARD_COLUMNS: { id: string; label: string; stages: string[] }[] = [
  {
    id: 'applied',
    label: 'Applied',
    stages: ['Application Submitted', 'Resume Under Review'],
  },
  {
    id: 'screening',
    label: 'Screening',
    stages: ['Initial Call Scheduled', 'Initial Call Completed'],
  },
  {
    id: 'interviewing',
    label: 'Interviewing',
    stages: [
      'Interview Scheduled',
      'Waiting for Interview Feedback',
      'Awaiting Next Interview',
    ],
  },
  {
    id: 'assessment',
    label: 'Assessment',
    stages: ['Home Task Assigned', 'Home Task Submitted (Under Review)'],
  },
  {
    id: 'final',
    label: 'Final',
    stages: [
      'Final Interview Scheduled',
      'References Requested',
      'Background Check in Progress',
    ],
  },
  {
    id: 'offer',
    label: 'Offer',
    stages: ['Offer Received', 'Offer in Negotiation', 'Offer Accepted', 'Offer Declined'],
  },
  {
    id: 'closed',
    label: 'Closed',
    stages: ['Withdrawn', 'Rejected', 'Position Put On Hold', 'Ghosted / No Response'],
  },
];

// The default stage assigned when a card is dropped into a column
const COLUMN_DEFAULT_STAGE: Record<string, string> = {
  applied: 'Application Submitted',
  screening: 'Initial Call Scheduled',
  interviewing: 'Interview Scheduled',
  assessment: 'Home Task Assigned',
  final: 'Final Interview Scheduled',
  offer: 'Offer Received',
  closed: 'Rejected',
};

const CLOSED_STAGES = new Set(['Withdrawn', 'Rejected', 'Position Put On Hold', 'Ghosted / No Response']);

function stageToColumnId(stage: string): string {
  for (const col of BOARD_COLUMNS) {
    if (col.stages.includes(stage)) return col.id;
  }
  return 'applied';
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
  ) {}

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

    // Already in this column — no-op
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
}
