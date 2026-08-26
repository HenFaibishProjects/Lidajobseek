import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../../services/confirm.service';
import {
  MailCoverageEntry,
  MailCoveragePayload,
  MailCoverageService,
} from '../../services/mail-coverage.service';
import { SettingsService } from '../../services/settings.service';
import { ToastService } from '../../services/toast.service';

type CoverageFilter = 'all' | 'received' | 'rejected' | 'no-email';
type CoverageSort = 'company' | 'latest';

interface MailCoverageForm {
  companyName: string;
  note: string;
  receivedCvEmail: boolean;
  receivedCvDate: string;
  rejectedEmail: boolean;
  rejectedDate: string;
}

@Component({
  selector: 'app-mail-coverage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mail-coverage.component.html',
  styleUrls: ['./mail-coverage.component.css'],
})
export class MailCoverageComponent implements OnInit {
  entries: MailCoverageEntry[] = [];
  isLoading = true;
  isSaving = false;
  showForm = false;
  editingId: number | null = null;
  searchText = '';
  activeFilter: CoverageFilter = 'all';
  sortMode: CoverageSort = 'company';
  form: MailCoverageForm = this.emptyForm();

  constructor(
    private readonly mailCoverageService: MailCoverageService,
    private readonly confirmService: ConfirmService,
    private readonly settingsService: SettingsService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get filteredEntries(): MailCoverageEntry[] {
    const query = this.searchText.trim().toLowerCase();
    const filtered = this.entries.filter((entry) => {
      const matchesSearch =
        !query ||
        entry.companyName.toLowerCase().includes(query) ||
        entry.note?.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      switch (this.activeFilter) {
        case 'received':
          return entry.receivedCvEmail;
        case 'rejected':
          return entry.rejectedEmail;
        case 'no-email':
          return !entry.receivedCvEmail && !entry.rejectedEmail;
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => {
      if (this.sortMode === 'latest') {
        return (
          this.latestActivityTimestamp(b) - this.latestActivityTimestamp(a)
        );
      }
      return a.companyName.localeCompare(b.companyName, undefined, {
        sensitivity: 'base',
      });
    });
  }

  load(): void {
    this.isLoading = true;
    this.mailCoverageService.getAll().subscribe({
      next: (entries) => {
        this.entries = entries;
        this.isLoading = false;
      },
      error: () => {
        this.toastService.show('Failed to load mail coverage', 'error');
        this.isLoading = false;
      },
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.showForm = true;
  }

  startEdit(entry: MailCoverageEntry): void {
    this.editingId = entry.id;
    this.form = {
      companyName: entry.companyName,
      note: entry.note || '',
      receivedCvEmail: entry.receivedCvEmail,
      receivedCvDate: this.toInputDate(entry.receivedCvDate),
      rejectedEmail: entry.rejectedEmail,
      rejectedDate: this.toInputDate(entry.rejectedDate),
    };
    this.showForm = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.form = this.emptyForm();
  }

  onReceivedToggle(): void {
    if (this.form.receivedCvEmail && !this.form.receivedCvDate) {
      this.form.receivedCvDate = this.today();
    }
    if (!this.form.receivedCvEmail) {
      this.form.receivedCvDate = '';
    }
  }

  onRejectedToggle(): void {
    if (this.form.rejectedEmail && !this.form.rejectedDate) {
      this.form.rejectedDate = this.today();
    }
    if (!this.form.rejectedEmail) {
      this.form.rejectedDate = '';
    }
  }

  save(): void {
    const payload = this.buildPayload();
    if (!payload) return;

    this.isSaving = true;
    const request =
      this.editingId === null
        ? this.mailCoverageService.create(payload)
        : this.mailCoverageService.update(this.editingId, payload);

    request.subscribe({
      next: () => {
        this.toastService.show(
          this.editingId === null
            ? 'Company added to mail coverage'
            : 'Mail coverage updated',
          'success',
        );
        this.isSaving = false;
        this.cancelForm();
        this.load();
      },
      error: (error) => {
        const message = error?.error?.message || 'Failed to save mail coverage';
        this.toastService.show(message, 'error');
        this.isSaving = false;
      },
    });
  }

  async deleteEntry(entry: MailCoverageEntry): Promise<void> {
    if (
      !(await this.confirmService.delete(
        `mail coverage for "${entry.companyName}"`,
      ))
    ) {
      return;
    }

    this.mailCoverageService.delete(entry.id).subscribe({
      next: () => {
        this.entries = this.entries.filter((item) => item.id !== entry.id);
        if (this.editingId === entry.id) this.cancelForm();
        this.toastService.show('Mail coverage entry removed', 'success');
      },
      error: () =>
        this.toastService.show('Failed to remove mail coverage entry', 'error'),
    });
  }

  clearSearch(): void {
    this.searchText = '';
  }

  setFilter(filter: CoverageFilter): void {
    this.activeFilter = filter;
  }

  formatDate(value: string | null): string {
    if (!value) return '';
    const normalized = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(normalized.getTime())
      ? ''
      : this.settingsService.formatDate(normalized);
  }

  trackById(_index: number, entry: MailCoverageEntry): number {
    return entry.id;
  }

  private buildPayload(): MailCoveragePayload | null {
    const companyName = this.form.companyName.trim();
    if (!companyName) {
      this.toastService.show('Company name is required', 'error');
      return null;
    }
    if (this.form.receivedCvEmail && !this.form.receivedCvDate) {
      this.toastService.show('Choose the CV received email date', 'error');
      return null;
    }
    if (this.form.rejectedEmail && !this.form.rejectedDate) {
      this.toastService.show('Choose the rejection email date', 'error');
      return null;
    }
    if (
      this.form.receivedCvEmail &&
      this.form.rejectedEmail &&
      this.form.rejectedDate < this.form.receivedCvDate
    ) {
      this.toastService.show(
        'Rejection date cannot be earlier than the CV received date',
        'error',
      );
      return null;
    }

    return {
      companyName,
      note: this.form.note.trim() || null,
      receivedCvEmail: this.form.receivedCvEmail,
      receivedCvDate: this.form.receivedCvEmail
        ? this.form.receivedCvDate
        : null,
      rejectedEmail: this.form.rejectedEmail,
      rejectedDate: this.form.rejectedEmail ? this.form.rejectedDate : null,
    };
  }

  private latestActivityTimestamp(entry: MailCoverageEntry): number {
    const value = entry.rejectedDate || entry.receivedCvDate || entry.updatedAt;
    return new Date(value).getTime();
  }

  private toInputDate(value: string | null): string {
    return value ? value.slice(0, 10) : '';
  }

  private today(): string {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }

  private emptyForm(): MailCoverageForm {
    return {
      companyName: '',
      note: '',
      receivedCvEmail: false,
      receivedCvDate: '',
      rejectedEmail: false,
      rejectedDate: '',
    };
  }
}
