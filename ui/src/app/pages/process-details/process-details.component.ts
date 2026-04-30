import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProcessesService } from '../../services/processes.service';
import { InteractionsService } from '../../services/interactions.service';
import { ReviewsService } from '../../services/reviews.service';
import { ContactsService } from '../../services/contacts.service';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { getInterviewTypeLabel as resolveInterviewTypeLabel } from '../../shared/interview-types';
import { LucideAngularModule } from 'lucide-angular';
import { AiAssistantPanelComponent } from '../../components/ai-assistant-panel/ai-assistant-panel.component';

@Component({
    selector: 'app-process-details',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe, LucideAngularModule, AiAssistantPanelComponent],
    templateUrl: './process-details.component.html'
})
export class ProcessDetailsComponent implements OnInit {
    process: any;
    showContactForm = false;
    showAiPanel = false;
    activeInteractionId: number | null = null;
    newContact: any = {
        name: '',
        role: '',
        linkedIn: '',
        email: '',
        socialHooks: ''
    };

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
        private interactionsService: InteractionsService,
        private reviewsService: ReviewsService,
        private contactsService: ContactsService,
        private confirmService: ConfirmService,
        private toastService: ToastService
    ) { }

    ngOnInit() {
        this.loadProcess();
    }

    loadProcess() {
        const id = Number(this.route.snapshot.paramMap.get('id'));
        if (id) {
            this.processesService.getById(id).subscribe(data => {
                this.process = data;
            });
        }
    }

    async deleteProcess() {
        if (await this.confirmService.delete('this application')) {
            this.processesService.delete(this.process.id).subscribe(() => {
                this.toastService.show('Application removed from your pipeline', 'success');
                this.router.navigate(['/']);
            });
        }
    }

    async deleteInteraction(id: number) {
        if (await this.confirmService.delete('this interaction round')) {
            this.interactionsService.delete(id).subscribe(() => {
                this.toastService.show('Interaction round removed', 'success');
                this.loadProcess();
            });
        }
    }

    async deleteReview(id: number) {
        if (await this.confirmService.delete('this reflection')) {
            this.reviewsService.delete(id).subscribe(() => {
                this.toastService.show('Reflection removed', 'success');
                this.loadProcess();
            });
        }
    }

    addContact() {
        if (!this.newContact.name) return;

        const contactData = {
            ...this.newContact,
            processId: this.process.id
        };

        this.contactsService.create(contactData).subscribe(() => {
            this.loadProcess();
            this.showContactForm = false;
            this.newContact = { name: '', role: '', linkedIn: '', email: '', socialHooks: '' };
        });
    }

    async deleteContact(id: number) {
        if (await this.confirmService.delete('this contact')) {
            this.contactsService.delete(id).subscribe(() => {
                this.toastService.show('Contact removed', 'success');
                this.loadProcess();
            });
        }
    }

    getStatusClass(stage: string): string {
        if (!stage) return '';
        return 'status-' + stage.toLowerCase().replace(' ', '-');
    }

    getInterviewTypeLabel(interviewType: string): string {
        return resolveInterviewTypeLabel(interviewType);
    }

    toggleAiPanel() {
        this.activeInteractionId = null;
        this.showAiPanel = !this.showAiPanel;
    }

    openInteractionAiPanel(interactionId: number) {
        this.activeInteractionId = interactionId;
        this.showAiPanel = true;
    }
}
