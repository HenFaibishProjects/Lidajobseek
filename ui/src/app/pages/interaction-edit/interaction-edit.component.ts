import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { INTERVIEW_TYPES, getGroupedInterviewTypes, normalizeInterviewType } from '../../shared/interview-types';

@Component({
    selector: 'app-interaction-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './interaction-edit.component.html',
    styleUrl: './interaction-edit.component.css'
})
export class InteractionEditComponent implements OnInit {
    interaction: any;
    processId!: number;
    isSubmitting = false;

    interviewTypes = INTERVIEW_TYPES;
    groupedTypes = getGroupedInterviewTypes();
    typeCategories = Object.keys(this.groupedTypes) as (keyof typeof this.groupedTypes)[];

    availableRoles = ['HR', 'Recruiter', 'Hiring Manager', 'Tech Lead', 'Team Lead', 'Team Member', 'Manager', 'Director', 'VP', 'CTO', 'Architect', 'Group Leader', 'Peer'];

    datePart: string = '';
    timePart: string = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private interactionsService: InteractionsService,
        private processesService: ProcessesService
    ) { }

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('pid'));
        const id = Number(this.route.snapshot.paramMap.get('id'));

        this.processesService.getById(this.processId).subscribe(data => {
            const inter = data.interactions.find((i: any) => i.id === id);
            if (inter) {
                this.interaction = { ...inter };
                this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);

                const d = new Date(this.interaction.date);
                const tzOffset = d.getTimezoneOffset() * 60000;
                const localIso = new Date(d.getTime() - tzOffset).toISOString();
                this.datePart = localIso.slice(0, 10);
                this.timePart = localIso.slice(11, 16);
                this.interaction.date = `${this.datePart}T${this.timePart}`;
            }
        });
    }

    updateDateTime() {
        if (this.datePart && this.timePart) {
            this.interaction.date = `${this.datePart}T${this.timePart}`;
        }
    }

    addParticipant() {
        this.interaction.participants.push({ role: 'HR', name: '' });
    }

    removeParticipant(index: number) {
        this.interaction.participants.splice(index, 1);
    }

    getSelectedTypeLabel(): string {
        return this.interviewTypes.find(t => t.id === this.interaction?.interviewType)?.label ?? '';
    }

    getSelectedTypeColor(): string {
        return this.interviewTypes.find(t => t.id === this.interaction?.interviewType)?.color ?? '#6b7280';
    }

    onSubmit() {
        if (this.isSubmitting) return;
        this.isSubmitting = true;
        const payload = { ...this.interaction };
        payload.date = new Date(this.interaction.date).toISOString();

        this.interactionsService.update(this.interaction.id, payload).subscribe({
            next: () => this.router.navigate(['/process', this.processId]),
            error: () => { this.isSubmitting = false; }
        });
    }
}
