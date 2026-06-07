import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProcessesService } from '../../services/processes.service';
import { InteractionsService } from '../../services/interactions.service';
import { ReviewsService } from '../../services/reviews.service';
import { ContactsService } from '../../services/contacts.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { getInterviewTypeLabel as resolveInterviewTypeLabel } from '../../shared/interview-types';
import { LucideAngularModule } from 'lucide-angular';
import { AiAssistantPanelComponent } from '../../components/ai-assistant-panel/ai-assistant-panel.component';
import { PROCESS_STAGES } from '../../shared/process-stages';

@Component({
    selector: 'app-process-details',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe, LucideAngularModule, AiAssistantPanelComponent],
    templateUrl: './process-details.component.html'
})
export class ProcessDetailsComponent implements OnInit, OnDestroy {
    process: any;
    logoLoadError = false;
    showContactForm = false;
    showAiPanel = false;
    activeInteractionId: number | null = null;
    isUpdatingStage = false;
    readonly stages = PROCESS_STAGES;
    newContact: any = {
        name: '',
        role: '',
        linkedIn: '',
        email: '',
        phone: '',
        socialHooks: ''
    };
    editingContact: any = null;

    // Inline Company Research Add fields
    showDetailsAddForm = false;
    companyResearchRaw = '';
    companyResearchState: 'idle' | 'valid' | 'invalid' = 'idle';
    isSavingResearch = false;
    promptCopied = false;
    private promptCopiedTimer: any;

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
        private toastService: ToastService,
        private cdr: ChangeDetectorRef
    ) { }

    formatUrl(url: string | undefined): string {
        if (!url) return '';
        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http')) {
            cleanUrl = 'https://' + cleanUrl;
        }
        return cleanUrl;
    }

    ngOnInit() {
        this.loadProcess();
    }

    loadProcess() {
        const id = Number(this.route.snapshot.paramMap.get('id'));
        if (id) {
            this.processesService.getById(id).subscribe(data => {
                this.process = data;
                this.logoLoadError = false;  // reset on every load
            });
        }
    }

    isDeleting = false;
    async deleteProcess() {
        if (await this.confirmService.delete('this application')) {
            this.isDeleting = true;
            this.processesService.delete(this.process.id).subscribe({
                next: () => {
                    this.toastService.show('Application removed from your pipeline', 'success');
                    this.isDeleting = false;
                    this.router.navigate(['/']);
                },
                error: (err) => {
                    console.error('Failed to delete process', err);
                    this.isDeleting = false;
                    if (err.status === 401) {
                        this.toastService.show('Session expired. Please log in again.', 'error');
                    } else {
                        this.toastService.show('Failed to remove application. It might take a moment, please refresh.', 'error');
                    }
                }
            });
        }
    }

    updateStage(newStage: string) {
        if (!newStage || newStage === this.process.currentStage) return;
        const previous = this.process.currentStage;
        this.process.currentStage = newStage; // optimistic
        this.isUpdatingStage = true;
        this.processesService.update(this.process.id, { currentStage: newStage }).subscribe({
            next: () => {
                this.toastService.show(`Stage updated to "${newStage}"`, 'success');
                this.isUpdatingStage = false;
            },
            error: () => {
                this.process.currentStage = previous; // roll back
                this.toastService.show('Failed to update stage', 'error');
                this.isUpdatingStage = false;
            }
        });
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

    /** Returns the review linked to a specific interaction, or null */
    getInteractionReview(interactionId: number): any | null {
        return this.process?.reviews?.find((r: any) => r.interactionId === interactionId) || null;
    }

    getMoodEmoji(key: string): string {
        const map: Record<string, string> = {
            great: '🚀', good: '😊', neutral: '😐', tough: '😓', rough: '😞'
        };
        return map[key] || '';
    }

    scoreLabel(val: number): string {
        return ['—', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'][val] || '—';
    }

    addContact() {
        if (!this.newContact.name) return;

        const contactData = {
            ...this.newContact,
            processId: this.process.id
        };

        this.contactsService.create(contactData).subscribe(() => {
            this.toastService.show('Contact saved', 'success');
            this.loadProcess();
            this.showContactForm = false;
            this.newContact = { name: '', role: '', linkedIn: '', email: '', phone: '', socialHooks: '' };
        });
    }

    startEditContact(contact: any) {
        this.editingContact = { ...contact };
    }

    cancelEdit() {
        this.editingContact = null;
    }

    saveEditContact() {
        if (!this.editingContact?.name) return;
        const { id, ...data } = this.editingContact;
        this.contactsService.update(id, data).subscribe(() => {
            this.toastService.show('Contact updated', 'success');
            this.editingContact = null;
            this.loadProcess();
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

    ngOnDestroy() {
        if (this.promptCopiedTimer) {
            clearTimeout(this.promptCopiedTimer);
        }
    }

    // ── Inline Company Research Logic ─────────────────────────────────
    onCompanyResearchChange() {
        const raw = this.companyResearchRaw.trim();
        if (!raw) {
            this.companyResearchState = 'idle';
            return;
        }
        try {
            JSON.parse(raw);
            this.companyResearchState = 'valid';
        } catch {
            this.companyResearchState = 'invalid';
        }
    }

    cancelDetailsAdd() {
        this.showDetailsAddForm = false;
        this.companyResearchRaw = '';
        this.companyResearchState = 'idle';
    }

    saveCompanyResearch() {
        if (this.companyResearchState !== 'valid') return;
        this.isSavingResearch = true;
        
        let parsedResearch: any;
        try {
            parsedResearch = JSON.parse(this.companyResearchRaw);
        } catch {
            this.toastService.show('Failed to parse JSON. Please verify it is valid.', 'error');
            this.isSavingResearch = false;
            return;
        }

        this.processesService.update(this.process.id, { companyResearch: parsedResearch }).subscribe({
            next: () => {
                this.toastService.show('מידע מחקר על החברה נשמר בהצלחה', 'success');
                this.isSavingResearch = false;
                this.showDetailsAddForm = false;
                this.companyResearchRaw = '';
                this.companyResearchState = 'idle';
                this.loadProcess();
            },
            error: (err) => {
                console.error(err);
                this.toastService.show('שגיאה בשמירת המחקר', 'error');
                this.isSavingResearch = false;
            }
        });
    }

    copyResearchPrompt(event: Event) {
        event.stopPropagation();
        const companyName = this.process.companyName?.trim() || 'Unknown Company';
        const prompt =
`Research the following company as a potential employer. Company name: ${companyName}
 Country or location: israel 
Use web search and public sources only. Return a concise JSON overview for a job seeker. Rules: 1. Verify that you found the correct company and do not mix it with similarly named companies. 2. Prefer official sources, LinkedIn, career pages, reputable news sites, and employee review sites. 3. Do not guess. Use null when reliable information is unavailable. 4. Keep the response short: - Maximum 1-2 sentences per summary - Maximum 3 items in each list - Maximum 3 recent news items 5. Do not repeat the same fact in multiple sections. 6. Focus on information relevant to someone considering working at the company. 7. Return valid JSON only, without markdown or extra text. 8. Write summaries in Hebrew. Keep JSON keys and enum values in English. Return exactly this structure: { "company": { "name": null, "website": null, "location": null, "industry": null, "summary": null, "employee_range": null, "growth_trend": "growing | stable | shrinking | unknown" }, "workplace": { "work_model": "remote | hybrid | onsite | mixed | unknown", "review_rating": null, "review_count": null, "reviews_summary": null }, "hiring": { "is_hiring": null, "open_roles_summary": null }, "recent_news": [ { "date": null, "title": null, "summary": null, "source_url": null } ], "job_seeker_summary": { "overall_impression": null, "positive_signals": [], "concerns": [], "missing_information": [] } }
please give the answer in json canvas , ready to copy for a code`;

        navigator.clipboard.writeText(prompt).then(() => {
            clearTimeout(this.promptCopiedTimer);
            this.promptCopied = true;
            this.promptCopiedTimer = setTimeout(() => {
                this.promptCopied = false;
                this.cdr.detectChanges();
            }, 2500);
            this.cdr.detectChanges();
        }).catch(() => {
            // Fallback for environments without clipboard API
            const ta = document.createElement('textarea');
            ta.value = prompt;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.promptCopied = true;
            this.promptCopiedTimer = setTimeout(() => { this.promptCopied = false; this.cdr.detectChanges(); }, 2500);
            this.cdr.detectChanges();
        });
    }
}
