import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  CompanyHistoryDetail,
  CompanyHistoryItem,
  CompanyIntelligenceService,
  CompanyResearchReport,
  EmployeeCount,
  JobMatchResult,
  ResearchHandoffDetail,
  ResearchHandoffSummary,
} from '../../services/company-intelligence.service';

type IntelligenceTab = 'research' | 'jobs' | 'history' | 'handoffs';

@Component({
  selector: 'app-company-intelligence',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-intelligence.component.html',
  styleUrl: './company-intelligence.component.css',
})
export class CompanyIntelligenceComponent {
  activeTab: IntelligenceTab = 'research';

  companyName = '';
  role = '';
  forceRefresh = false;

  companyReport: CompanyResearchReport | null = null;
  jobResult: JobMatchResult | null = null;

  history: CompanyHistoryItem[] = [];
  historyFilter = '';
  historyDetail: CompanyHistoryDetail | null = null;

  handoffs: ResearchHandoffSummary[] = [];
  handoffDetail: ResearchHandoffDetail | null = null;
  handoffImportContent = '';
  copiedPrompt = false;
  readonly handoffPageSize = 20;
  handoffOffset = 0;
  hasMoreHandoffs = false;

  loading = false;
  errorMessage = '';

  constructor(private readonly intelligence: CompanyIntelligenceService) {}

  setTab(tab: IntelligenceTab): void {
    this.activeTab = tab;
    this.errorMessage = '';
    if (tab === 'history' && this.history.length === 0) this.loadHistory();
    if (tab === 'handoffs' && this.handoffs.length === 0) this.loadHandoffs(true);
  }

