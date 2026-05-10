import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService, ConfirmOptions } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent {
  options$;

  constructor(public confirmService: ConfirmService) {
    this.options$ = this.confirmService.confirmState$;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    this.onCancel();
  }

  onOverlayClick(event: MouseEvent) {
    // Click outside to dismiss
    this.onCancel();
  }

  onConfirm() {
    this.confirmService.resolve(true);
  }

  onCancel() {
    this.confirmService.resolve(false);
  }

  onCustom(value: any) {
    this.confirmService.resolve(value);
  }
}
