import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiSummaryResponse {
  summary: string;
  risks: string[];
  recommendedNextSteps: string[];
  followUpSuggestion: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface AiInteractionSummaryResponse {
  summary: string;
  positiveSignals: string[];
  riskSignals: string[];
  openQuestions: string[];
  recommendedNextSteps: string[];
  followUpDraft: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface CareerChatResponse {
  answer: string;
  suggestedActions: string[];
  relatedProcesses: Array<{ processId: number; company: string; role: string }>;
  confidence: 'low' | 'medium' | 'high';
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  private apiUrl = `${environment.apiUrl}/api/ai-assistant`;

  constructor(private http: HttpClient) {}

  getProcessSummary(processId: number, userQuestion?: string): Observable<AiSummaryResponse> {
    return this.http.post<AiSummaryResponse>(`${this.apiUrl}/process-summary`, {
      processId,
      userQuestion: userQuestion || undefined,
    });
  }

  getInteractionSummary(
    interactionId: number,
    userQuestion?: string,
  ): Observable<AiInteractionSummaryResponse> {
    return this.http.post<AiInteractionSummaryResponse>(
      `${this.apiUrl}/interaction-summary`,
      { interactionId, userQuestion: userQuestion || undefined },
    );
  }

  careerChat(message: string): Observable<CareerChatResponse> {
    return this.http.post<CareerChatResponse>(`${this.apiUrl}/career-chat`, {
      message,
    });
  }
}
