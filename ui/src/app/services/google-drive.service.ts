import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { environment } from '../../../environments/environment';

declare var google: any;

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {
  private accessToken = new BehaviorSubject<string | null>(localStorage.getItem('google_access_token'));
  accessToken$ = this.accessToken.asObservable();

  private tokenClient: any;

  constructor(private http: HttpClient) {
    this.initClient();
  }

  private initClient() {
    // We wait for the script to load
    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        clearInterval(interval);
        this.setupTokenClient();
      }
    }, 100);
  }

  private setupTokenClient() {
    // This will be configured via preferences or environment
    // For now, we'll try to get it from preferences in the component
  }

  login(clientId: string) {
    return new Promise((resolve, reject) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.error !== undefined) {
            reject(response);
            return;
          }
          this.accessToken.next(response.access_token);
          localStorage.setItem('google_access_token', response.access_token);
          resolve(response);
        },
      });
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  logout() {
    this.accessToken.next(null);
    localStorage.removeItem('google_access_token');
  }

  getFiles(folderId: string): Observable<any> {
    const token = this.accessToken.value;
    if (!token) throw new Error('Not authenticated');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    const query = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,thumbnailLink,iconLink,webViewLink)`;

    return this.http.get(url, { headers });
  }
}
