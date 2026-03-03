import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
    selector: 'app-interaction-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DateFormatPipe],
    templateUrl: './interaction-create.component.html' // Fixed path
})
export class InteractionCreateComponent implements OnInit {
    processId!: number;
    existingContacts: any[] = [];

    interaction: any = {
        date: '',
        interviewType: 'zoom',
        participants: [], // array of { role: string, name: string }
        summary: '',
        testsAssessment: '', // Tests or technical assessments during interview
        roleInsights: '', // What was learned about the role
        notes: '',
        invitationExtended: null // 'yes', 'later', or 'no'
    };

    availableRoles = ['HR', 'Tech Lead', 'Team Member', 'Team Lead', 'Manager', 'CTO', 'Director', 'Group Leader', 'Architect', 'Recruiter', 'Hiring Manager', 'VP', 'Peer'];

    addParticipant() {
        this.interaction.participants.push({ role: 'HR', name: '' });
    }

    addFromContact(contact: any) {
        this.interaction.participants.push({
            role: contact.role || 'HR', // Default to HR if role missing, or maybe 'Recruiter' is safer default?
            name: contact.name
        });
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

        // Fetch process to get contacts
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

    onSubmit() {
        const payload = {
            ...this.interaction,
            processId: this.processId,
            date: new Date(this.interaction.date).toISOString()
        };
        this.interactionsService.create(payload).subscribe(() => {
            this.router.navigate(['/process', this.processId]);
        });
    }
}
