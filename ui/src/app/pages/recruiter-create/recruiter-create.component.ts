import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { RecruiterFormComponent } from '../../components/recruiter-form/recruiter-form.component';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
import { AgencyContactsService } from '../../services/agency-contacts.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-recruiter-create',
  standalone: true,
  imports: [CommonModule, RouterModule, RecruiterFormComponent],
  template: `
    <div class="rc-page">
      <div class="rc-header">
        <a routerLink="/recruiters" class="rc-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Recruitment Agencies
        </a>
        <h1 class="rc-title">Add Recruitment Agency</h1>
        <p class="rc-subtitle">Fill in the details and optionally add contacts right away.</p>
      </div>
      <app-recruiter-form
        [isSaving]="isSaving"
        [showContacts]="true"
        (save)="onSave($event)"
        (cancel)="router.navigate(['/recruiters'])"
      ></app-recruiter-form>
    </div>
  `,
  styles: [`
    .rc-page { max-width: 760px; margin: 0 auto; padding: 32px; }
    .rc-header { margin-bottom: 24px; }
    .rc-back {
      display: inline-flex; align-items: center; gap: 6px; font-size: 13px;
      color: var(--text-tertiary); text-decoration: none; margin-bottom: 12px;
    }
    .rc-back:hover { color: var(--text-primary); }
    .rc-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
    .rc-subtitle { font-size: 13px; color: var(--text-tertiary); margin: 0; }
  `],
})
export class RecruiterCreateComponent {
  isSaving = false;

  constructor(
    public router: Router,
    private agenciesService: RecruitmentAgenciesService,
    private contactsService: AgencyContactsService,
    private toastService: ToastService,
  ) {}

  onSave(event: { agency: any; contacts: any[]; addInteraction: boolean }) {
    this.isSaving = true;
    this.agenciesService.create(event.agency).pipe(
      switchMap((agency: any) => {
        if (!event.contacts.length) return of(agency);
        const calls = event.contacts.map(c =>
          this.contactsService.create({ ...c, agencyId: agency.id })
        );
        return forkJoin(calls).pipe(switchMap(() => of(agency)));
      }),
    ).subscribe({
      next: (agency: any) => {
        const contactMsg = event.contacts.length
          ? ` with ${event.contacts.length} contact${event.contacts.length > 1 ? 's' : ''}`
          : '';
        this.toastService.show(`Agency created${contactMsg}`, 'success');
        if (event.addInteraction) {
          this.router.navigate(['/recruiters', agency.id, 'edit'], { queryParams: { logInteraction: 'true' } });
        } else {
          this.router.navigate(['/recruiters', agency.id]);
        }
      },
      error: () => {
        this.toastService.show('Failed to create agency', 'error');
        this.isSaving = false;
      },
    });
  }
}
