import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { DEFAULT_INTERVIEW_TYPE_ID, INTERVIEW_TYPES, getGroupedInterviewTypes, normalizeInterviewType } from '../../shared/interview-types';

@Component({
    selector: 'app-interaction-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './interaction-create.component.html',
    styleUrl: './interaction-create.component.css'
})
export class InteractionCreateComponent implements OnInit {
    processId!: number;
    existingContacts: any[] = [];
    isSubmitting = false;
    contactDropdownOpen = false;

    interaction: any = {
        date: '',
        interviewType: DEFAULT_INTERVIEW_TYPE_ID,
        participants: [],
        summary: '',
        testsAssessment: '',
        roleInsights: '',
        notes: '',
    };

    interviewTypes = INTERVIEW_TYPES;
    groupedTypes = getGroupedInterviewTypes();
    typeCategories = Object.keys(this.groupedTypes) as (keyof typeof this.groupedTypes)[];

    availableRoles = ['HR', 'Recruiter', 'Hiring Manager', 'Tech Lead', 'Team Lead', 'Team Member', 'Manager', 'Director', 'VP', 'CTO', 'Architect', 'Group Leader', 'Peer'];

    addParticipant() {
        this.interaction.participants.push({ role: 'HR', name: '' });
    }

    addFromContact(contact: any) {
        this.interaction.participants.push({ role: contact.role || 'HR', name: contact.name });
        this.contactDropdownOpen = false;
    }

    removeParticipant(index: number) {
        this.interaction.participants.splice(index, 1);
    }

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private interactionsService: InteractionsService,
        private processesService: ProcessesService
    ) { }

    datePart: string = '';
    timePart: string = '';

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('id'));
        this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);

        this.processesService.getById(this.processId).subscribe(process => {
            this.existingContacts = process.contacts || [];
        });

        const now = new Date();
        const tzOffset = now.getTimezoneOffset() * 60000;
        const localIso = new Date(now.getTime() - tzOffset).toISOString();
        this.datePart = localIso.slice(0, 10);
        this.timePart = localIso.slice(11, 16);
        this.interaction.date = `${this.datePart}T${this.timePart}`;
    }

    updateDateTime() {
        if (this.datePart && this.timePart) {
            this.interaction.date = `${this.datePart}T${this.timePart}`;
        }
    }

    getSelectedTypeLabel(): string {
        return this.interviewTypes.find(t => t.id === this.interaction.interviewType)?.label ?? '';
    }

    getSelectedTypeColor(): string {
        return this.interviewTypes.find(t => t.id === this.interaction.interviewType)?.color ?? '#6b7280';
    }

    onSubmit() {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        const payload = {
            ...this.interaction,
            processId: this.processId,
            date: new Date(this.interaction.date).toISOString()
        };
        this.interactionsService.create(payload).subscribe({
            next: () => this.router.navigate(['/process', this.processId]),
            error: () => { this.isSubmitting = false; }
        });
    }
}

