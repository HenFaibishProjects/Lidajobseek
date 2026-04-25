import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of toastService.toasts$ | async"
           class="toast"
           [ngClass]="toast.type"
           (click)="toastService.remove(toast.id)">
        <div class="toast-icon">
          <svg *ngIf="toast.type === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <svg *ngIf="toast.type === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          <svg *ngIf="toast.type === 'info'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <svg *ngIf="toast.type === 'warning'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div class="toast-content">
          {{ toast.message }}
        </div>
        <div class="toast-progress"></div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 32px;
      right: 32px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 16px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border-radius: 16px;
      color: white;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(12px);
      cursor: pointer;
      animation: toastIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      min-width: 320px;
      max-width: 450px;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .toast:hover {
      transform: translateY(-2px);
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.2);
    }
    .toast:active {
      transform: scale(0.98);
    }
    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.2);
      flex-shrink: 0;
    }
    .toast-content {
      flex: 1;
      line-height: 1.4;
    }
    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background: rgba(255, 255, 255, 0.3);
      animation: progress 3s linear forwards;
    }
    .success { background: linear-gradient(135deg, #059669 0%, #10b981 100%); }
    .error { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); }
    .info { background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); }
    .warning { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); }

    @keyframes toastIn {
      from { transform: translateX(100px) scale(0.9); opacity: 0; }
      to { transform: translateX(0) scale(1); opacity: 1; }
    }
    @keyframes progress {
      from { width: 100%; }
      to { width: 0%; }
    }
  `]
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}
}
