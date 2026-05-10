import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InteractionsService } from '../../services/interactions.service';
import { ProcessesService } from '../../services/processes.service';
import { ReviewsService } from '../../services/reviews.service';
import { DEFAULT_INTERVIEW_TYPE_ID, normalizeInterviewType } from '../../shared/interview-types';
import { InteractionFormComponent } from '../../components/interaction-form/interaction-form.component';

@Component({
    selector: 'app-interaction-create',
    standalone: true,
    imports: [CommonModule, InteractionFormComponent],
    templateUrl: './interaction-create.component.html'
})
export class InteractionCreateComponent implements OnInit {
    processId!: number;
    existingContacts: any[] = [];
    isSubmitting = false;

    interaction: any = {
        date: '',
        interviewType: DEFAULT_INTERVIEW_TYPE_ID,
        participants: [],
        summary: '',
        testsAssessment: '',
        roleInsights: '',
        notes: '',
    };

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
        this.processId = Number(this.route.snapshot.paramMap.get('id'));
        this.interaction.interviewType = normalizeInterviewType(this.interaction.interviewType);
        this.processesService.getById(this.processId).subscribe(p => {
            this.existingContacts = p.contacts || [];
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
        const payload = { ...this.interaction, processId: this.processId };
        this.interactionsService.create(payload).subscribe({
            next: (saved: any) => {
                if (this.hasReflectionContent()) {
                    this.reviewsService.create({
                        ...this.reflection,
                        stage: this.reflection.stage || 'Interview',
                        confidence: this.reflection.confidence || 3,
                        processId: this.processId,
                        interactionId: saved.id,
                    }).subscribe({
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
