import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  AiAssistantService,
  AiSummaryResponse,
  AiInteractionSummaryResponse,
} from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.css',
})
export class AiAssistantPanelComponent implements OnInit {
  @Input() processId?: number;
  @Input() interactionId?: number;
  @Output() closed = new EventEmitter<void>();

  get mode(): 'process' | 'interaction' {
    return this.interactionId != null ? 'interaction' : 'process';
  }

  isPremium = false;
  isLoading = false;
  processResult: AiSummaryResponse | null = null;
  interactionResult: AiInteractionSummaryResponse | null = null;
  error: string | null = null;
  userQuestion = '';

  constructor(
    private aiAssistantService: AiAssistantService,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.isPremium = this.authService.isPremiumUser();
  }

  close() {
    this.closed.emit();
  }

  goToPricing() {
    this.router.navigate(['/pricing']);
  }

  analyze() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.processResult = null;
    this.interactionResult = null;
    this.error = null;

    if (this.mode === 'interaction' && this.interactionId != null) {
      this.aiAssistantService
        .getInteractionSummary(this.interactionId, this.userQuestion || undefined)
        .subscribe({
          next: (data) => {
            this.interactionResult = data;
            this.isLoading = false;
          },
          error: (err) => this.handleError(err),
        });
    } else if (this.processId != null) {
      this.aiAssistantService
        .getProcessSummary(this.processId, this.userQuestion || undefined)
        .subscribe({
          next: (data) => {
            this.processResult = data;
            this.isLoading = false;
          },
          error: (err) => this.handleError(err),
        });
    }
  }

  private handleError(err: any) {
    this.isLoading = false;
    if (err.status === 403) {
      this.error = 'Premium access required.';
    } else if (err.status === 404) {
      this.error = 'Record not found.';
    } else if (err.status === 503) {
      this.error = err.error?.message || 'AI assistant is temporarily unavailable. Please try again.';
    } else {
      this.error = 'Something went wrong. Please try again.';
    }
  }

  confidenceLabel(): string {
    const confidence = this.processResult?.confidence ?? this.interactionResult?.confidence;
    const map: Record<string, string> = {
      low: 'Low — limited data available',
      medium: 'Medium — partial data',
      high: 'High — solid data',
    };
    return map[confidence ?? ''] ?? '';
  }

  get actionLabel(): string {
    return this.mode === 'interaction' ? 'Analyze this interview' : 'Summarize this application';
  }

  get panelTitle(): string {
    return this.mode === 'interaction' ? 'Interview Analysis' : 'AI Assistant';
  }

  get questionPlaceholder(): string {
    return this.mode === 'interaction'
      ? 'Ask about this interview (optional)'
      : 'Ask a question about this application (optional)';
  }
}
