import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReviewsService } from '../../services/reviews.service';
import { ProcessesService } from '../../services/processes.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-review-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
    templateUrl: './review-create.component.html',
    styleUrls: ['./review-create.component.css']
})
export class ReviewCreateComponent implements OnInit {
    processId!: number;
    interactionId: number | null = null;
    process: any;
    saving = false;

    review: any = {
        stage: '',
        confidence: 3,
        mood: '',
        energyLevel: 3,
        whatWentWell: '',
        whatFailed: '',
        gaps: '',
        keyLearning: '',
        nextActionPlan: '',
        contactPersonId: null
    };

    moods = [
        { key: 'great',   emoji: '🚀', label: 'On fire' },
        { key: 'good',    emoji: '😊', label: 'Good' },
        { key: 'neutral', emoji: '😐', label: 'Neutral' },
        { key: 'tough',   emoji: '😓', label: 'Tough' },
        { key: 'rough',   emoji: '😞', label: 'Rough' },
    ];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private reviewsService: ReviewsService,
        private processesService: ProcessesService
    ) { }

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('id'));
        const iid = this.route.snapshot.paramMap.get('iid');
        this.interactionId = iid ? Number(iid) : null;
        this.processesService.getById(this.processId).subscribe(p => {
            this.process = p;
        });
    }

    setConfidence(val: number) { this.review.confidence = val; }
    setMood(key: string) { this.review.mood = this.review.mood === key ? '' : key; }
    setEnergy(val: number) { this.review.energyLevel = val; }

    get selectedContact() {
        return this.process?.contacts?.find((c: any) => c.id === this.review.contactPersonId) || null;
    }

    onSubmit() {
        if (this.saving) return;
        this.saving = true;
        const payload: any = { ...this.review, processId: this.processId };
        if (this.interactionId) payload.interactionId = this.interactionId;
        this.reviewsService.create(payload).subscribe({
            next: () => this.router.navigate(['/process', this.processId]),
            error: () => { this.saving = false; }
        });
    }
}
