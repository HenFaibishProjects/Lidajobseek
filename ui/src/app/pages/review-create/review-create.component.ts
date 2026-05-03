import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReviewsService } from '../../services/reviews.service';

@Component({
    selector: 'app-review-create',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './review-create.component.html',
    styleUrls: ['./review-create.component.css']
})
export class ReviewCreateComponent implements OnInit {
    processId!: number;
    review: any = {
        stage: '',
        confidence: 3,
        whatWentWell: '',
        whatFailed: '',
        gaps: ''
    };

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private reviewsService: ReviewsService
    ) { }

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('id'));
    }

    onSubmit() {
        const payload = {
            ...this.review,
            processId: this.processId
        };
        this.reviewsService.create(payload).subscribe(() => {
            this.router.navigate(['/process', this.processId]);
        });
    }
}
