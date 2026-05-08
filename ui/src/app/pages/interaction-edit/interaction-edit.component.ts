import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { ReviewsService } from '../../services/reviews.service';
import { normalizeInterviewType } from '../../shared/interview-types';
import { InteractionFormComponent } from '../../components/interaction-form/interaction-form.component';

@Component({
    selector: 'app-interaction-edit',
    standalone: true,
    imports: [CommonModule, InteractionFormComponent],
    template: `
        <app-interaction-form
            *ngIf="interaction"
            mode="edit"
            [processId]="processId"
            [interaction]="interaction"
            [reflection]="reflection"
            [existingContacts]="existingContacts"
            [isSubmitting]="isSubmitting"
            (submitted)="onSubmit()"
        ></app-interaction-form>
    `
})
export class InteractionEditComponent implements OnInit {
    processId!: number;
    interactionId!: number;
    existingReviewId: number | null = null;
    isSubmitting = false;
    interaction: any = null;
    existingContacts: any[] = [];

    reflection: any = {
        stage: '',
        confidence: 0,
        mood: '',
        whatWentWell: '',
        whatFailed: '',
        gaps: '',
        keyLearning: '',
        nextActionPlan: '',
    };

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private interactionsService: InteractionsService,
        private processesService: ProcessesService,
        private reviewsService: ReviewsService
    ) { }

    ngOnInit() {
        this.processId     = Number(this.route.snapshot.paramMap.get('pid'));
        this.interactionId = Number(this.route.snapshot.paramMap.get('id'));

        this.processesService.getById(this.processId).subscribe(data => {
            const inter = data.interactions?.find((i: any) => i.id === this.interactionId);
            if (inter) {
                this.interaction = { ...inter };
                this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);
                this.existingContacts = data.contacts || [];
            }

            // Pre-populate reflection if one exists for this interaction
            const existingReview = (data.reviews || []).find((r: any) => r.interactionId === this.interactionId);
            if (existingReview) {
                this.existingReviewId = existingReview.id;
                this.reflection = {
                    stage:          existingReview.stage          || '',
                    confidence:     existingReview.confidence     || 0,
                    mood:           existingReview.mood           || '',
                    whatWentWell:   existingReview.whatWentWell   || '',
                    whatFailed:     existingReview.whatFailed     || '',
                    gaps:           existingReview.gaps           || '',
                    keyLearning:    existingReview.keyLearning    || '',
                    nextActionPlan: existingReview.nextActionPlan || '',
                };
            }
        });
    }

    private hasReflectionContent(): boolean {
        return !!(
            this.reflection.whatWentWell || this.reflection.whatFailed ||
            this.reflection.gaps || this.reflection.keyLearning ||
            this.reflection.nextActionPlan || this.reflection.confidence > 0 ||
            this.reflection.mood
        );
    }

    onSubmit() {
        if (this.isSubmitting) return;
        this.isSubmitting = true;

        this.interactionsService.update(this.interactionId, { ...this.interaction }).subscribe({
            next: () => {
                if (this.hasReflectionContent()) {
                    const payload = {
                        ...this.reflection,
                        stage: this.reflection.stage || 'Interview',
                        confidence: this.reflection.confidence || 3,
                        processId: this.processId,
                        interactionId: this.interactionId,
                    };
                    const obs = this.existingReviewId
                        ? this.reviewsService.update(this.existingReviewId, payload)
                        : this.reviewsService.create(payload);
                    obs.subscribe({
                        next: () => this.router.navigate(['/process', this.processId]),
                        error: () => this.router.navigate(['/process', this.processId]),
                    });
                } else {
                    this.router.navigate(['/process', this.processId]);
                }
            },
            error: () => { this.isSubmitting = false; }
        });
    }
}
