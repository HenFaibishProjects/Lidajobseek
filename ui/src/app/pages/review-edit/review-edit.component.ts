import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReviewsService } from '../../services/reviews.service';
import { ProcessesService } from '../../services/processes.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-review-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
    templateUrl: './review-edit.component.html',
    styleUrls: ['./review-edit.component.css']
})
export class ReviewEditComponent implements OnInit {
    review: any;
    processId!: number;
    interactionId: number | null = null;
    process: any;
    saving = false;

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
        this.processId = Number(this.route.snapshot.paramMap.get('pid'));
        const iid = this.route.snapshot.paramMap.get('iid');
        this.interactionId = iid ? Number(iid) : null;
        const id = Number(this.route.snapshot.paramMap.get('id'));

        this.processesService.getById(this.processId).subscribe(data => {
            this.process = data;
            // Search in all reviews regardless of scope
            const allReviews = [
                ...(data.reviews || []),
                ...(data.interactions || []).flatMap((i: any) => i.reviews || [])
            ];
            const rev = allReviews.find((r: any) => r.id === id)
                     || (data.reviews || []).find((r: any) => r.id === id);
            if (rev) {
                this.review = {
                    ...rev,
                    mood: rev.mood || '',
                    energyLevel: rev.energyLevel || 3,
                    keyLearning: rev.keyLearning || '',
                    nextActionPlan: rev.nextActionPlan || '',
                    contactPersonId: rev.contactPersonId || null
                };
            }
        });
    }

    setConfidence(val: number) { this.review.confidence = val; }
    setMood(key: string) { this.review.mood = this.review.mood === key ? '' : key; }
    setEnergy(val: number) { this.review.energyLevel = val; }

    get selectedContact() {
        return this.process?.contacts?.find((c: any) => c.id === this.review?.contactPersonId) || null;
    }

    onSubmit() {
        if (this.saving) return;
        this.saving = true;
        this.reviewsService.update(this.review.id, this.review).subscribe({
            next: () => this.router.navigate(['/process', this.processId]),
            error: () => { this.saving = false; }
        });
    }
}