  researchCompany(): void {
    const companyName = this.companyName.trim();
    if (!companyName) {
      this.errorMessage = 'יש להזין שם חברה.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.companyReport = null;

    this.intelligence
      .researchCompany(companyName, this.role, this.forceRefresh)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (report) => (this.companyReport = report),
        error: (error) => this.handleError(error, 'מחקר החברה נכשל.'),
      });
  }

  matchJobs(): void {
    const companyName = this.companyName.trim();
    if (!companyName) {
      this.errorMessage = 'יש להזין שם חברה.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.jobResult = null;

    this.intelligence
      .matchJobs(companyName, this.forceRefresh)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (result) => (this.jobResult = result),
        error: (error) => this.handleError(error, 'התאמת המשרות נכשלה.'),
      });
  }

  loadHistory(): void {
    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .listHistory()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (items) => (this.history = items),
        error: (error) => this.handleError(error, 'לא ניתן היה לטעון את ההיסטוריה.'),
      });
  }

  openHistory(item: CompanyHistoryItem): void {
    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .getHistoryDetail(item.companyId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (detail) => (this.historyDetail = detail),
        error: (error) =>
          this.handleError(error, 'לא ניתן היה לטעון את פרטי החברה השמורים.'),
      });
  }

  closeHistoryDetail(): void {
    this.historyDetail = null;
  }

  deleteHistory(item: CompanyHistoryItem): void {
    if (
      !window.confirm(
        `למחוק את כל מחקרי החברה השמורים עבור ${item.companyName}?`,
      )
    ) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .deleteHistory(item.companyId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.history = this.history.filter(
            (candidate) => candidate.companyId !== item.companyId,
          );
          if (this.historyDetail?.companyId === item.companyId) {
            this.historyDetail = null;
          }
        },
        error: (error) =>
          this.handleError(error, 'לא ניתן היה למחוק את החברה השמורה.'),
      });
  }

  loadHandoffs(reset = true): void {
    if (!reset && !this.hasMoreHandoffs) return;

    const offset = reset ? 0 : this.handoffOffset;
    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .listPendingHandoffs(this.handoffPageSize, offset)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (items) => {
          this.handoffs = reset ? items : [...this.handoffs, ...items];
          this.handoffOffset = offset + items.length;
          this.hasMoreHandoffs = items.length === this.handoffPageSize;
        },
        error: (error) =>
          this.handleError(error, 'לא ניתן היה לטעון את מחקרי ChatGPT הממתינים.'),
      });
  }

  removePendingHandoff(item: ResearchHandoffSummary): void {
    if (
      !window.confirm(
        `להסיר את ${item.companyName} מרשימת המחקרים הממתינים?`,
      )
    ) {
      return;
    }

    const compatible = this.handoffs.filter((candidate) =>
      this.handoffsAreCompatible(candidate, item),
    );
    const ids = compatible.map((candidate) => candidate.id);

    this.loading = true;
    this.errorMessage = '';
    forkJoin(ids.map((id) => this.intelligence.cancelHandoff(id)))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          const removed = new Set(ids);
          this.handoffs = this.handoffs.filter(
            (candidate) => !removed.has(candidate.id),
          );
          if (this.handoffDetail && removed.has(this.handoffDetail.id)) {
            this.closeHandoff();
          }
        },
        error: (error) =>
          this.handleError(error, 'לא ניתן היה להסיר את המחקר מהממתינים.'),
      });
  }

  openHandoff(item: ResearchHandoffSummary): void {
    this.loading = true;
    this.errorMessage = '';
    this.copiedPrompt = false;
    this.handoffImportContent = '';
    this.intelligence
      .getHandoff(item.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (detail) => (this.handoffDetail = detail),
        error: (error) =>
          this.handleError(error, 'לא ניתן היה לטעון את פרטי משימת המחקר.'),
      });
  }

  closeHandoff(): void {
    this.handoffDetail = null;
    this.handoffImportContent = '';
    this.copiedPrompt = false;
  }

  startHandoff(): void {
    if (!this.handoffDetail) return;
    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .startHandoff(this.handoffDetail.id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (detail) => {
          this.handoffDetail = detail;
          this.refreshHandoffSummary(detail);
        },
        error: (error) =>
          this.handleError(error, 'לא ניתן היה להתחיל את משימת המחקר.'),
      });
  }

  importHandoff(): void {
    if (!this.handoffDetail || !this.handoffImportContent.trim()) {
      this.errorMessage = 'יש להדביק את תוצאת המחקר מ־ChatGPT לפני הייבוא.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const id = this.handoffDetail.id;
    this.intelligence
      .importHandoffResearch(id, this.handoffImportContent.trim())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.handoffs = this.handoffs.filter((item) => item.id !== id);
          this.handoffDetail = null;
          this.handoffImportContent = '';
          this.loadHistory();
        },
        error: (error) =>
          this.handleError(error, 'לא ניתן היה לייבא את מחקר ChatGPT.'),
      });
  }

  async copyHandoffPrompt(): Promise<void> {
    if (!this.handoffDetail?.chatGptPrompt) return;
    try {
      await navigator.clipboard.writeText(this.handoffDetail.chatGptPrompt);
      this.copiedPrompt = true;
      window.setTimeout(() => (this.copiedPrompt = false), 1800);
    } catch {
      this.errorMessage = 'לא ניתן היה להעתיק את הפרומפט. אפשר לסמן ולהעתיק אותו ידנית.';
    }
  }

  useHistoryCompany(item: CompanyHistoryItem, tab: 'research' | 'jobs'): void {
    this.companyName = item.companyName;
    this.historyDetail = null;
    this.setTab(tab);
  }

  openSavedReport(detail: CompanyHistoryDetail): void {
    this.companyName = detail.report.companyName;
    this.companyReport = detail.report;
    this.historyDetail = null;
    this.errorMessage = '';
    this.activeTab = 'research';
  }

  get visibleHandoffs(): ResearchHandoffSummary[] {
    const visible: ResearchHandoffSummary[] = [];
    for (const item of this.handoffs) {
      const existingIndex = visible.findIndex((candidate) =>
        this.handoffsAreCompatible(candidate, item),
      );
      if (existingIndex === -1) {
        visible.push(item);
        continue;
      }

      if (
        !visible[existingIndex].roleTitle?.trim() &&
        item.roleTitle?.trim()
      ) {
        visible[existingIndex] = item;
      }
    }
    return visible;
  }

  get filteredHistory(): CompanyHistoryItem[] {
    const filter = this.historyFilter.trim().toLowerCase();
    if (!filter) return this.history;
    return this.history.filter((item) =>
      [item.companyName, item.city, item.whatTheyDo]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(filter)),
    );
  }

  employeeCount(value: EmployeeCount | null): string {
    if (!value) return 'לא ידוע';
    if ('count' in value) {
      return `${value.approximate ? '~' : ''}${value.count.toLocaleString()}`;
    }
    return `~${value.min.toLocaleString()}–${value.max.toLocaleString()}`;
  }

  evidenceLabel(level: string | null | undefined): string {
    const labels: Record<string, string> = {
      strong: 'חזקה',
      partial: 'חלקית',
      limited: 'מוגבלת',
    };
    return level ? labels[level] ?? level : 'לא ידוע';
  }

  confidenceLabel(level: string): string {
    return ({ high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' } as Record<string, string>)[level] ?? level;
  }

  matchLevelLabel(level: string): string {
    return ({ strong: 'חזקה', good: 'טובה', possible: 'אפשרית' } as Record<string, string>)[level] ?? level;
  }

  jobEvidenceLabel(level: string): string {
    return ({ 'page-read': 'עמוד המשרה נקרא', 'search-snippet': 'תקציר מתוצאות חיפוש' } as Record<string, string>)[level] ?? level;
  }

  sourceTypeLabel(type: string): string {
    return ({
      'company-site': 'אתר החברה',
      news: 'חדשות',
      engineering: 'הנדסה',
      'employee-review': 'חוות דעת עובדים',
      'job-posting': 'מודעת דרושים',
      social: 'רשת חברתית',
      event: 'אירוע',
      other: 'מקור אחר',
    } as Record<string, string>)[type] ?? type;
  }

  handoffStatusLabel(status: string): string {
    return ({
      PENDING_CHATGPT: 'ממתין ל־ChatGPT',
      IN_PROGRESS: 'בתהליך',
      COMPLETED: 'הושלם',
      CANCELLED: 'בוטל',
    } as Record<string, string>)[status] ?? status;
  }

  eventTypeLabel(eventType: string): string {
    return ({
      RECRUITER_OUTREACH: 'פניית מגייס',
      INTERVIEW_INVITATION: 'הזמנה לראיון',
      INTERVIEW_SCHEDULING: 'תיאום ראיון',
      INTERVIEW_RESCHEDULE: 'שינוי מועד ראיון',
      INTERVIEW_CANCELLATION: 'ביטול ראיון',
      INTERVIEW_UPDATE: 'עדכון ראיון',
      HIRING_PROCESS_UPDATE: 'עדכון בתהליך הגיוס',
      APPLICATION_CONFIRMATION: 'אישור הגשת מועמדות',
      OTHER_RELEVANT: 'עדכון רלוונטי אחר',
      IRRELEVANT: 'לא רלוונטי',
    } as Record<string, string>)[eventType] ?? eventType.replaceAll('_', ' ');
  }

  trackByCompanyId(_index: number, item: CompanyHistoryItem): string {
    return item.companyId;
  }

  trackByHandoffId(_index: number, item: ResearchHandoffSummary): string {
    return item.id;
  }

  private handoffsAreCompatible(
    first: ResearchHandoffSummary,
    second: ResearchHandoffSummary,
  ): boolean {
    if (
      first.companyName.trim().toLowerCase() !==
      second.companyName.trim().toLowerCase()
    )
      return false;

    const firstRole = first.roleTitle?.trim().toLowerCase() || null;
    const secondRole = second.roleTitle?.trim().toLowerCase() || null;
    return !firstRole || !secondRole || firstRole === secondRole;
  }

  private refreshHandoffSummary(detail: ResearchHandoffDetail): void {
    this.handoffs = this.handoffs.map((item) =>
      item.id === detail.id
        ? {
            id: detail.id,
            companyName: detail.companyName,
            roleTitle: detail.roleTitle,
            eventType: detail.eventType,
            researchReason: detail.researchReason,
            status: detail.status,
            createdAt: detail.createdAt,
            notificationSentAt: detail.notificationSentAt,
          }
        : item,
    );
  }

  private handleError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      const message =
        typeof body?.message === 'string'
          ? body.message
          : Array.isArray(body?.message)
            ? body.message.join(' ')
            : null;
      this.errorMessage = message || `${fallback} (HTTP ${error.status})`;
      return;
    }
    this.errorMessage = fallback;
  }
}
