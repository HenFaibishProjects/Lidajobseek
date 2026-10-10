import { AvailabilityCheckComponent } from '../availability-check/availability-check.component';
import { AvailabilityService } from '../../services/availability.service';
import { ToastService } from '../../services/toast.service';
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { INTERVIEW_TYPES, getGroupedInterviewTypes } from '../../shared/interview-types';
import { ReflectionFormComponent } from '../reflection-form/reflection-form.component';

@Component({
    selector: 'app-interaction-form',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, ReflectionFormComponent, AvailabilityCheckComponent],
    templateUrl: './interaction-form.component.html',
    styleUrl: './interaction-form.component.css'
})
export class InteractionFormComponent implements OnInit {
    /** 'create' = Record Interaction, 'edit' = Edit Interaction */
    @Input() mode: 'create' | 'edit' = 'create';

    @Input() processId!: number;
    @Input() interaction: any = {};
    @Input() reflection: any = {};
    @Input() existingContacts: any[] = [];
    @Input() isSubmitting = false;

    /** Emitted when the form is submitted (valid) */
    @Output() submitted = new EventEmitter<void>();

    interviewTypes = INTERVIEW_TYPES;
    groupedTypes = getGroupedInterviewTypes();
    typeCategories = Object.keys(this.groupedTypes) as (keyof typeof this.groupedTypes)[];

    contactDropdownOpen = false;
    readonly passLikelihoodScores = [1, 2, 3, 4, 5];
    readonly passLikelihoodLabels = ['', 'Very unlikely', 'Unlikely', 'Uncertain', 'Likely', 'Very likely'];

    // Split date/time for the date+time inputs
    datePart = '';
    timePart = '';

    get title()    { return this.mode === 'create' ? 'Record Interaction'       : 'Edit Interaction'; }
    get subtitle() { return this.mode === 'create' ? 'Capture what happened in this session' : 'Update the details of this session'; }
    get saveLabel(){ return this.mode === 'create' ? 'Save Interaction'         : 'Save Changes'; }

    get availableContacts() {
        const participantNames = (this.interaction.participants || []).map((p: any) => p.name);
        return this.existingContacts.filter(c => !participantNames.includes(c.name));
    }

    constructor(private readonly availabilityService: AvailabilityService, private readonly toastService: ToastService) {}

    chooseAnotherTime() { document.getElementById('datePart')?.focus(); }

    ngOnInit() {
        if (this.interaction?.date) {
            this._splitDate(new Date(this.interaction.date));
        } else {
            this._splitDate(new Date());
        }
    }

    private _splitDate(d: Date) {
        const offset = d.getTimezoneOffset() * 60000;
        const local  = new Date(d.getTime() - offset).toISOString();
        this.datePart = local.slice(0, 10);
        this.timePart = local.slice(11, 16);
        this.interaction.date = `${this.datePart}T${this.timePart}`;
    }

    updateDateTime() {
        this.interaction.date = this.datePart && this.timePart ? `${this.datePart}T${this.timePart}` : '';
    }

    getSelectedTypeLabel(): string {
        return this.interviewTypes.find(t => t.id === this.interaction?.interviewType)?.label ?? '';
    }

    getSelectedTypeColor(): string {
        return this.interviewTypes.find(t => t.id === this.interaction?.interviewType)?.color ?? '#6b7280';
    }

    addFromContact(contact: any) {
        if (!this.interaction.participants) this.interaction.participants = [];
        
        // Prevent adding the same contact twice
        const alreadyExists = this.interaction.participants.some((p: any) => p.name === contact.name);
        if (alreadyExists) return;

        this.interaction.participants.push({ 
            name: contact.name,
            role: contact.role,
            email: contact.email,
            phone: contact.phone,
            linkedIn: contact.linkedIn,
            socialHooks: contact.socialHooks
        });
        this.contactDropdownOpen = false;
    }

    removeParticipant(i: number) {
        this.interaction.participants.splice(i, 1);
    }

    setPassLikelihood(score: number) {
        this.interaction.passLikelihood = this.interaction.passLikelihood === score ? null : score;
    }

    onSubmit() {
        try { this.interaction.date = this.availabilityService.interviewInstant(this.interaction.date); }
        catch (error) { this.toastService.show((error as Error).message, 'error'); return; }
        this.submitted.emit();
    }
}
