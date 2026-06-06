import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplatesService, Template, TemplateVersion } from '../../services/templates.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.css'],
})
export class TemplatesComponent implements OnInit {
  templates: Template[] = [];
  isLoading = true;

  // Create form state
  showCreateForm = false;
  newName = '';
  newVersions: TemplateVersion[] = [{ label: 'v1', content: '' }];

  // Edit state
  editingId: number | null = null;
  editName = '';
  editVersions: TemplateVersion[] = [];

  // View state
  expandedId: number | null = null;
  activeVersionIndex: Record<number, number | undefined> = {};
  copiedKey: string | null = null;

  constructor(
    private templatesService: TemplatesService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading = true;
    this.templatesService.getAll().subscribe({
      next: (data) => { this.templates = data; this.isLoading = false; },
      error: () => { this.toastService.show('Failed to load templates', 'error'); this.isLoading = false; },
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────
  openCreate() {
    this.showCreateForm = true;
    this.newName = '';
    this.newVersions = [{ label: 'v1', content: '' }];
    this.editingId = null;
  }

  cancelCreate() { this.showCreateForm = false; }

  addNewVersion() {
    const n = this.newVersions.length + 1;
    this.newVersions.push({ label: `v${n}`, content: '' });
  }

  removeNewVersion(index: number) {
    if (this.newVersions.length === 1) return;
    this.newVersions.splice(index, 1);
  }

  save() {
    if (!this.newName.trim()) { this.toastService.show('Template name is required', 'error'); return; }
    const valid = this.newVersions.every(v => v.label.trim() && v.content.trim());
    if (!valid) { this.toastService.show('All versions need a label and content', 'error'); return; }

    this.templatesService.create({ name: this.newName.trim(), versions: this.newVersions }).subscribe({
      next: () => { this.toastService.show('Template created', 'success'); this.cancelCreate(); this.load(); },
      error: () => this.toastService.show('Failed to create template', 'error'),
    });
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  startEdit(t: Template) {
    this.editingId = t.id;
    this.editName = t.name;
    this.editVersions = t.versions.map(v => ({ ...v }));
    this.showCreateForm = false;
    this.expandedId = null;
  }

  cancelEdit() { this.editingId = null; }

  addEditVersion() {
    const n = this.editVersions.length + 1;
    this.editVersions.push({ label: `v${n}`, content: '' });
  }

  removeEditVersion(index: number) {
    if (this.editVersions.length === 1) return;
    this.editVersions.splice(index, 1);
  }

  saveEdit() {
    if (!this.editName.trim()) { this.toastService.show('Template name is required', 'error'); return; }
    const valid = this.editVersions.every(v => v.label.trim() && v.content.trim());
    if (!valid) { this.toastService.show('All versions need a label and content', 'error'); return; }

    this.templatesService.update(this.editingId!, { name: this.editName.trim(), versions: this.editVersions }).subscribe({
      next: () => { this.toastService.show('Template updated', 'success'); this.cancelEdit(); this.load(); },
      error: () => this.toastService.show('Failed to update template', 'error'),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async deleteTemplate(t: Template) {
    if (await this.confirmService.delete(`template "${t.name}"`)) {
      this.templatesService.delete(t.id).subscribe({
        next: () => { this.toastService.show('Template deleted', 'success'); this.load(); },
        error: () => this.toastService.show('Failed to delete template', 'error'),
      });
    }
  }

  // ── View / Copy ───────────────────────────────────────────────────────────
  toggleExpand(id: number) {
    this.expandedId = this.expandedId === id ? null : id;
    if (!this.activeVersionIndex[id]) this.activeVersionIndex[id] = 0;
  }

  setActiveVersion(templateId: number, idx: number) {
    this.activeVersionIndex[templateId] = idx;
  }

  getActiveContent(t: Template): string {
    const idx = this.getVersionIndex(t.id);
    return t.versions[idx]?.content ?? '';
  }

  getVersionIndex(templateId: number): number {
    return this.activeVersionIndex[templateId] ?? 0;
  }

  copyContent(templateId: number, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      this.copiedKey = `${templateId}`;
      this.toastService.show('Copied to clipboard!', 'success');
      setTimeout(() => { this.copiedKey = null; }, 2000);
    });
  }
}
