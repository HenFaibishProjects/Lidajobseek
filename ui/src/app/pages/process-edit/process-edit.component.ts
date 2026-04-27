import { Component, HostListener, OnInit, ViewChild, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { InitialInteractionFieldsComponent } from '../../components/initial-interaction-fields/initial-interaction-fields.component';

@Component({
    selector: 'app-process-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe, InitialInteractionFieldsComponent],
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
        
        // Fields that count individually (1 point each)
        const individualFields = [
            'companyName', 'roleTitle', 'techStack', 'source', 
            'location', 'workMode', 'daysFromOffice', 
            'salaryExpectation', 'signingBonus', 'equity', 'bonus', 'benefits',
            'dataFromThePhoneCall', 'nextFollowUp', 'notes'
        ];

        let filledCount = individualFields.filter(key => {
            const value = this.process[key as keyof typeof this.process];
            // Don't count default initial values as "progress" for some fields
            if (key === 'currentStage' && value === this.stages[0]) return false;
            if (key === 'workMode' && value === 'remote') return false;
            
            if (typeof value === 'string') return value.trim().length > 0;
            if (typeof value === 'number') return value > 0;
            return value !== null && value !== undefined && value !== '';
        }).length;

        // Interaction fields (Grouped to count as max 2 points total to avoid spikes)
        const interactionFields = ['initialInviteDate', 'initialInviteMethod', 'initiatedBy', 'firstContactChannel', 'initialInviteContent'];
        const interactionFilled = interactionFields.filter(key => {
            const value = this.process[key as keyof typeof this.process];
            if (typeof value === 'string') return value.trim().length > 0;
            return value !== null && value !== undefined && value !== '';
        }).length;
        
        if (interactionFilled > 0) {
            filledCount += (interactionFilled >= 3 ? 2 : 1);
        }

        // Total "points" in the form (around 18-20 for ~5-7% per action)
        const totalPoints = individualFields.length + 2; 
        return Math.round((filledCount / totalPoints) * 100);
    }

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private processesService: ProcessesService,
        private toastService: ToastService,
        private settingsService: SettingsService,
        private cdr: ChangeDetectorRef
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
            
            // Format dates for HTML date inputs (YYYY-MM-DD)
            if (this.process.initialInviteDate) {
                this.process.initialInviteDate = new Date(this.process.initialInviteDate).toISOString().split('T')[0];
            }
            if (this.process.nextFollowUp) {
                this.process.nextFollowUp = new Date(this.process.nextFollowUp).toISOString().split('T')[0];
            }
            if (this.process.offerDeadline) {
                this.process.offerDeadline = new Date(this.process.offerDeadline).toISOString().split('T')[0];
            }

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

    onStageChange() {
        // Auto-populate initial interaction fields if section is shown and empty
        if (this.shouldShowInteractionSection) {
            if (!this.process.initialInviteDate) {
                this.process.initialInviteDate = new Date().toISOString().split('T')[0];
            }
            if (!this.process.initialInviteMethod) {
                this.process.initialInviteMethod = 'LinkedIn';
                this.process.initiatedBy = 'Recruiter';
                this.process.firstContactChannel = 'LinkedIn';
            }
        }
        this.cdr.detectChanges();
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.processForm?.form?.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched || this.formSubmitted));
    }

    onFieldBlur(fieldName: string) {
        const field = this.processForm?.form?.get(fieldName);
        if (field) field.markAsTouched();
    }

    get shouldShowInteractionSection(): boolean {
        if (!this.process || !this.process.currentStage) return false;
        const current = this.process.currentStage;
        return current !== this.stages[0] && current !== this.stages[1];
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

        // If interaction section is hidden, clear the fields
        if (!this.shouldShowInteractionSection) {
            payload.initialInviteDate = null;
            payload.initialInviteMethod = '';
            payload.initiatedBy = '';
            payload.firstContactChannel = '';
            payload.initialInviteContent = '';
        }

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
