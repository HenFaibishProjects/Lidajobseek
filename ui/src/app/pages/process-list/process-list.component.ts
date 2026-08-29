import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProcessesService } from '../../services/processes.service';
import { InteractionsService } from '../../services/interactions.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { SettingsService, UserSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { PROCESS_STAGES } from '../../shared/process-stages';
import { Subscription } from 'rxjs';
import Chart from 'chart.js/auto';


const ACTIVE_STAGES = new Set([
    'Initial Call Scheduled',
    'Waiting for Interview Feedback',
    'Awaiting Next Interview',
    'Awaiting New Interview Date',
    'Home Task Assigned',
    'Home Task Submitted (Under Review)',
    'References Requested',
]);

const INTERVIEW_STAGES = new Set([
    'Initial Call Scheduled',
    'Waiting for Interview Feedback',
    'Awaiting Next Interview',
    'Awaiting New Interview Date',
]);

const OFFER_STAGES = new Set<string>([]);

const CLOSED_STAGES = new Set<string>([]);

const NON_INTERVIEW_STAGES = new Set([
    'Home Task Assigned',
    'Home Task Submitted (Under Review)',
    'References Requested',
]);

const RESPONDED_STAGES = new Set<string>([]);

type KpiModalType = 'total' | 'inProgress' | 'rejected' | 'withdrawn';

const KPI_MODAL_CONFIG: Record<KpiModalType, {
    eyebrow: string;
    title: string;
    description: string;
    themeClass: string;
}> = {
    total: {
        eyebrow: 'Complete portfolio',
        title: 'Every application, one view',
        description: 'Your full job-search history, from active conversations to closed opportunities.',
        themeClass: 'total',
    },
    inProgress: {
        eyebrow: 'Live pipeline',
        title: 'Opportunities in motion',
        description: 'The applications that are active right now and still moving forward.',
        themeClass: 'in-progress',
    },
    rejected: {
        eyebrow: 'Closed opportunities',
        title: 'Rejected applications',
        description: 'A clear record of processes that ended with a company rejection.',
        themeClass: 'rejected',
    },
    withdrawn: {
        eyebrow: 'Your decisions',
        title: 'Withdrawn applications',
        description: 'The opportunities you chose to leave, kept available for context and learning.',
        themeClass: 'withdrawn',
    },
};

