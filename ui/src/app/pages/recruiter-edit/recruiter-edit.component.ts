import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { RecruiterFormComponent } from '../../components/recruiter-form/recruiter-form.component';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
import { AgencyContactsService } from '../../services/agency-contacts.service';
import { AgencyInteractionsService } from '../../services/agency-interactions.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { INTERACTION_TYPES, INTERACTION_DIRECTIONS } from '../../shared/agency-interaction-types';

@Component({
  selector: 'app-recruiter-edit',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, RecruiterFormComponent, DateFormatPipe],
  templateUrl: './recruiter-edit.component.html',
  styleUrls: ['./recruiter-edit.component.css'],
})
export class RecruiterEditComponent implements OnInit {
  agencyId!: number;
  agency: any = null;
  isLoading = true;
  isSaving = false;

  // Contacts
  showContactForm = false;
  newContact = this.blankContact();
  editingContact: any = null;

  // Interactions
  showInteractionForm = false;
  newInteraction = this.blankInteraction();
  editingInteraction: any = null;

  readonly INTERACTION_TYPES = INTERACTION_TYPES;
  readonly INTERACTION_DIRECTIONS = INTERACTION_DIRECTIONS;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private agenciesService: RecruitmentAgenciesService,
    private contactsService: AgencyContactsService,
    private interactionsService: AgencyInteractionsService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
  ) {}

  shouldLogInteraction = false;
  editInteractionId: number | null = null;

  ngOnInit() {
    this.agencyId = Number(this.route.snapshot.paramMap.get('id'));
    this.route.queryParams.subscribe(params => {
      if (params['logInteraction'] === 'true') {
        this.shouldLogInteraction = true;
      }
      if (params['editInteractionId']) {
        this.editInteractionId = Number(params['editInteractionId']);
      }
    });
    this.load();
  }

  load() {
    this.isLoading = true;
    this.agenciesService.getById(this.agencyId).subscribe({
      next: (data) => { 
        this.agency = data; 
        this.isLoading = false; 
        if (this.shouldLogInteraction) {
          this.showInteractionForm = true;
          const primaryContact = this.agency.contacts?.find((c: any) => c.isPrimaryContact);
          const contactId = primaryContact ? primaryContact.id : (this.agency.contacts?.[0]?.id ?? null);
          this.newInteraction = { ...this.blankInteraction(), contactId };
          this.shouldLogInteraction = false;
        }
        if (this.editInteractionId) {
          const interactionToEdit = this.agency.interactions?.find((i: any) => i.id === this.editInteractionId);
          if (interactionToEdit) {
            this.startEditInteraction(interactionToEdit);
          }
          this.editInteractionId = null;
        }
      },
      error: () => { this.toastService.show('Failed to load agency', 'error'); this.isLoading = false; },
    });
  }

  // ── Agency form ───────────────────────────────────────────────────────────

  onSave(event: { agency: any; contacts: any[] }) {
    this.isSaving = true;
    this.agenciesService.update(this.agencyId, event.agency).pipe(
      switchMap(() => {
        if (!event.contacts.length) return of(null);
        return forkJoin(event.contacts.map(c =>
          this.contactsService.create({ ...c, agencyId: this.agencyId })
        ));
      }),
    ).subscribe({
      next: () => {
        const msg = event.contacts.length ? ` and added ${event.contacts.length} contact${event.contacts.length > 1 ? 's' : ''}` : '';
        this.toastService.show(`Agency updated${msg}`, 'success');
        this.router.navigate(['/recruiters', this.agencyId]);
      },
      error: () => { this.toastService.show('Failed to update agency', 'error'); this.isSaving = false; },
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  blankContact() { return { fullName: '', phoneNumber: '', email: '', roleTitle: '', linkedinUrl: '', notes: '', isPrimaryContact: false }; }

  cancelContact() { this.showContactForm = false; this.newContact = this.blankContact(); }

  saveContact() {
    if (!this.newContact.fullName.trim()) return;
    this.contactsService.create({ ...this.newContact, agencyId: this.agencyId }).subscribe({
      next: () => { this.toastService.show('Contact added', 'success'); this.cancelContact(); this.load(); },
      error: () => this.toastService.show('Failed to add contact', 'error'),
    });
  }

  startEditContact(c: any) { this.editingContact = { ...c }; }
  cancelEditContact() { this.editingContact = null; }

  saveEditContact() {
    if (!this.editingContact?.fullName?.trim()) return;
    const { id, ...data } = this.editingContact;
    this.contactsService.update(id, data).subscribe({
      next: () => { this.toastService.show('Contact updated', 'success'); this.editingContact = null; this.load(); },
      error: () => this.toastService.show('Failed to update contact', 'error'),
    });
  }

  async deleteContact(c: any) {
    if (await this.confirmService.delete(`contact "${c.fullName}"`)) {
      this.contactsService.delete(c.id).subscribe({
        next: () => { this.toastService.show('Contact removed', 'success'); this.load(); },
        error: () => this.toastService.show('Failed to remove contact', 'error'),
      });
    }
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  blankInteraction() {
    return { interactionDate: new Date().toISOString().slice(0, 10), interactionType: 'PHONE_CALL', direction: 'INCOMING', summary: '', notes: '', cvSent: false, contactId: null as number | null };
  }

  cancelInteraction() { this.showInteractionForm = false; this.newInteraction = this.blankInteraction(); }

  logInteraction() {
    if (!this.newInteraction.summary.trim()) return;
    this.interactionsService.create({ ...this.newInteraction, agencyId: this.agencyId, interactionDate: new Date(this.newInteraction.interactionDate).toISOString() }).subscribe({
      next: () => { this.toastService.show('Interaction logged', 'success'); this.cancelInteraction(); this.load(); },
      error: () => this.toastService.show('Failed to log interaction', 'error'),
    });
  }

  startEditInteraction(i: any) {
    this.editingInteraction = { ...i, interactionDate: i.interactionDate ? new Date(i.interactionDate).toISOString().slice(0, 10) : '', contactId: i.contact?.id ?? null };
  }
  cancelEditInteraction() { this.editingInteraction = null; }

  saveEditInteraction() {
    if (!this.editingInteraction?.summary?.trim()) return;
    const { id, contact, ...data } = this.editingInteraction;
    this.interactionsService.update(id, { ...data, interactionDate: new Date(data.interactionDate).toISOString() }).subscribe({
      next: () => { this.toastService.show('Interaction updated', 'success'); this.editingInteraction = null; this.load(); },
      error: () => this.toastService.show('Failed to update interaction', 'error'),
    });
  }

  async deleteInteraction(i: any) {
    if (await this.confirmService.delete('this interaction')) {
      this.interactionsService.delete(i.id).subscribe({
        next: () => { this.toastService.show('Interaction removed', 'success'); this.load(); },
        error: () => this.toastService.show('Failed to remove interaction', 'error'),
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
