import { Component, HostListener, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import countriesData from '../../../assets/countries.json';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { PROCESS_STAGES } from '../../shared/process-stages';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-process-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
    templateUrl: './process-edit.component.html',
    styleUrls: ['./process-edit.component.css']
})
export class ProcessEditComponent implements OnInit, OnDestroy {
    @ViewChild('processForm') processForm!: NgForm;
    process: any;
    locationSearch = '';
    showLocationDropdown = false;
    formSubmitted = false;
    isSubmitting = false;
    stages = PROCESS_STAGES;
    private settingsSub!: Subscription;

    locationOptions: string[] = [];
    selectedCountry = '';

    get completionPercent(): number {
        if (!this.process) return 0;
        const fieldsToCheck: Array<keyof typeof this.process> = [
            'companyName',
            'roleTitle',
            'techStack',
            'source',
            'salaryExpectation',
            'dataFromThePhoneCall',
            'initialInviteDate',
            'initialInviteMethod',
            'initialInviteContent'
        ];

        let filled = fieldsToCheck.filter(key => {
            const value = this.process[key];
            if (typeof value === 'string') return value.trim().length > 0;
            return value !== null && value !== undefined && value !== '';
        }).length;

        let totalFields = fieldsToCheck.length;

        if (this.process.workMode !== 'remote') {
            totalFields++;
            if (this.process.location?.trim()) filled++;
        }

        if (this.process.workMode === 'hybrid') {
            totalFields++;
            if (this.process.daysFromOffice !== null && this.process.daysFromOffice > 0) filled++;
        }

        if (totalFields === 0) return 0;
        return Math.round((filled / totalFields) * 100);
    }

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private processesService: ProcessesService,
        private toastService: ToastService,
        private settingsService: SettingsService
    ) {
        const settings = this.settingsService.getSettings();
        this.selectedCountry = settings.country;
        this.locationOptions = this.getLocationsForCountry(settings.country);

        this.settingsSub = this.settingsService.settings$.subscribe(updatedSettings => {
            if (updatedSettings.country !== this.selectedCountry) {
                this.selectedCountry = updatedSettings.country;
                this.locationOptions = this.getLocationsForCountry(updatedSettings.country);
                if (this.process) {
                    this.process.location = '';
                }
                this.locationSearch = '';
                this.showLocationDropdown = false;
            }
        });
    }

    ngOnDestroy() {
        if (this.settingsSub) {
            this.settingsSub.unsubscribe();
        }
    }

    ngOnInit() {
        const id = Number(this.route.snapshot.paramMap.get('id'));
        this.processesService.getById(id).subscribe(data => {
            this.process = { ...data };
            // Remove relation fields that shouldn't be sent in update
            delete this.process.interactions;
            delete this.process.reviews;
            delete this.process.contacts;
            delete this.process._count;

            this.locationSearch = this.process.location || '';
        });
    }

    private getLocationsForCountry(country: string): string[] {
        return country ? (countriesData as Record<string, string[]>)[country] ?? [] : [];
    }

    get filteredLocationOptions(): string[] {
        const term = this.locationSearch.trim().toLowerCase();
        if (!term) {
            return this.locationOptions;
        }

        return this.locationOptions.filter(location =>
            location.toLowerCase().includes(term)
        );
    }

    onLocationSearchChange() {
        this.showLocationDropdown = true;
    }

    toggleLocationDropdown() {
        this.showLocationDropdown = !this.showLocationDropdown;
    }

    selectLocation(location: string) {
        this.locationSearch = location;
        this.showLocationDropdown = false;
        this.process.location = location;
    }

    @HostListener('document:keydown', ['$event'])
    onDocumentKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && this.showLocationDropdown && this.locationSearch.trim()) {
            const match = this.locationOptions.find(location =>
                location.toLowerCase() === this.locationSearch.trim().toLowerCase()
            );
            this.selectLocation(match ?? this.locationSearch.trim());
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        if (!target?.closest('.location-combobox')) {
            this.showLocationDropdown = false;
        }
    }

    onWorkModeChange(event: any) {
        const selectedValue = event.target.value;
        // Clear daysFromOffice if not hybrid
        if (selectedValue !== 'hybrid') {
            this.process.daysFromOffice = null;
        }
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.processForm?.form?.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched || this.formSubmitted));
    }

    onFieldBlur(fieldName: string) {
        const field = this.processForm?.form?.get(fieldName);
        if (field) field.markAsTouched();
    }

    onSubmit() {
        this.formSubmitted = true;
        if (this.processForm && !this.processForm.valid) {
            this.toastService.show('Please fill in all required fields.', 'warning');
            // Focus first invalid field
            const firstInvalidControl = document.querySelector('.ng-invalid');
            if (firstInvalidControl) {
                (firstInvalidControl as HTMLInputElement).focus();
            }
            return;
        }
        this.isSubmitting = true;

        const payload = { ...this.process };

        // Ensure dates are ISO or null
        if (payload.nextFollowUp) {
            payload.nextFollowUp = new Date(payload.nextFollowUp).toISOString();
        } else {
            payload.nextFollowUp = null;
        }

        if (payload.initialInviteDate) {
            payload.initialInviteDate = new Date(payload.initialInviteDate).toISOString();
        } else {
            payload.initialInviteDate = null;
        }

        if (payload.offerDeadline) {
            payload.offerDeadline = new Date(payload.offerDeadline).toISOString();
        } else {
            payload.offerDeadline = null;
        }

        if (payload.salaryExpectation) {
            payload.salaryExpectation = Number(payload.salaryExpectation);
        }

        console.log('Submitting process edit:', payload);
        this.processesService.update(this.process.id, payload).subscribe({
            next: () => {
                console.log('Process updated successfully');
                this.isSubmitting = false;
                this.toastService.show('Process updated successfully', 'success');
                this.router.navigate(['/process', this.process.id]);
            },
            error: (err) => {
                console.error('Error updating process:', err);
                this.isSubmitting = false;
                this.toastService.show('Error updating process: ' + (err.error?.message || err.message), 'error');
            }
        });
    }
}