@Component({
    selector: 'app-process-list',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
    templateUrl: './process-list.component.html',
    styleUrls: ['./process-list.component.css']
})
export class ProcessListComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('dashTimelineChart') timelineRef!: ElementRef;

    processes: any[] = [];
    processesOnActioin: any[] = [];
    filteredProcesses: any[] = [];
    tasks: any[] = [];
    isLoading: boolean = true;

    // View mode
    viewMode: 'grid' | 'list' = 'list';

    // Sorting properties
    sortColumn: string = '';
    sortDirection: 'asc' | 'desc' = 'asc';

    // Filter properties
    searchText: string = '';
    selectedStage: string = '';
    selectedWorkMode: string = '';
    showAllProcesses: boolean = false;

    // KPI detail modal
    activeKpiModal: KpiModalType | null = null;
    kpiModalSearchText = '';
    private previousBodyOverflow = '';
    private isBodyScrollLocked = false;

    // Available options for filters
    availableWorkModes: string[] = ['remote', 'hybrid', 'onsite'];

    get availableStages(): string[] {
        const existingStages = Array.from(new Set(
            this.processes
                .map(process => process?.currentStage?.toString().trim())
                .filter((stage): stage is string => !!stage),
        ));
        const preferredOrder = new Map(
            [...PROCESS_STAGES, 'Rejected', 'Withdrawn'].map((stage, index) => [stage, index]),
        );

        return existingStages.sort((first, second) => {
            const firstIndex = preferredOrder.get(first) ?? Number.MAX_SAFE_INTEGER;
            const secondIndex = preferredOrder.get(second) ?? Number.MAX_SAFE_INTEGER;
            return firstIndex === secondIndex
                ? first.localeCompare(second)
                : firstIndex - secondIndex;
        });
    }

    getStageProcessCount(stage: string): number {
        return this.processes.filter(process => process?.currentStage === stage).length;
    }

    userDisplayName: string = 'Your Job Search';
    settings!: UserSettings;
    private settingsSub!: Subscription;
    private dashCharts: { [key: string]: any } = {};

    kpiTimeRange: 'all' | 'week' | '2weeks' | '3weeks' | 'month' | 'quarter' | 'year' = 'all';

    // ─── Interaction History Drawer ────────────────────────────────────────────
    drawerOpen = false;
    drawerProcess: any = null;
    drawerInteractions: any[] = [];
    drawerLoading = false;

    get currentKpiRange() { return this.kpiTimeRange; }
    set currentKpiRange(val: any) {
        this.kpiTimeRange = val;
        this.initDashCharts();
    }

    constructor(
        private processesService: ProcessesService,
        private interactionsService: InteractionsService,
        private toastService: ToastService,
        private confirmService: ConfirmService,
        private settingsService: SettingsService,
        private authService: AuthService,
    ) { }

    private isClosedProcess(process: any): boolean {
        const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
        const isClosedStage = stage === 'rejected' || stage === 'reject' || stage === 'withdrawn' || stage === 'offer declined';
        return isClosedStage || process?.isClosed === true;
    }

    private isHiddenByDefault(process: any): boolean {
        const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
        return stage === 'rejected' || stage === 'reject' || stage === 'withdrawn';
    }

    ngOnInit() {
        this.settings = this.settingsService.getSettings();
        this.userDisplayName = this.getDisplayName(this.settings);
        this.settingsSub = this.settingsService.settings$.subscribe((s) => {
            this.settings = s;
            this.userDisplayName = this.getDisplayName(s);
        });

        this.isLoading = true;
        this.processesService.getAll().subscribe({
            next: (data) => {
                this.processes = data;
                this.processesOnActioin = data.filter((p: any) => !this.isClosedProcess(p));
                this.applyFilters();
                this.findTasks();
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Failed to load processes', err);
                this.toastService.show('Failed to load processes', 'error');
                this.isLoading = false;
            }
        });
    }



    ngAfterViewChecked() {
        // If data is loaded and canvas is ready but charts are not built, build them
        if (!this.isLoading && this.processes.length > 0 && !this.dashCharts['timeline'] && this.timelineRef?.nativeElement) {
            this.initDashCharts();
        }
    }

    ngOnDestroy() {
        if (this.settingsSub) this.settingsSub.unsubscribe();
        this.restoreBodyScroll();
        Object.values(this.dashCharts).forEach(c => {
            if (c && typeof c.destroy === 'function') {
                c.destroy();
            }
        });
    }

    // ─── Dashboard Charts ─────────────────────────────────────────────────────

    private initDashCharts() {
        if (!this.timelineRef?.nativeElement) return;
        this.buildTimelineChart();
    }

    private chartTextColor(): string {
        return document.body.classList.contains('dark-theme') ? '#94a3b8' : '#64748b';
    }

    getTimelineSubtitle(): string {
        switch (this.kpiTimeRange) {
            case 'week': return 'Daily trend (Last 7 days)';
            case '2weeks': return 'Daily trend (Last 14 days)';
            case '3weeks': return 'Daily trend (Last 21 days)';
            case 'month': return 'Daily trend (Last 30 days)';
            case 'quarter': return 'Monthly trend (Last 90 days)';
            case 'year': return 'Monthly trend (Last 12 months)';
            default: return 'Monthly trend (All Time)';
        }
    }

    getKpiPeriodLabel(): string {
        switch (this.kpiTimeRange) {
            case 'week': return 'Last 7 days';
            case '2weeks': return 'Last 14 days';
            case '3weeks': return 'Last 21 days';
            case 'month': return 'Last 30 days';
            case 'quarter': return 'Last 90 days';
            case 'year': return 'Last 12 months';
            default: return 'All time';
        }
    }

    private buildTimelineChart() {
        if (this.dashCharts['timeline']) this.dashCharts['timeline'].destroy();
        
        let labels: string[] = [];
        let data: number[] = [];
        const bucketProcesses: any[][] = [];
        const today = new Date();

        const selectedDayCount = this.getSelectedRangeDayCount();
        const datedProcesses = this.kpiProcesses
            .map((process) => ({ process, createdAt: this.getProcessCreatedAt(process) }))
            .filter((entry): entry is { process: any; createdAt: Date } => entry.createdAt !== null);

        if (selectedDayCount !== null && selectedDayCount <= 30) {
            const days = selectedDayCount;
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                labels.push(d.toLocaleDateString('default', { month: 'short', day: 'numeric' }));
                const processesForDay = datedProcesses
                    .filter((entry) => entry.createdAt.toDateString() === d.toDateString())
                    .map((entry) => entry.process);
                data.push(processesForDay.length);
                bucketProcesses.push(processesForDay);
            }
        } else {
            const firstDatedProcess = datedProcesses.reduce<Date | null>((earliest, entry) => {
                return !earliest || entry.createdAt < earliest ? entry.createdAt : earliest;
            }, null);
            const rangeStart = this.getSelectedRangeStartDate() ?? firstDatedProcess ?? today;
            const monthCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
            const finalMonth = new Date(today.getFullYear(), today.getMonth(), 1);

            while (monthCursor <= finalMonth) {
                const bucketMonth = monthCursor.getMonth();
                const bucketYear = monthCursor.getFullYear();
                labels.push(monthCursor.toLocaleString('default', { month: 'short', year: '2-digit' }));
                const processesForMonth = datedProcesses
                    .filter((entry) => {
                        return entry.createdAt.getMonth() === bucketMonth && entry.createdAt.getFullYear() === bucketYear;
                    })
                    .map((entry) => entry.process);
                data.push(processesForMonth.length);
                bucketProcesses.push(processesForMonth);
                monthCursor.setMonth(monthCursor.getMonth() + 1);
            }
        }

        const color = this.chartTextColor();
        this.dashCharts['timeline'] = new Chart(this.timelineRef.nativeElement, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Applications', data, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 5, maxBarThickness: 18 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            beforeBody: (items) => {
                                const count = bucketProcesses[items[0]?.dataIndex]?.length ?? 0;
                                if (count === 0) return 'No processes opened';
                                return `${count} ${count === 1 ? 'process' : 'processes'} opened:`;
                            },
                            label: (context) => {
                                const processes = bucketProcesses[context.dataIndex] ?? [];
                                if (processes.length === 0) return '';

                                const visibleProcesses = processes
                                    .slice(0, 8)
                                    .map((process) => this.formatProcessTooltipLabel(process));
                                if (processes.length > 8) {
                                    visibleProcesses.push(`+${processes.length - 8} more`);
                                }
                                return visibleProcesses;
                            },
                        },
                    },
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color }, grid: { color: 'rgba(148,163,184,0.15)' } },
                    x: { ticks: { color, font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    private formatProcessTooltipLabel(process: any): string {
        const companyName = process?.companyName?.toString().trim() || 'Unknown company';
        const roleTitle = process?.roleTitle?.toString().trim();
        return roleTitle ? `${companyName} · ${roleTitle}` : companyName;
    }

    getDaysSinceUpdate(updatedAt: string | Date | null | undefined): number | null {
        if (!updatedAt) return null;

        const updatedDate = new Date(updatedAt instanceof Date ? updatedAt.getTime() : updatedAt);
        if (Number.isNaN(updatedDate.getTime())) return null;

        const today = new Date();
        const todayCalendarDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const updatedCalendarDay = Date.UTC(
            updatedDate.getFullYear(),
            updatedDate.getMonth(),
            updatedDate.getDate(),
        );
        const elapsedDays = Math.floor((todayCalendarDay - updatedCalendarDay) / 86_400_000);
        return Math.max(0, elapsedDays);
    }

    getDaysSinceUpdateLabel(updatedAt: string | Date | null | undefined): string {
        const days = this.getDaysSinceUpdate(updatedAt);
        if (days === null) return '-';
        return `${days} ${days === 1 ? 'day' : 'days'}`;
    }

    getFollowUpState(process: any): 'neutral' | 'scheduled' | 'warning' | 'overdue' {
        if (!process || this.isClosedProcess(process)) return 'neutral';

        const days = this.getDaysSinceUpdate(process.updatedAt);
        if (days === null) return 'neutral';

        const waitingStages = new Set([
            'Waiting for Interview Feedback',
            'Awaiting New Interview Date',
        ]);

        if (waitingStages.has(process.currentStage)) {
            if (days >= 7) return 'overdue';
            if (days >= 4) return 'warning';
            return 'neutral';
        }

        const scheduledStages = new Set([
            'Initial Call Scheduled',
            'Awaiting Next Interview',
        ]);

        if (scheduledStages.has(process.currentStage)) {
            return 'scheduled';
        }

        return 'neutral';
    }

    getFollowUpBadgeClass(process: any): string {
        return `list-age-badge--${this.getFollowUpState(process)}`;
    }

    getFollowUpBadgeTitle(process: any): string {
        const state = this.getFollowUpState(process);
        const days = this.getDaysSinceUpdate(process?.updatedAt);
        const daysLabel = days === null ? 'an unknown number of days' : `${days} ${days === 1 ? 'day' : 'days'}`;

        if (state === 'scheduled') {
            const nextInterviewDate = this.getNextInterviewDate(process);
            if (!nextInterviewDate) {
                return 'No follow-up needed: interview is scheduled';
            }
            const formattedDate = nextInterviewDate.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
            return `No follow-up needed: interview scheduled for ${formattedDate}`;
        }

        if (state === 'overdue') {
            const waitingFor = process.currentStage === 'Awaiting New Interview Date'
                ? 'a new interview date'
                : 'interview feedback';
            return `Follow-up recommended: waiting for ${waitingFor} for ${daysLabel}`;
        }

        if (state === 'warning') {
            const waitingFor = process.currentStage === 'Awaiting New Interview Date'
                ? 'a new interview date'
                : 'interview feedback';
            return `Attention: waiting for ${waitingFor} for ${daysLabel}`;
        }

        return `Last updated ${daysLabel} ago`;
    }

    private getNextInterviewDate(process: any): Date | null {
        if (!Array.isArray(process?.interactions)) return null;

        const now = Date.now();
        const futureDates = process.interactions
            .flatMap((interaction: any) => [interaction?.date, interaction?.nextInviteDate])
            .filter((dateValue: any) => !!dateValue)
            .map((dateValue: string | Date) => new Date(dateValue))
            .filter((interactionDate: Date) => (
                !Number.isNaN(interactionDate.getTime()) && interactionDate.getTime() > now
            ))
            .sort((first: Date, second: Date) => first.getTime() - second.getTime());

        return futureDates[0] ?? null;
    }



    // ─── KPI Stats ────────────────────────────────────────────────────────────

    private getProcessCreatedAt(process: any): Date | null {
        if (!process?.createdAt) return null;

        const date = new Date(process.createdAt);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private getSelectedRangeDayCount(): number | null {
        switch (this.kpiTimeRange) {
            case 'week': return 7;
            case '2weeks': return 14;
            case '3weeks': return 21;
            case 'month': return 30;
            case 'quarter': return 90;
            case 'year': return 365;
            default: return null;
        }
    }

    private getSelectedRangeStartDate(): Date | null {
        const dayCount = this.getSelectedRangeDayCount();
        if (dayCount === null) return null;

        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (dayCount - 1));
        return startDate;
    }

    get kpiProcesses(): any[] {
        const startDate = this.getSelectedRangeStartDate();
        if (startDate === null) return this.processes;

        return this.processes.filter((process) => {
            const createdAt = this.getProcessCreatedAt(process);
            return createdAt !== null && createdAt >= startDate;
        });
    }

    getInterviewActiveCount(): number {
        return this.kpiProcesses.filter(p => INTERVIEW_STAGES.has(p.currentStage)).length;
    }

    getHomeTaskCount(): number {
        return this.kpiProcesses.filter(p => p.currentStage === 'Home Task Assigned' || p.currentStage === 'Home Task Submitted (Under Review)').length;
    }

    getReferencesCount(): number {
        return this.kpiProcesses.filter(p => p.currentStage === 'References Requested').length;
    }

    getRejectedCount(): number {
        return this.processes.filter((process) => {
            const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
            return stage === 'rejected' || stage === 'reject';
        }).length;
    }

    getWithdrawnCount(): number {
        return this.processes.filter((process) => {
            const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
            return stage === 'withdrawn';
        }).length;
    }

    openKpiModal(type: KpiModalType): void {
        if (!this.isBodyScrollLocked) {
            this.previousBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            this.isBodyScrollLocked = true;
        }
        this.activeKpiModal = type;
        this.kpiModalSearchText = '';
    }

    closeKpiModal(): void {
        this.activeKpiModal = null;
        this.kpiModalSearchText = '';
        this.restoreBodyScroll();
    }

    @HostListener('document:keydown.escape')
    closeKpiModalOnEscape(): void {
        if (this.activeKpiModal) this.closeKpiModal();
    }

    get kpiModalConfig() {
        return this.activeKpiModal ? KPI_MODAL_CONFIG[this.activeKpiModal] : null;
    }

    get kpiModalProcesses(): any[] {
        if (!this.activeKpiModal) return [];

        let matchingProcesses: any[];
        switch (this.activeKpiModal) {
            case 'inProgress':
                matchingProcesses = this.processes.filter(process => !this.isClosedProcess(process));
                break;
            case 'rejected':
                matchingProcesses = this.processes.filter(process => {
                    const stage = (process?.currentStage ?? '').toString().trim().toLowerCase();
                    return stage === 'rejected' || stage === 'reject';
                });
                break;
            case 'withdrawn':
                matchingProcesses = this.processes.filter(process => (
                    (process?.currentStage ?? '').toString().trim().toLowerCase() === 'withdrawn'
                ));
                break;
            default:
                matchingProcesses = this.processes;
        }

        return [...matchingProcesses].sort((first, second) => (
            new Date(second?.updatedAt ?? 0).getTime() - new Date(first?.updatedAt ?? 0).getTime()
        ));
    }

    get visibleKpiModalProcesses(): any[] {
        const query = this.kpiModalSearchText.trim().toLowerCase();
        if (!query) return this.kpiModalProcesses;

        return this.kpiModalProcesses.filter(process => (
            [process?.companyName, process?.roleTitle, process?.currentStage, process?.location]
                .some(value => value?.toString().toLowerCase().includes(query))
        ));
    }

    getKpiModalRecentCount(): number {
        const cutoff = Date.now() - (7 * 86_400_000);
        return this.kpiModalProcesses.filter(process => {
            const updatedAt = new Date(process?.updatedAt).getTime();
            return Number.isFinite(updatedAt) && updatedAt >= cutoff;
        }).length;
    }

    getKpiModalInteractionCount(): number {
        return this.kpiModalProcesses.reduce((total, process) => (
            total + Number(process?._count?.interactions ?? process?.interactions?.length ?? 0)
        ), 0);
    }

    private restoreBodyScroll(): void {
        if (!this.isBodyScrollLocked) return;
        document.body.style.overflow = this.previousBodyOverflow;
        this.previousBodyOverflow = '';
        this.isBodyScrollLocked = false;
    }

    getResponseRate(): number {
        const procs = this.kpiProcesses;
        if (!procs.length) return 0;
        const responded = procs.filter(p => !RESPONDED_STAGES.has(p.currentStage)).length;
        return Math.round((responded / procs.length) * 100);
    }

    // ─── Insight Panels ───────────────────────────────────────────────────────

    getInterviewsThisWeek(): any[] {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        return this.processes
            .filter(p => INTERVIEW_STAGES.has(p.currentStage) && new Date(p.updatedAt) >= cutoff)
            .slice(0, 4);
    }

    getTopScored(): any[] {
        return this.processes
            .filter(p => !CLOSED_STAGES.has(p.currentStage) && this.avgScore(p) > 0)
            .sort((a, b) => this.avgScore(b) - this.avgScore(a))
            .slice(0, 3);
    }

    avgScore(p: any): number {
        const scores = [p.scoreTech, p.scoreWLB, p.scoreGrowth, p.scoreVibe].filter((s: number) => s > 0);
        return scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
    }

    scoreClass(score: number): string {
        if (score >= 8) return 'score-high';
        if (score >= 5) return 'score-mid';
        return 'score-low';
    }


    getAvatarUrl(): string {
        const seed = this.settings?.profile?.contactEmail || this.authService.getUser()?.email || 'default';
        const style = this.settings?.avatarStyle || 'avataaars';
        return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    }

    private getDisplayName(settings: UserSettings): string {
        const profileName = settings.profile?.displayName?.trim();
        if (profileName) {
            return profileName;
        }
        const user = this.authService.getUser();
        if (user?.name) {
            return user.name;
        }
        if (user?.email) {
            return user.email.split('@')[0];
        }
        return 'Your Job Search';
    }

    findTasks() {
        const today = new Date();
        this.tasks = this.processes
            .filter(p => p.nextFollowUp && new Date(p.nextFollowUp) <= today)
            .map(p => ({
                id: p.id,
                company: p.companyName,
                action: 'Follow-up required',
                date: p.nextFollowUp
            }));
    }





    // Apply filters
    applyFilters() {
        this.filteredProcesses = this.processes.filter(process => {
            // Search text filter
            if (this.searchText) {
                const searchLower = this.searchText.toLowerCase();
                const matchesSearch =
                    process.companyName?.toLowerCase().includes(searchLower) ||
                    process.roleTitle?.toLowerCase().includes(searchLower) ||
                    process.techStack?.toLowerCase().includes(searchLower) ||
                    process.location?.toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            // Stage filter
            if (this.selectedStage && process.currentStage !== this.selectedStage) {
                return false;
            }

            // Work mode filter
            if (this.selectedWorkMode && process.workMode !== this.selectedWorkMode) {
                return false;
            }

            // Rejected and withdrawn processes are hidden by default.
            if (!this.showAllProcesses && this.isHiddenByDefault(process)) {
                return false;
            }

            return true;
        });

        // Apply current sorting to filtered results
        if (this.sortColumn) {
            this.sort(this.sortColumn, true);
        }
    }

    // Clear all filters
    clearFilters() {
        this.searchText = '';
        this.selectedStage = '';
        this.selectedWorkMode = '';
        this.showAllProcesses = false;
        this.applyFilters();
    }

    onStageChange(event: any) {
        this.selectedStage = event.target.value;
        this.applyFilters();
    }

    onWorkModeChange(event: any) {
        this.selectedWorkMode = event.target.value;
        this.applyFilters();
    }

    getStatusClass(stage: string): string {
        if (!stage) return '';
        return 'status-' + stage
            .trim()
            .toLowerCase()
            .replace(/[\s/()]+/g, '-')
            .replace(/-+$/, '');
    }

    getCompactStageLabel(stage: string): string {
        switch (stage) {
            case 'Waiting for Interview Feedback':
                return 'Waiting for Feedback';
            case 'Awaiting New Interview Date':
                return 'Awaiting New Date';
            default:
                return stage;
        }
    }

    // Sorting method
    sort(column: string, skipFilteredUpdate: boolean = false) {
        if (this.sortColumn === column) {
            // Toggle direction if same column
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, default to ascending
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        const arrayToSort = skipFilteredUpdate ? this.filteredProcesses : this.processes;

        arrayToSort.sort((a, b) => {
            let aValue = this.getSortValue(a, column);
            let bValue = this.getSortValue(b, column);

            // Handle null/undefined values
            if (aValue == null) return this.sortDirection === 'asc' ? 1 : -1;
            if (bValue == null) return this.sortDirection === 'asc' ? -1 : 1;

            // Compare based on type
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return this.sortDirection === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else {
                // Numeric or date comparison
                return this.sortDirection === 'asc'
                    ? (aValue > bValue ? 1 : -1)
                    : (aValue < bValue ? 1 : -1);
            }
        });

        if (!skipFilteredUpdate) {
            this.filteredProcesses = [...arrayToSort];
        }
    }

    // Helper to get sort value based on column
    private getSortValue(process: any, column: string): any {
        switch (column) {
            case 'company':
                return process.companyName?.toLowerCase();
            case 'stage':
                return process.currentStage?.toLowerCase();
            case 'interactions':
                return process._count?.interactions || 0;
            case 'location':
                return process.location?.toLowerCase();
            case 'created':
                return new Date(process.createdAt);
            case 'updated':
                return new Date(process.updatedAt);
            case 'age':
                return this.getDaysSinceUpdate(process.updatedAt);
            default:
                return null;
        }
    }

    // Check if column is currently sorted
    isSorted(column: string): boolean {
        return this.sortColumn === column;
    }

    // Get sort direction for a column
    getSortDirection(column: string): 'asc' | 'desc' | null {
        return this.isSorted(column) ? this.sortDirection : null;
    }

    // Helper to check if any filter is active
    get isFilterActive(): boolean {
        return !!this.searchText ||
            !!this.selectedStage ||
            !!this.selectedWorkMode ||
            this.showAllProcesses;
    }

    // Get count of active filters
    get activeFilterCount(): number {
        let count = 0;
        if (this.searchText) count++;
        if (this.selectedStage) count++;
        if (this.selectedWorkMode) count++;
        if (this.showAllProcesses) count++;
        return count;
    }

    // Stats helper methods
    getActiveCount(): number {
        return this.kpiProcesses.filter(p => ACTIVE_STAGES.has(p.currentStage)).length;
    }

    getInProgressCount(): number {
        return this.processes.filter(p => !this.isClosedProcess(p)).length;
    }

    getOfferCount(): number {
        return this.kpiProcesses.filter(p => OFFER_STAGES.has(p.currentStage)).length;
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

    // ─── Interaction History Drawer ────────────────────────────────────────────

    openHistoryDrawer(process: any, event: Event) {
        event.stopPropagation();
        event.preventDefault();
        this.drawerProcess = process;
        this.drawerOpen = true;
        this.drawerInteractions = [];
        this.drawerLoading = true;
        this.interactionsService.getAll({ processId: process.id }).subscribe({
            next: (data) => {
                this.drawerInteractions = (data as any[]).sort(
                    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                this.drawerLoading = false;
            },
            error: () => {
                this.toastService.show('Failed to load interactions', 'error');
                this.drawerLoading = false;
            }
        });
    }

    closeHistoryDrawer() {
        this.drawerOpen = false;
        this.drawerProcess = null;
        this.drawerInteractions = [];
    }

    getInteractionTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            phone_interview: 'Phone Interview',
            video_interview: 'Video Interview',
            onsite_interview: 'On-Site Interview',
            technical_interview: 'Technical Interview',
            hr_interview: 'HR Interview',
            panel_interview: 'Panel Interview',
            take_home_task: 'Take-Home Task',
            coding_challenge: 'Coding Challenge',
            system_design: 'System Design',
            behavioral: 'Behavioral',
            offer: 'Offer',
            follow_up: 'Follow-Up',
            other: 'Other',
        };
        return labels[type] || type;
    }

    getInteractionTypeColor(type: string): string {
        if (!type) return '#64748b';
        const t = type.toLowerCase();
        if (t.includes('phone')) return '#3b82f6';
        if (t.includes('video')) return '#8b5cf6';
        if (t.includes('onsite') || t.includes('on-site')) return '#10b981';
        if (t.includes('technical') || t.includes('coding') || t.includes('system')) return '#f59e0b';
        if (t.includes('offer')) return '#22c55e';
        if (t.includes('hr') || t.includes('behavioral')) return '#ec4899';
        if (t.includes('task') || t.includes('home')) return '#06b6d4';
        return '#64748b';
    }
}
