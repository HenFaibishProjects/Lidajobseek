import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService, ConfirmOptions } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overlay" *ngIf="options$ | async as options" (click)="onOverlayClick($event)">
      <div class="dialog" [class.dialog-danger]="options.danger" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="options.title" aria-modal="true">
        <div class="dialog-icon-wrap" *ngIf="options.danger">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="dialog-header">
          <h3 class="dialog-title">{{ options.title }}</h3>
          <button class="dialog-close" (click)="onCancel()" aria-label="Close dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="dialog-message">{{ options.message }}</p>
        <div class="dialog-actions">
          <ng-container *ngIf="options.buttons; else defaultButtons">
            <button *ngFor="let btn of options.buttons"
                    [class]="btn.class || 'btn-secondary'"
                    (click)="onCustom(btn.value)">
              {{ btn.text }}
            </button>
          </ng-container>
          <ng-template #defaultButtons>
            <button class="btn-secondary" (click)="onCancel()">{{ options.cancelText }}</button>
            <button [class]="options.danger ? 'btn-danger' : 'btn-primary'" (click)="onConfirm()">{{ options.confirmText }}</button>
          </ng-template>
        </div>
        <div class="keyboard-hint">Press <kbd>ESC</kbd> to cancel</div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
      animation: fadeIn 0.18s ease-out;
    }
    .dialog {
      background: var(--bg-primary);
      padding: 28px;
      border-radius: 16px;
      width: min(92vw, 440px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08);
      border: 1px solid var(--border-color);
      animation: scaleIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      color: var(--text-primary);
    }
    .dialog-danger {
      border-color: rgba(209, 52, 56, 0.25);
    }
    .dialog-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--error-light);
      color: var(--error);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .dialog-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.3;
    }
    .dialog-close {
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      padding: 4px;
      min-height: auto;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
      margin-left: 12px;
    }
    .dialog-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .dialog-close:focus-visible {
      outline: 2px solid var(--primary-blue);
      outline-offset: 2px;
    }
    .dialog-message {
      margin-bottom: 24px;
      color: var(--text-secondary);
      line-height: 1.6;
      font-size: 14px;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 16px;
    }
    .dialog-actions button {
      min-width: 90px;
    }
    .keyboard-hint {
      text-align: center;
      font-size: 11px;
      color: var(--text-tertiary);
      border-top: 1px solid var(--border-color);
      padding-top: 14px;
      letter-spacing: 0.01em;
    }
    .keyboard-hint kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-dark);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 11px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { transform: scale(0.92) translateY(8px); opacity: 0; }
      to { transform: scale(1) translateY(0); opacity: 1; }
    }
  `]
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
