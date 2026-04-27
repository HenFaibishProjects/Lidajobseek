import { Component, ViewChild, HostListener, OnDestroy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import countriesData from '../../../assets/countries.json';
import { DEFAULT_PROCESS_STAGE, PROCESS_STAGES } from '../../shared/process-stages';
import { Subscription } from 'rxjs';
import { InitialInteractionFieldsComponent } from '../../components/initial-interaction-fields/initial-interaction-fields.component';

@Component({
    selector: 'app-process-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, InitialInteractionFieldsComponent],
    templateUrl: './process-create.component.html',
    styleUrls: ['./process-create.component.css']
})
export class ProcessCreateComponent implements OnInit, OnDestroy {
    private readonly DEFAULT_COUNTRY = 'United States';
    @ViewChild('processForm') processForm!: NgForm;
    loading: boolean = false;
    formSubmitted: boolean = false;
    private settingsSub!: Subscription;

    process: any = {
        companyName: '',
        roleTitle: '',
        techStack: '',
        location: '',
        workMode: 'remote',
        daysFromOffice: null,
        source: '',
        salaryExpectation: '',
        salaryCurrency: 'USD',
        salaryPeriod: 'Year',
        currentStage: DEFAULT_PROCESS_STAGE,
        dataFromThePhoneCall: '',
        initialInviteDate: '',
        initialInviteMethod: '',
        initiatedBy: '',
        firstContactChannel: '',
        initialInviteContent: ''
    };

    locationSearch = '';
    showLocationDropdown = false;
    stages = PROCESS_STAGES;
    locationOptions: string[] = [];
    selectedCountry = '';

    constructor(
        private processesService: ProcessesService,
        private router: Router,
        private toastService: ToastService,
        private settingsService: SettingsService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit() {
        const settings = this.settingsService.getSettings();
        this.selectedCountry = this.getEffectiveCountry(settings.country);
        this.locationOptions = this.getLocationsForCountry(this.selectedCountry);

        this.settingsSub = this.settingsService.settings$.subscribe(updatedSettings => {
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

    ngOnDestroy() {
        if (this.settingsSub) {
            this.settingsSub.unsubscribe();
        }
    }

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
            const stages = this.stages || (this.process.currentStage ? [this.process.currentStage] : []);
            if (key === 'currentStage' && value === (stages[0] || 'application submitted')) return false;
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

    onStageChange() {
        console.log('Stage changed to:', this.process.currentStage);
        
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
        if (!term) return false;
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
        if (!customLocation) return;
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

    get shouldShowInteractionSection(): boolean {
        if (!this.process || !this.process.currentStage) return false;
        const current = this.process.currentStage;
        return current !== this.stages[0] && current !== this.stages[1];
    }

    onSubmit() {
        this.formSubmitted = true;
        if (!this.processForm.valid) {
            this.toastService.show('Please fill in all required fields.', 'warning');
            const firstInvalidControl = document.querySelector('.input-field.ng-invalid');
            if (firstInvalidControl) (firstInvalidControl as HTMLElement).focus();
            return;
        }

        this.loading = true;
        const payload = { ...this.process };

        if (!this.shouldShowInteractionSection) {
            payload.initialInviteDate = null;
            payload.initialInviteMethod = '';
            payload.initiatedBy = '';
            payload.firstContactChannel = '';
            payload.initialInviteContent = '';
        }

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

        if (payload.salaryExpectation) {
            payload.salaryExpectation = Number(payload.salaryExpectation);
        }

        this.processesService.create(payload).subscribe({
            next: () => {
                this.toastService.show('Process created successfully', 'success');
                this.loading = false;
                this.router.navigate(['/']);
            },
            error: (err) => {
                this.toastService.show('Error creating process: ' + (err.error?.message || err.message), 'error');
                this.loading = false;
            }
        });
    }
}
