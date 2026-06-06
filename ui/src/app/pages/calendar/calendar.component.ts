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
  getInterviewTypeLabel as resolveInterviewTypeLabel,
  normalizeInterviewType
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

  // Calendar Grid Mode properties
  viewMode: 'month' | 'week' | 'list' = 'month';
  currentMonthDate: Date = new Date();
  currentWeekDate: Date = new Date();
  calendarDays: any[] = [];
  weekDays: any[] = [];
  selectedDay: any = null;
  weekDaysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

    // Default: Show from today onwards, no end date limit (show all upcoming)
    const today = new Date();
    this.startDate = this.formatDateForInput(today);
    this.endDate = ''; 
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

    // Only apply date filters if we are NOT showing all interviews
    // or if the user explicitly wants to filter a specific range while showing all.
    // However, the requirement is "Show all" should see everything including past.
    if (!this.showAllInterviews) {
        if (this.startDate) {
          params.startDate = this.startDate + 'T00:00:00.000Z';
        }
        if (this.endDate) {
          params.endDate = this.endDate + 'T23:59:59.999Z';
        }
    }

    this.interactionsService.getAll(params).subscribe({
      next: (interviews) => {
        // Double check filtering on the frontend to ensure "Show All" behavior
        if (!this.showAllInterviews) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          interviews = interviews.filter((interview: any) => {
            const interviewDate = new Date(interview.date);
            interviewDate.setHours(0, 0, 0, 0);
            return interviewDate >= today;
          });
        }
        this.interviews = interviews;
        this.generateCalendar();
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

  get nextInterview(): any | null {
    if (!this.interviews || this.interviews.length === 0) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the first interview that is >= today
    return [...this.interviews]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .find(i => new Date(i.date) >= today) || null;
  }

  get otherInterviews(): any[] {
    const next = this.nextInterview;
    if (!next) return this.interviews;
    return this.interviews.filter(i => i.id !== next.id);
  }

  getInterviewColor(interviewType: string): string {
    const normalized = normalizeInterviewType(interviewType);
    if (normalized === 'phone_screen') {
      return '#3b82f6'; // Phone: Blue
    } else if (normalized === 'virtual_video' || normalized === 'async_video') {
      return '#8b5cf6'; // Video: Violet
    } else if (normalized === 'onsite') {
      return '#10b981'; // In Person: Emerald
    } else {
      return '#ffffff'; // Other: White
    }
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

  generateCalendar() {
    this.generateMonthDays();
    this.generateWeekDays();
    this.updateSelectedDayInterviews();
  }

  generateMonthDays() {
    const year = this.currentMonthDate.getFullYear();
    const month = this.currentMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    
    // We want to fill a 6-week grid (42 days)
    const startDate = new Date(year, month, 1 - startDayOfWeek);
    const tempDate = new Date(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const dayDate = new Date(tempDate);
      dayDate.setHours(0, 0, 0, 0);

      // Find interviews on this day
      const dayInterviews = this.interviews.filter(item => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate.getTime() === dayDate.getTime();
      });

      days.push({
        date: new Date(tempDate),
        isCurrentMonth: tempDate.getMonth() === month,
        isToday: dayDate.getTime() === today.getTime(),
        interviews: dayInterviews
      });

      tempDate.setDate(tempDate.getDate() + 1);
    }
    this.calendarDays = days;
  }

  generateWeekDays() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = this.currentWeekDate.getDay();
    const startOfWeek = new Date(this.currentWeekDate);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const tempDate = new Date(startOfWeek);
      tempDate.setDate(startOfWeek.getDate() + i);
      const dayDate = new Date(tempDate);
      dayDate.setHours(0, 0, 0, 0);

      const dayInterviews = this.interviews.filter(item => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate.getTime() === dayDate.getTime();
      });

      days.push({
        date: tempDate,
        isToday: dayDate.getTime() === today.getTime(),
        interviews: dayInterviews
      });
    }
    this.weekDays = days;
  }

  updateSelectedDayInterviews() {
    if (!this.selectedDay) {
      // Find today in calendarDays
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      this.selectedDay = this.calendarDays.find(d => {
        const dDate = new Date(d.date);
        dDate.setHours(0, 0, 0, 0);
        return dDate.getTime() === today.getTime();
      }) || this.calendarDays[0];
    } else {
      // Refresh the selected day interviews from current list
      const selDate = new Date(this.selectedDay.date);
      selDate.setHours(0, 0, 0, 0);
      
      const refreshedInterviews = this.interviews.filter(item => {
        const itemDate = new Date(item.date);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate.getTime() === selDate.getTime();
      });
      
      this.selectedDay = {
        ...this.selectedDay,
        interviews: refreshedInterviews
      };
    }
  }

  selectDay(day: any) {
    this.selectedDay = day;
  }

  // Month navigation
  prevMonth() {
    this.currentMonthDate = new Date(
      this.currentMonthDate.getFullYear(),
      this.currentMonthDate.getMonth() - 1,
      1
    );
    this.generateCalendar();
  }

  nextMonth() {
    this.currentMonthDate = new Date(
      this.currentMonthDate.getFullYear(),
      this.currentMonthDate.getMonth() + 1,
      1
    );
    this.generateCalendar();
  }

  todayMonth() {
    this.currentMonthDate = new Date();
    this.generateCalendar();
  }

  // Week navigation
  prevWeek() {
    const nextDate = new Date(this.currentWeekDate);
    nextDate.setDate(nextDate.getDate() - 7);
    this.currentWeekDate = nextDate;
    this.generateCalendar();
  }

  nextWeek() {
    const nextDate = new Date(this.currentWeekDate);
    nextDate.setDate(nextDate.getDate() + 7);
    this.currentWeekDate = nextDate;
    this.generateCalendar();
  }

  todayWeek() {
    this.currentWeekDate = new Date();
    this.generateCalendar();
  }
}
