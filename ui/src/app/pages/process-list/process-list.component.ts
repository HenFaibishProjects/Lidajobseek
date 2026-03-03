import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { SettingsService, UserSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
    selector: 'app-process-list',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
    templateUrl: './process-list.component.html',
    styleUrls: ['./process-list.component.css']
})
export class ProcessListComponent implements OnInit {
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
    availableStages: string[] = [
        'Initial Call Scheduled',
        'Awaiting Next Interview (after Initial Call)',
        'Interview Scheduled',
        'Waiting for Interview Feedback',
        'Home Task Assigned',
        'References Requested',
        'Final HR Interview Scheduled',
        'Offer Received',
        'Withdrawn',
        'Rejected',
        'No Response (14+ Days)'
    ];

    availableWorkModes: string[] = ['remote', 'hybrid', 'onsite'];

    userDisplayName: string = 'Your Job Search';

    constructor(
        private processesService: ProcessesService,
        private toastService: ToastService,
        private confirmService: ConfirmService,
        private settingsService: SettingsService,
        private authService: AuthService,
    ) { }

    ngOnInit() {
        const initialSettings = this.settingsService.getSettings();
        this.userDisplayName = this.getDisplayName(initialSettings);
        this.settingsService.settings$.subscribe((s) => {
            this.userDisplayName = this.getDisplayName(s);
        });

        this.isLoading = true;
        this.processesService.getAll().subscribe({
            next: (data) => {
                this.processes = data;
                this.processesOnActioin = data.filter((p: any) => p.currentStage !== 'Rejected' && p.currentStage !== 'Withdrawn');
                this.applyFilters(); // Apply filters on initial load
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
            const isClosed = process.currentStage === 'Rejected' || process.currentStage === 'Withdrawn';
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
        return this.filteredProcesses.filter(p =>
            !['Rejected', 'Withdrawn', 'Offer', 'Signed'].includes(p.currentStage)
        ).length;
    }

    getInterviewCount(): number {
        return this.filteredProcesses.filter(p =>
            ['Interview Scheduled', 'Technical Interview', 'Final Interview', 'Final HR Interview Scheduled'].includes(p.currentStage)
        ).length;
    }

    getOfferCount(): number {
        return this.filteredProcesses.filter(p =>
            ['Offer', 'Signed'].includes(p.currentStage)
        ).length;
    }
}
