import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

  loading = false;
  errorMessage = '';

  constructor(private readonly intelligence: CompanyIntelligenceService) {}

  setTab(tab: IntelligenceTab): void {
    this.activeTab = tab;
    this.errorMessage = '';
    if (tab === 'history' && this.history.length === 0) this.loadHistory();
    if (tab === 'handoffs' && this.handoffs.length === 0) this.loadHandoffs();
  }

  researchCompany(): void {
    const companyName = this.companyName.trim();
    if (!companyName) {
      this.errorMessage = 'Please enter a company name.';
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
        error: (error) => this.handleError(error, 'Company research failed.'),
      });
  }

  matchJobs(): void {
    const companyName = this.companyName.trim();
    if (!companyName) {
      this.errorMessage = 'Please enter a company name.';
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
        error: (error) => this.handleError(error, 'Job matching failed.'),
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
        error: (error) => this.handleError(error, 'History could not be loaded.'),
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
          this.handleError(error, 'Saved company details could not be loaded.'),
      });
  }

  closeHistoryDetail(): void {
    this.historyDetail = null;
  }

  deleteHistory(item: CompanyHistoryItem): void {
    if (
      !window.confirm(
        `Delete all saved Company Intelligence research for ${item.companyName}?`,
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
          this.handleError(error, 'Saved company could not be deleted.'),
      });
  }

  loadHandoffs(): void {
    this.loading = true;
    this.errorMessage = '';
    this.intelligence
      .listPendingHandoffs()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (items) => (this.handoffs = items),
        error: (error) =>
          this.handleError(error, 'Pending ChatGPT research could not be loaded.'),
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
          this.handleError(error, 'Research handoff details could not be loaded.'),
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
          this.handleError(error, 'Research handoff could not be started.'),
      });
  }

  importHandoff(): void {
    if (!this.handoffDetail || !this.handoffImportContent.trim()) {
      this.errorMessage = 'Paste the ChatGPT research result before importing.';
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
          this.handleError(error, 'ChatGPT research could not be imported.'),
      });
  }

  async copyHandoffPrompt(): Promise<void> {
    if (!this.handoffDetail?.chatGptPrompt) return;
    try {
      await navigator.clipboard.writeText(this.handoffDetail.chatGptPrompt);
      this.copiedPrompt = true;
      window.setTimeout(() => (this.copiedPrompt = false), 1800);
    } catch {
      this.errorMessage = 'Could not copy the prompt. Select and copy it manually.';
    }
  }

  useHistoryCompany(item: CompanyHistoryItem, tab: 'research' | 'jobs'): void {
    this.companyName = item.companyName;
    this.historyDetail = null;
    this.setTab(tab);
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
    if (!value) return 'Unknown';
    if ('count' in value) {
      return `${value.approximate ? '~' : ''}${value.count.toLocaleString()}`;
    }
    return `~${value.min.toLocaleString()}–${value.max.toLocaleString()}`;
  }

  evidenceLabel(level: string | null | undefined): string {
    if (!level) return 'Unknown';
    return level.charAt(0).toUpperCase() + level.slice(1);
  }

  trackByCompanyId(_index: number, item: CompanyHistoryItem): string {
    return item.companyId;
  }

  trackByHandoffId(_index: number, item: ResearchHandoffSummary): string {
    return item.id;
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
