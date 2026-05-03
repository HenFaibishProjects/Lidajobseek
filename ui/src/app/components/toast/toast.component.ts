import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" role="status" aria-live="polite">
      <div *ngFor="let toast of toastService.toasts$ | async"
           class="toast"
           [ngClass]="toast.type"
           (click)="toastService.remove(toast.id)"
           [attr.aria-label]="toast.message">
        <div class="toast-icon">
          <svg *ngIf="toast.type === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <svg *ngIf="toast.type === 'error'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          <svg *ngIf="toast.type === 'info'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <svg *ngIf="toast.type === 'warning'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div class="toast-content">{{ toast.message }}</div>
        <button class="toast-close" (click)="toastService.remove(toast.id); $event.stopPropagation()" aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="toast-progress"></div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 12px;
      color: white;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0,0,0,0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(12px);
      cursor: pointer;
      animation: toastIn 0.35s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      min-width: 280px;
      max-width: 420px;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      line-height: 1.5;
    }
    .toast:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
    }
    .toast:active {
      transform: scale(0.98);
    }
    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.18);
      flex-shrink: 0;
    }
    .toast-content {
      flex: 1;
      line-height: 1.45;
    }
    .toast-close {
      background: rgba(255,255,255,0.15);
      border: none;
      border-radius: 6px;
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: auto;
      flex-shrink: 0;
      transition: background 0.15s ease;
      margin-left: 4px;
    }
    .toast-close:hover {
      background: rgba(255,255,255,0.28);
      color: white;
    }
    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2.5px;
      background: rgba(255, 255, 255, 0.4);
      animation: progress 4s linear forwards;
    }
    .success { background: linear-gradient(135deg, #059669 0%, #10b981 100%); }
    .error   { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); }
    .info    { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); }
    .warning { background: linear-gradient(135deg, #b45309 0%, #f59e0b 100%); }

    @keyframes toastIn {
      from { transform: translateX(60px) scale(0.92); opacity: 0; }
      to   { transform: translateX(0) scale(1);       opacity: 1; }
    }
    @keyframes progress {
      from { width: 100%; }
      to   { width: 0%; }
    }
  `]
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
}
