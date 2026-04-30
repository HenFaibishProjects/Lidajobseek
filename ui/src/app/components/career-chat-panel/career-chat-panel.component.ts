import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AiAssistantService, CareerChatResponse } from '../../services/ai-assistant.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

const QUICK_PROMPTS = [
  'Summarize my job search',
  'What should I follow up on?',
  'Which opportunities look strongest?',
  'What should I prepare next?',
  'Show me risky or stale processes',
];

@Component({
  selector: 'app-career-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './career-chat-panel.component.html',
  styleUrl: './career-chat-panel.component.css',
})
export class CareerChatPanelComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  isPremium = false;
  isLoading = false;
  message = '';
  result: CareerChatResponse | null = null;
  error: string | null = null;
  quickPrompts = QUICK_PROMPTS;

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
    this.close();
  }

  selectChip(prompt: string) {
    this.message = prompt;
    this.send();
  }

  send() {
    const msg = this.message.trim();
    if (!msg || this.isLoading) return;
    this.isLoading = true;
    this.result = null;
    this.error = null;

    this.aiAssistantService.careerChat(msg).subscribe({
      next: (data) => {
        this.result = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 403) {
          this.error = 'Premium access required.';
        } else if (err.status === 400) {
          this.error = 'Please enter a question.';
        } else if (err.status === 503) {
          this.error = err.error?.message || 'AI assistant is temporarily unavailable. Please try again.';
        } else {
          this.error = 'Something went wrong. Please try again.';
        }
      },
    });
  }

  confidenceLabel(): string {
    const map: Record<string, string> = {
      low: 'Low — limited data',
      medium: 'Medium — partial data',
      high: 'High — solid data',
    };
    return map[this.result?.confidence ?? ''] ?? '';
  }

  navigateToProcess(processId: number) {
    this.router.navigate(['/process', processId]);
    this.close();
  }
}
