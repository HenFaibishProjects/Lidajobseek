import { Component, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import countriesData from '../../../assets/countries.json';

@Component({
    selector: 'app-process-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './process-create.component.html',
    styleUrls: ['./process-create.component.css']
})
export class ProcessCreateComponent {
    private readonly DEFAULT_COUNTRY = 'United States';
    @ViewChild('processForm') processForm!: NgForm;
    loading: boolean = false;
    formSubmitted: boolean = false;
    savedDraft: any = null;
    draftSaveTime: string = '';

    process: any = {
        companyName: '',
        roleTitle: '',
        techStack: '',
        location: '',
        workMode: 'remote',
        daysFromOffice: null,
        source: '',
        salaryExpectation: '',
        salaryCurrency: '',
        salaryPeriod: 'Month',
        currentStage: 'Initial Call Scheduled',
        dataFromThePhoneCall: '',
        initialInviteDate: '',
        initialInviteMethod: '',
        initialInviteContent: ''
    };

    locationSearch = '';
    showLocationDropdown = false;

    stages = [
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

    locationOptions: string[] = [];
    selectedCountry = '';

    constructor(
        private processesService: ProcessesService,
        private router: Router,
        private toastService: ToastService,
        private settingsService: SettingsService
    ) {
        const settings = this.settingsService.getSettings();
        this.selectedCountry = this.getEffectiveCountry(settings.country);
        this.locationOptions = this.getLocationsForCountry(this.selectedCountry);

        this.settingsService.settings$.subscribe(updatedSettings => {
            const effectiveCountry = this.getEffectiveCountry(updatedSettings.country);
            if (effectiveCountry !== this.selectedCountry) {
                this.selectedCountry = effectiveCountry;
                this.locationOptions = this.getLocationsForCountry(effectiveCountry);
                this.process.location = '';
                this.locationSearch = '';
                this.showLocationDropdown = false;
            }
        });
    }

    private getEffectiveCountry(country: string | null | undefined): string {
        return country?.trim() ? country : this.DEFAULT_COUNTRY;
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

    get showOtherCityOption(): boolean {
        const term = this.locationSearch.trim();
        if (!term) {
            return false;
        }

        return !this.locationOptions.some(
            location => location.toLowerCase() === term.toLowerCase(),
        );
    }

    onLocationSearchChange() {
        this.process.location = this.locationSearch.trim();
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

    selectCustomLocation() {
        const customLocation = this.locationSearch.trim();
        if (!customLocation) {
            return;
        }

        this.process.location = customLocation;
        this.locationSearch = customLocation;
        this.showLocationDropdown = false;
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
        if (field) {
            field.markAsTouched();
        }
    }

    onSubmit() {
        this.formSubmitted = true;
        if (!this.processForm.valid) {
            this.toastService.show('Please fill in all required fields.', 'warning');
            // Focus first invalid field
            const firstInvalidControl = document.querySelector('.input-field.ng-invalid');
            if (firstInvalidControl) {
                (firstInvalidControl as HTMLElement).focus();
            }
            return;
        }

        this.loading = true;
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

        // Ensure numbers are numbers
        if (payload.salaryExpectation) {
            payload.salaryExpectation = Number(payload.salaryExpectation);
        }

        console.log('Submitting Process:', payload);

        this.processesService.create(payload).subscribe({
            next: () => {
                console.log('Success');
                this.toastService.show('Process created successfully', 'success');
                this.loading = false;
                this.router.navigate(['/']);
            },
            error: (err) => {
                console.error('Submission Failed:', err);
                this.toastService.show('Error creating process: ' + (err.error?.message || err.message), 'error');
                this.loading = false;
            }
        });
    }
}
