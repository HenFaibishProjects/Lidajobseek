import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs';
import { ConfirmService, ConfirmOptions } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent {
  options$;
  private activeOptions: ConfirmOptions | null = null;

  constructor(public confirmService: ConfirmService) {
    this.options$ = this.confirmService.confirmState$.pipe(tap(options => this.activeOptions = options));
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    this.onCancel();
  }

  onOverlayClick(event: MouseEvent) {
    // Click outside to dismiss
    this.onCancel();
  }

  onConfirm(options?: ConfirmOptions) {
    this.confirmService.resolve(options?.rejectionSummary !== undefined ? options.rejectionSummary.trim() : true);
  }

  onCancel() {
    this.confirmService.resolve(this.activeOptions?.rejectionSummary !== undefined ? null : false);
  }

  onCustom(value: any) {
    this.confirmService.resolve(value);
  }
}
