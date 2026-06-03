import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-recruiter-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recruiter-form.component.html',
  styleUrls: ['./recruiter-form.component.css'],
})
export class RecruiterFormComponent implements OnInit {
  @Input() initialData?: any;
  @Input() isSaving = false;
  /** When true, shows the "Add contacts" section (create flow only) */
  @Input() showContacts = false;
  @Output() save = new EventEmitter<{ agency: any; contacts: any[]; addInteraction: boolean }>();
  @Output() cancel = new EventEmitter<void>();

  form = { agencyName: '', website: '', notes: '' };
  addInteraction = false;

  contacts: any[] = [];
  draftContact = this.blankContact();
  showContactForm = false;

  ngOnInit() {
    if (this.initialData) {
      this.form = {
        agencyName: this.initialData.agencyName ?? '',
        website: this.initialData.website ?? '',
        notes: this.initialData.notes ?? '',
      };
    }
  }

  blankContact() {
    return { fullName: '', roleTitle: '', email: '', phoneNumber: '', linkedinUrl: '', isPrimaryContact: false };
  }

  openContactForm() {
    this.draftContact = this.blankContact();
    this.showContactForm = true;
  }
  cancelContactForm() { this.showContactForm = false; }

  addContact() {
    if (!this.draftContact.fullName.trim()) return;
    // If first contact, mark as primary automatically
    if (this.contacts.length === 0) this.draftContact.isPrimaryContact = true;
    this.contacts.push({ ...this.draftContact });
    this.draftContact = this.blankContact();
    this.showContactForm = false;
  }

  removeContact(index: number) {
    this.contacts.splice(index, 1);
    // Ensure at least one primary if contacts remain
    if (this.contacts.length > 0 && !this.contacts.some(c => c.isPrimaryContact)) {
      this.contacts[0].isPrimaryContact = true;
    }
  }

  setPrimary(index: number) {
    this.contacts.forEach((c, i) => c.isPrimaryContact = i === index);
  }

  submit() {
    if (!this.form.agencyName.trim()) return;
    this.save.emit({ agency: { ...this.form }, contacts: [...this.contacts], addInteraction: this.addInteraction });
  }

  openUrl(url: string, event: Event) {
    event.preventDefault();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }
}
