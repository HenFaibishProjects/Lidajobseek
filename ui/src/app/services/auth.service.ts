import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type DateFormatPreference = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
export type TimeFormatPreference = '12' | '24';

export interface PreferencesResponse {
  theme: ThemePreference;
  country: string;
  dateFormat: DateFormatPreference;
  timeFormat: TimeFormatPreference;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth`;
  private tokenKey = 'app_token';

  constructor(private http: HttpClient, private router: Router) { }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.access_token);
        if (res.user) {
          localStorage.setItem('app_user', JSON.stringify(res.user));
        }
      })
    );
  }

  register(email: string, password: string, name: string, code: string) {
    return this.http.post(`${this.apiUrl}/register`, { email, password, name, code });
  }

  verifyInvitationCode(code: string) {
    return this.http.post(`${this.apiUrl}/verify-code`, { code });
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('app_user');
    localStorage.removeItem('jobseek_user_settings');
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): any | null {
    const raw = localStorage.getItem('app_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setUser(user: any) {
    localStorage.setItem('app_user', JSON.stringify(user));
  }

  getPricingPlan(): 'free' | 'premium' | 'enterprise' {
    const user = this.getUser();
    return user?.pricingPlan || 'free';
  }

  isPremiumUser(): boolean {
    const plan = this.getPricingPlan();
    return plan === 'premium' || plan === 'enterprise';
  }

  getPreferences() {
    return this.http.get<PreferencesResponse>(`${this.apiUrl}/preferences`);
  }

  updatePreferences(preferences: Partial<PreferencesResponse>) {
    return this.http.patch<PreferencesResponse>(`${this.apiUrl}/preferences`, preferences).pipe(
      tap((prefs) => {
        const existing = this.getUser() || {};
        this.setUser({
          ...existing,
          themePreference: prefs.theme,
          countryPreference: prefs.country,
          dateFormatPreference: prefs.dateFormat,
          timeFormatPreference: prefs.timeFormat,
        });
      }),
    );
  }
}
