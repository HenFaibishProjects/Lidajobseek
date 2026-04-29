import { Component, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { SettingsService, UserSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { PROCESS_STAGES } from '../../shared/process-stages';
import { Subscription } from 'rxjs';
import Chart from 'chart.js/auto';
import { LucideAngularModule } from 'lucide-angular';

const ACTIVE_STAGES = new Set([
    'Application Submitted', 'Resume Under Review',
    'Initial Call Scheduled', 'Initial Call Completed',
    'Interview Scheduled', 'Waiting for Interview Feedback', 'Awaiting Next Interview',
    'Home Task Assigned', 'Home Task Submitted (Under Review)',
    'Final Interview Scheduled', 'References Requested', 'Background Check in Progress',
    'Offer Received', 'Offer in Negotiation',
]);

const INTERVIEW_STAGES = new Set([
    'Initial Call Scheduled', 'Initial Call Completed',
    'Interview Scheduled', 'Waiting for Interview Feedback', 'Awaiting Next Interview',
    'Final Interview Scheduled',
]);

const OFFER_STAGES = new Set([
    'Offer Received', 'Offer in Negotiation', 'Offer Accepted',
]);

const CLOSED_STAGES = new Set([
    'Withdrawn', 'Rejected', 'Position Put On Hold', 'Ghosted / No Response', 'Offer Declined',
]);

const RESPONDED_STAGES = new Set([
    'Application Submitted', 'Resume Under Review',
]);

@Component({
    selector: 'app-process-list',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, LucideAngularModule],
    templateUrl: './process-list.component.html',
    styleUrls: ['./process-list.component.css']
})
export class ProcessListComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('dashTimelineChart') timelineRef!: ElementRef;
    @ViewChild('dashStageChart') stageRef!: ElementRef;

    processes: any[] = [];
    processesOnActioin: any[] = [];
    filteredProcesses: any[] = [];
    tasks: any[] = [];
    isLoading: boolean = true;

    // Sorting properties
    sortColumn: string = '';
    sortDirection: 'asc' | 'desc' = 'asc';

    // Filter properties
    searchText: string = '';
    selectedStage: string = '';
    selectedWorkMode: string = '';
    showAllProcesses: boolean = false;

    // Available options for filters
    availableStages: string[] = PROCESS_STAGES;
    availableWorkModes: string[] = ['remote', 'hybrid', 'onsite'];

    userDisplayName: string = 'Your Job Search';
    settings!: UserSettings;
    private settingsSub!: Subscription;
    private dashCharts: { [key: string]: any } = {};
    private chartsNeedInit = false;

    constructor(
        private processesService: ProcessesService,
        private toastService: ToastService,
        private confirmService: ConfirmService,
        private settingsService: SettingsService,
        private authService: AuthService,
    ) { }

    private isClosedProcess(process: any): boolean {
        if (typeof process?.isClosed === 'boolean') {
            return process.isClosed;
        }

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
                // Mark charts as needing a redraw — AfterViewChecked will
                // draw them on the next render cycle once the canvases exist.
                this.chartsNeedInit = true;
            },
            error: (err) => {
                console.error('Failed to load processes', err);
                this.toastService.show('Failed to load processes', 'error');
                this.isLoading = false;
            }
        });
    }

    ngAfterViewChecked() {
        // Only draw when data says we need a redraw AND the canvas refs exist.
        if (this.chartsNeedInit && this.timelineRef?.nativeElement && this.stageRef?.nativeElement) {
            this.chartsNeedInit = false; // clear flag first to avoid loop
            this.initDashCharts();
        }
    }

    ngOnDestroy() {
        if (this.settingsSub) this.settingsSub.unsubscribe();
        Object.values(this.dashCharts).forEach(c => c?.destroy());
    }

    // ─── Dashboard Charts ─────────────────────────────────────────────────────

    private initDashCharts() {
        if (!this.timelineRef?.nativeElement || !this.stageRef?.nativeElement) return;
        this.buildTimelineChart();
        this.buildStageChart();
    }

    private chartTextColor(): string {
        return document.body.classList.contains('dark-theme') ? '#94a3b8' : '#64748b';
    }

    private buildTimelineChart() {
        if (this.dashCharts['timeline']) this.dashCharts['timeline'].destroy();
        const months: string[] = [];
        const data: number[] = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
            data.push(this.processes.filter(p => {
                const pd = new Date(p.createdAt);
                return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
            }).length);
        }
        const color = this.chartTextColor();
        this.dashCharts['timeline'] = new Chart(this.timelineRef.nativeElement, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{ label: 'Applications', data, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 5, barThickness: 18 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, color }, grid: { color: 'rgba(148,163,184,0.15)' } },
                    x: { ticks: { color }, grid: { display: false } }
                }
            }
        });
    }

    private buildStageChart() {
        if (this.dashCharts['stage']) this.dashCharts['stage'].destroy();
        const counts: Record<string, number> = {};
        this.processes.forEach(p => { counts[p.currentStage] = (counts[p.currentStage] || 0) + 1; });
        const labels = Object.keys(counts);
        const data = Object.values(counts);
        const color = this.chartTextColor();
        this.dashCharts['stage'] = new Chart(this.stageRef.nativeElement, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#64748b','#ec4899'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '72%',
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, color, usePointStyle: true, padding: 10 } } }
            }
        });
    }

    // ─── KPI Stats ────────────────────────────────────────────────────────────

    getRejectionRate(): number {
        if (!this.processes.length) return 0;
        const rejected = this.processes.filter(p => p.currentStage === 'Rejected').length;
        return Math.round((rejected / this.processes.length) * 100);
    }

    getResponseRate(): number {
        if (!this.processes.length) return 0;
        const responded = this.processes.filter(p => !RESPONDED_STAGES.has(p.currentStage)).length;
        return Math.round((responded / this.processes.length) * 100);
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

    get checklist() {
        const hasProcess = this.processes.length > 0;
        const hasInterview = this.processes.some(p => 
            (p._count?.interactions && p._count.interactions > 0) || 
            INTERVIEW_STAGES.has(p.currentStage)
        );
        const profileComplete = !!this.settings?.profile?.displayName && !!this.settings?.profile?.phoneNumber;
        const allDone = hasProcess && hasInterview && profileComplete;
        return { hasProcess, hasInterview, profileComplete, allDone };
    }

    exportData() {
        this.processesService.exportData().subscribe({
            next: (data) => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `jobseek-export-${new Date().toISOString().split('T')[0]}.json`;
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
                const processes = JSON.parse(e.target.result);

                const mode = await this.confirmService.custom({
                    title: 'Import Data',
                    message: 'How would you like to import the data?',
                    buttons: [
                        { text: 'Append', value: 'append', class: 'btn-secondary' },
                        { text: 'Overwrite', value: 'overwrite', class: 'btn-danger' },
                        { text: 'Cancel', value: null, class: 'btn-secondary' }
                    ]
                });

                if (!mode) return;

                this.processesService.importData(processes, mode).subscribe({
                    next: () => {
                        this.toastService.show('Import successful', 'success');
                        this.ngOnInit(); // Reload data
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

            // Show all processes filter
            const isClosed = this.isClosedProcess(process);
            if (!this.showAllProcesses && isClosed) {
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
        return 'status-' + stage.toLowerCase().replace(' ', '-');
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
            case 'updated':
                return new Date(process.updatedAt);
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
        return this.processes.filter(p => ACTIVE_STAGES.has(p.currentStage)).length;
    }

    getInterviewCount(): number {
        return this.processes.filter(p => INTERVIEW_STAGES.has(p.currentStage)).length;
    }

    getOfferCount(): number {
        return this.processes.filter(p => OFFER_STAGES.has(p.currentStage)).length;
    }
}
