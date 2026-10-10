import { AvailabilityBlock, OccupiedInterval } from '../../services/availability.service';
import { AvailabilityEditorComponent } from '../../components/availability-editor/availability-editor.component';
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
  imports: [CommonModule, FormsModule, RouterModule, OrderByDatePipe, AvailabilityEditorComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
  interviews: any[] = [];
  availabilityIntervals: OccupiedInterval[] = [];
  availabilityLoading = false;
  availabilityError = false;
  showAvailabilityManager = false;
  showAvailabilityEditor = false;
  availabilityEditorDate = '';
  editingAvailabilityBlock: AvailabilityBlock | null = null;
  blockDetailsLoading = false;
  private availabilityRequest = 0;
  recentPastInterviews: any[] = [];
  recentPastInterviewsLoading = true;
  recentPastInterviewsError = false;
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
  viewMode: 'month' | 'week' | 'list' = 'list';
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
    this.generateCalendar();
    this.loadAvailability();
  }

  formatDateForInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
    this.loadRecentPastInterviews();
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
          params.startDate = new Date(`${this.startDate}T00:00:00`).toISOString();
        }
        if (this.endDate) {
          params.endDate = new Date(`${this.endDate}T23:59:59.999`).toISOString();
        }
    }

    this.interactionsService.getAll(params).subscribe({
      next: (interviews) => {
        // Double check filtering on the frontend to ensure "Show All" behavior
        if (!this.showAllInterviews) {
          const now = new Date();
          interviews = interviews.filter((interview: any) => {
            const interviewDate = new Date(interview.date);
            return interviewDate >= now;
          });
        }
        this.interviews = interviews;
        this.generateCalendar();
        this.loadAvailability();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load interviews', err);
        this.loading = false;
      }
    });
  }

  loadRecentPastInterviews() {
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const params: { startDate: string; endDate: string; processId?: string } = {
      startDate: yesterdayStart.toISOString(),
      endDate: now.toISOString(),
    };
    if (this.selectedProcessId) params.processId = this.selectedProcessId;

    this.recentPastInterviewsLoading = true;
    this.recentPastInterviewsError = false;
    this.interactionsService.getAll(params).subscribe({
      next: (interviews) => {
        this.recentPastInterviews = interviews
          .filter((interview: any) => {
            const interviewTime = new Date(interview.date).getTime();
            return interviewTime >= yesterdayStart.getTime() && interviewTime < now.getTime();
          })
          .sort((firstInterview: any, secondInterview: any) =>
            new Date(secondInterview.date).getTime() - new Date(firstInterview.date).getTime());
        this.recentPastInterviewsLoading = false;
      },
      error: () => {
        this.recentPastInterviews = [];
        this.recentPastInterviewsLoading = false;
        this.recentPastInterviewsError = true;
      },
    });
  }

  get calendarTimeZone(): string { return this.interactionsService.availability.browserTimeZone; }

  get manualIntervals(): OccupiedInterval[] { return this.availabilityIntervals.filter(interval => interval.source === 'MANUAL_BLOCK'); }

  changeView(view: 'month' | 'week' | 'list') { this.viewMode = view; this.generateCalendar(); this.loadAvailability(); }

  loadAvailability() {
    const requestId = ++this.availabilityRequest;
    let start: Date;
    let end: Date;
    if (this.viewMode === 'month') {
      start = new Date(this.calendarDays[0]?.date || this.currentMonthDate);
      end = new Date(start); end.setDate(end.getDate() + 42);
    } else if (this.viewMode === 'week') {
      start = new Date(this.weekDays[0]?.date || this.currentWeekDate);
      end = new Date(start); end.setDate(end.getDate() + 7);
    } else {
      start = this.startDate ? new Date(`${this.startDate}T00:00:00`) : new Date();
      if (this.showAllInterviews) start.setMonth(start.getMonth() - 1);
      end = this.endDate ? new Date(`${this.endDate}T00:00:00`) : new Date(start);
      if (this.endDate) end.setDate(end.getDate() + 1); else end.setDate(end.getDate() + 90);
    }
    start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
    if (!(end > start) || end.getTime() - start.getTime() > 366 * 86400000) {
      this.availabilityError = true; this.availabilityLoading = false; this.availabilityIntervals = []; this.generateCalendar(); return;
    }
    this.availabilityLoading = true; this.availabilityError = false;
    this.interactionsService.availability.getAvailability(start.toISOString(), end.toISOString()).subscribe({
      next: intervals => {
        if (requestId !== this.availabilityRequest) return;
        this.availabilityIntervals = intervals; this.availabilityLoading = false; this.generateCalendar();
      }, error: () => {
        if (requestId !== this.availabilityRequest) return;
        this.availabilityIntervals = []; this.availabilityLoading = false; this.availabilityError = true; this.generateCalendar();
      },
    });
  }

  blocksForDay(date: Date): OccupiedInterval[] {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return this.manualIntervals.filter(interval => new Date(interval.start) < end && new Date(interval.end) > start);
  }

  blockDayLabel(interval: OccupiedInterval, date: Date): string {
    if (interval.allDay) return 'Entire day';
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const start = new Date(Math.max(Date.parse(interval.start), dayStart.getTime()));
    const end = new Date(Math.min(Date.parse(interval.end), dayEnd.getTime()));
    const time = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    return `${time(start)}–${end.getTime() === dayEnd.getTime() ? '24:00' : time(end)}`;
  }

  blockRange(interval: OccupiedInterval): string {
    return interval.allDay ? `Entire day · ${interval.timeZone}` : `${this.formatDateTime(interval.start)} – ${this.formatDateTime(interval.end)}`;
  }

  openAvailabilityEditor(date?: Date) {
    this.editingAvailabilityBlock = null;
    this.availabilityEditorDate = this.formatDateForInput(date || this.selectedDay?.date || new Date());
    this.showAvailabilityEditor = true;
  }

  editAvailability(interval: OccupiedInterval) {
    if (this.blockDetailsLoading) return;
    this.blockDetailsLoading = true;
    this.interactionsService.availability.getBlock(interval.recordId).subscribe({ next: block => {
      this.editingAvailabilityBlock = block; this.showAvailabilityEditor = true; this.blockDetailsLoading = false;
    }, error: () => { this.blockDetailsLoading = false; this.toastService.show('Could not load availability block', 'error'); } });
  }

  availabilitySaved() {
    this.showAvailabilityEditor = false; this.editingAvailabilityBlock = null; this.loadAvailability();
  }

  onFilterChange() {
    this.loadInterviews();
  }

  get nextInterview(): any | null {
    if (!this.interviews || this.interviews.length === 0) return null;
    
    const now = new Date();

    // Find the first interview that is >= now
    return [...this.interviews]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .find(i => new Date(i.date) >= now) || null;
  }

  get otherInterviews(): any[] {
    const next = this.nextInterview;
    if (!next) return this.interviews;
    return this.interviews.filter(i => i.id !== next.id);
  }

  isNextInterview(interview: any): boolean {
    const next = this.nextInterview;
    return !!next && Number(interview?.id) === Number(next.id);
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

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekday = weekdays[date.getDay()];
    return `${weekday}, ${this.settingsService.formatDate(date)} ${this.settingsService.formatTime(date)}`;
  }

  getEndTime(dateString: string, durationMinutes?: number): Date | null {
    if (!durationMinutes) return null;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + durationMinutes * 60000);
  }

  formatDuration(durationMinutes?: number): string {
    if (!durationMinutes || durationMinutes <= 0) return '';

    const totalMinutes = Math.round(durationMinutes);
    if (totalMinutes === 30) return 'Half an hour';
    if (totalMinutes === 60) return 'One hour';
    if (totalMinutes < 60) {
      return `${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hoursLabel = hours === 1 ? 'One hour' : `${hours} hours`;

    if (minutes === 0) return hoursLabel;
    return `${hoursLabel} and ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
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
        interviews: dayInterviews,
        blocks: this.blocksForDay(dayDate),
        hasAllDayBlock: this.blocksForDay(dayDate).some(interval => interval.allDay)
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
        interviews: dayInterviews,
        blocks: this.blocksForDay(dayDate),
        hasAllDayBlock: this.blocksForDay(dayDate).some(interval => interval.allDay)
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
        interviews: refreshedInterviews,
        blocks: this.blocksForDay(selDate),
        hasAllDayBlock: this.blocksForDay(selDate).some(interval => interval.allDay)
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
    this.loadAvailability();
  }

  nextMonth() {
    this.currentMonthDate = new Date(
      this.currentMonthDate.getFullYear(),
      this.currentMonthDate.getMonth() + 1,
      1
    );
    this.generateCalendar();
    this.loadAvailability();
  }

  todayMonth() {
    this.currentMonthDate = new Date();
    this.generateCalendar();
    this.loadAvailability();
  }

  // Week navigation
  prevWeek() {
    const nextDate = new Date(this.currentWeekDate);
    nextDate.setDate(nextDate.getDate() - 7);
    this.currentWeekDate = nextDate;
    this.generateCalendar();
    this.loadAvailability();
  }

  nextWeek() {
    const nextDate = new Date(this.currentWeekDate);
    nextDate.setDate(nextDate.getDate() + 7);
    this.currentWeekDate = nextDate;
    this.generateCalendar();
    this.loadAvailability();
  }

  todayWeek() {
    this.currentWeekDate = new Date();
    this.generateCalendar();
    this.loadAvailability();
  }

  async deleteInterview(id: number) {
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to delete this interview?',
      'Delete Interview'
    );

    if (confirmed) {
      this.interactionsService.delete(id).subscribe({
        next: () => {
          this.toastService.show('Interview deleted successfully', 'success');
          this.loadInterviews();
        },
        error: (err) => {
          console.error('Failed to delete interview', err);
          this.toastService.show('Failed to delete interview', 'error');
        }
      });
    }
  }
}
