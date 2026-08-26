import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface MailCoverageEntry {
  id: number;
  companyName: string;
  receivedCvEmail: boolean;
  receivedCvDate: string | null;
  rejectedEmail: boolean;
  rejectedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailCoveragePayload {
  companyName: string;
  receivedCvEmail: boolean;
  receivedCvDate: string | null;
  rejectedEmail: boolean;
  rejectedDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class MailCoverageService {
  private readonly url = `${environment.apiUrl}/api/mail-coverage`;

  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<MailCoverageEntry[]>(this.url);
  }

  create(payload: MailCoveragePayload) {
    return this.http.post<MailCoverageEntry>(this.url, payload);
  }

  update(id: number, payload: MailCoveragePayload) {
    return this.http.patch<MailCoverageEntry>(`${this.url}/${id}`, payload);
  }

  delete(id: number) {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
