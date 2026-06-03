import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { INTERACTION_TYPES } from '../../shared/agency-interaction-types';

@Component({
  selector: 'app-recruiter-details',
  standalone: true,
  imports: [CommonModule, RouterModule, DateFormatPipe],
  templateUrl: './recruiter-details.component.html',
  styleUrls: ['./recruiter-details.component.css'],
})
export class RecruiterDetailsComponent implements OnInit {
  agencyId!: number;
  agency: any = null;
  isLoading = true;

  readonly INTERACTION_TYPES = INTERACTION_TYPES;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private agenciesService: RecruitmentAgenciesService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
  ) {}

  ngOnInit() {
    this.agencyId = Number(this.route.snapshot.paramMap.get('id'));
    this.agenciesService.getById(this.agencyId).subscribe({
      next: (data) => { this.agency = data; this.isLoading = false; },
      error: () => { this.toastService.show('Failed to load agency', 'error'); this.isLoading = false; },
    });
  }

  async deleteAgency() {
    if (await this.confirmService.delete(`agency "${this.agency.agencyName}"`)) {
      this.agenciesService.delete(this.agencyId).subscribe({
        next: () => { this.toastService.show('Agency deleted', 'success'); this.router.navigate(['/recruiters']); },
        error: () => this.toastService.show('Failed to delete agency', 'error'),
      });
    }
  }

  interactionTypeLabel(v: string) { return this.INTERACTION_TYPES.find(t => t.value === v)?.label ?? v; }
  directionLabel(v: string) { return v === 'INCOMING' ? '← In' : '→ Out'; }

  openUrl(url: string, event: Event) {
    event.preventDefault();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }
}
