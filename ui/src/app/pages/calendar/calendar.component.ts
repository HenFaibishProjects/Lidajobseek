import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { OrderByDatePipe } from '../../pipes/order-by-date.pipe';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { SettingsService } from '../../services/settings.service';
import {
  getInterviewTypeColor as resolveInterviewTypeColor,
  getInterviewTypeLabel as resolveInterviewTypeLabel
} from '../../shared/interview-types';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, OrderByDatePipe],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
  interviews: any[] = [];
  processes: any[] = [];
  filteredProcesses: any[] = [];
  loading = true;
  selectedProcessId: string = '';
  selectedProcess: any = null;
  processSearch: string = '';
  startDate: string = '';
  endDate: string = '';
  showAllInterviews = false; // Default unchecked = show only upcoming

  constructor(
    private interactionsService: InteractionsService,
    private processesService: ProcessesService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private settingsService: SettingsService,
  ) {}

  ngOnInit() {
    this.loadProcesses();
    this.loadInterviews();

    // Set default date range: today to next 30 days
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);

    this.startDate = this.formatDateForInput(today);
    this.endDate = this.formatDateForInput(nextMonth);
  }

  formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
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

  loadInterviews() {
    this.loading = true;
    const params: any = {};

    if (this.selectedProcessId) {
      params.processId = this.selectedProcessId;
    }

    if (this.startDate) {
      params.startDate = this.startDate + 'T00:00:00.000Z';
    }

    if (this.endDate) {
      params.endDate = this.endDate + 'T23:59:59.999Z';
    }

        this.interactionsService.getAll(params).subscribe({
      next: (interviews) => {
        // Filter interviews based on showAllInterviews checkbox
        if (!this.showAllInterviews) {
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Start of today (midnight)
          interviews = interviews.filter((interview: any) => {
            const interviewDate = new Date(interview.date);
            interviewDate.setHours(0, 0, 0, 0); // Compare dates without time
            return interviewDate >= today; // Show interviews from today onward
          });
        }
        this.interviews = interviews;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load interviews', err);
        this.loading = false;
      }
    });
  }

  onFilterChange() {
    this.loadInterviews();
  }

  getInterviewColor(interviewType: string): string {
    return resolveInterviewTypeColor(interviewType);
  }

  getInterviewTypeLabel(interviewType: string): string {
    return resolveInterviewTypeLabel(interviewType);
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays[date.getDay()];
    return `${weekday}, ${this.settingsService.formatDate(date)} ${this.settingsService.formatTime(date)}`;
  }

  formatParticipants(participants: any[]): string {
    if (!participants || participants.length === 0) return 'No participants';
    return participants.map(p => p.name || p.role).join(', ');
  }

  onProcessSearchChange() {
    if (!this.processSearch.trim()) {
      this.filteredProcesses = [];
      return;
    }

    const searchTerm = this.processSearch.toLowerCase();
    this.filteredProcesses = this.processes.filter(process => {
      const companyName = process.companyName?.toLowerCase() || '';
      const roleTitle = process.roleTitle?.toLowerCase() || '';
      return companyName.includes(searchTerm) || roleTitle.includes(searchTerm);
    });
  }

  selectProcess(process: any) {
    this.selectedProcess = process;
    this.selectedProcessId = process.id;
    this.processSearch = '';
    this.filteredProcesses = [];
    this.onFilterChange();
  }

  clearProcessSelection() {
    this.selectedProcess = null;
    this.selectedProcessId = '';
    this.onFilterChange();
  }

  exportData() {
    this.interactionsService.exportData().subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobseek-calendar-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toastService.show('Export successful', 'success');
      },
      error: (err) => {
        console.error('Export failed', err);
        this.toastService.show('Export failed', 'error');
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const interactions = JSON.parse(e.target.result);

        const mode = await this.confirmService.custom({
          title: 'Import Calendar Data',
          message: 'How would you like to import the data?',
          buttons: [
            { text: 'Append', value: 'append', class: 'btn-secondary' },
            { text: 'Overwrite', value: 'overwrite', class: 'btn-danger' },
            { text: 'Cancel', value: null, class: 'btn-secondary' }
          ]
        });

        if (!mode) return;

        this.interactionsService.importData(interactions, mode).subscribe({
          next: () => {
            this.toastService.show('Import successful', 'success');
            this.loadInterviews(); // Reload data
          },
          error: (err) => {
            console.error('Import failed', err);
            this.toastService.show('Import failed', 'error');
          }
        });
      } catch (err) {
        console.error('Invalid file', err);
        this.toastService.show('Invalid JSON file', 'error');
      }
      // Reset input
      event.target.value = '';
    };
    reader.readAsText(file);
  }
}
