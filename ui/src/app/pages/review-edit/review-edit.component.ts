import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReviewsService } from '../../services/reviews.service';
import { ProcessesService } from '../../services/processes.service';

@Component({
    selector: 'app-review-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './review-edit.component.html',
    styleUrls: ['./review-edit.component.css']
})
export class ReviewEditComponent implements OnInit {
    review: any;
    processId!: number;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private reviewsService: ReviewsService,
        private processesService: ProcessesService
    ) { }

    ngOnInit() {
        this.processId = Number(this.route.snapshot.paramMap.get('pid'));
        const id = Number(this.route.snapshot.paramMap.get('id'));

        this.processesService.getById(this.processId).subscribe(data => {
            const rev = data.reviews.find((r: any) => r.id === id);
            if (rev) {
                this.review = { ...rev };
            }
        });
    }

    onSubmit() {
        this.reviewsService.update(this.review.id, this.review).subscribe(() => {
            this.router.navigate(['/process', this.processId]);
        });
    }
}
