import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MailCoverageService } from '../../services/mail-coverage.service';
import { ProcessesService } from '../../services/processes.service';
import { SettingsService } from '../../services/settings.service';

type ContactStatus =
  | 'Withdrawn'
  | 'Rejected'
  | 'CV received'
  | 'Rejection email';

interface ContactHistoryRow {
  key: string;
  companyName: string;
  role: string;
  status: ContactStatus;
  date: string;
  dateLabel: string;
  count: number;
  details: string;
  processId?: number;
}

@Component({
  selector: 'app-contact-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './contact-history.component.html',
  styleUrls: ['./contact-history.component.css'],
})
export class ContactHistoryComponent implements OnInit {
  rows: ContactHistoryRow[] = [];
  isLoading = true;
  loadFailed = false;
  searchText = '';
  statusFilter = '';
  readonly statuses: ContactStatus[] = [
    'Withdrawn',
    'Rejected',
    'CV received',
    'Rejection email',
  ];

  constructor(
    private readonly mailCoverageService: MailCoverageService,
    private readonly processesService: ProcessesService,
    private readonly settingsService: SettingsService,
  ) {}

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.isLoading = true;
    this.loadFailed = false;
    forkJoin({
      mail: this.mailCoverageService.getAll(),
      processes: this.processesService.getAll(),
    }).subscribe({
      next: ({ mail, processes }) => {
        const rows: ContactHistoryRow[] = [];
        for (const process of processes) {
          const stage = process.currentStage?.trim().toLowerCase();
          if (!['rejected', 'withdrawn', 'withdraw'].includes(stage)) continue;
          const rejected = stage === 'rejected';
          rows.push({
            key: `process-${process.id}`,
            companyName: process.companyName,
            role: process.roleTitle || '—',
            status: rejected ? 'Rejected' : 'Withdrawn',
            date: process.updatedAt,
            dateLabel: 'Application updated',
            count: 1,
            details: rejected
              ? process.rejectionSummary?.trim() || 'No rejection summary'
              : process.withdrawReason?.trim() || 'No withdrawal reason',
            processId: process.id,
          });
        }
        for (const entry of mail) {
          if (entry.receivedCvEmail) {
            rows.push({
              key: `received-${entry.id}`,
              companyName: entry.companyName,
              role: '—',
              status: 'CV received',
              date: entry.receivedCvDate || '',
              dateLabel: 'Recorded CV email date',
              count: entry.receivedCvCount || 1,
              details: entry.note || '—',
            });
          }
          if (entry.rejectedEmail) {
            rows.push({
              key: `rejected-${entry.id}`,
              companyName: entry.companyName,
              role: '—',
              status: 'Rejection email',
              date: entry.rejectedDate || '',
              dateLabel: 'Recorded rejection email date',
              count: entry.rejectedCount || 1,
              details: entry.note || '—',
            });
          }
        }
        this.rows = rows.sort(
          (a, b) =>
            (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) ||
            a.companyName.localeCompare(b.companyName),
        );
        this.isLoading = false;
      },
      error: () => {
        this.loadFailed = true;
        this.isLoading = false;
      },
    });
  }

  get filteredRows(): ContactHistoryRow[] {
    const query = this.searchText.trim().toLowerCase();
    return this.rows.filter(
      (row) =>
        (!this.statusFilter || row.status === this.statusFilter) &&
        (!query ||
          `${row.companyName} ${row.role} ${row.details}`
            .toLowerCase()
            .includes(query)),
    );
  }

  get companyCount(): number {
    return new Set(this.rows.map((row) => row.companyName.trim().toLowerCase()))
      .size;
  }

  formatDate(value: string): string {
    return value
      ? this.settingsService.formatDate(new Date(value))
      : 'Date not recorded';
  }

  trackByKey(_index: number, row: ContactHistoryRow): string {
    return row.key;
  }
}
