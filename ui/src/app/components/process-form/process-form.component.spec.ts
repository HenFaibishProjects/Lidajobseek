import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ProcessFormComponent } from './process-form.component';
import {
  LucideAngularModule, Briefcase, Link, ExternalLink,
  MapPin, Sparkles, Target, Rocket, Heart, Calendar
} from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../services/confirm.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EMPTY, of } from 'rxjs';

describe('ProcessFormComponent', () => {
  let component: ProcessFormComponent;
  let fixture: ComponentFixture<ProcessFormComponent>;
  let settingsServiceSpy: jasmine.SpyObj<SettingsService>;
  let confirmServiceSpy: jasmine.SpyObj<ConfirmService>;

  const DEFAULT_LOGO = 'assets/default-company.png';

  function makeSettings(overrides: Partial<{ country: string }> = {}) {
    return {
      country: 'Israel', theme: 'light', clockFormat: '24', dateFormat: 'DD/MM/YYYY',
      avatarStyle: 'avataaars', notifications: { email: true, desktop: true, followUps: true, interviews: true },
      dashboard: { showStats: true, showTasks: true, defaultView: 'grid' }, hasSeenOnboarding: true,
      ...overrides
    } as any;
  }

  beforeEach(async () => {
    const authSpy = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'getPreferences', 'getUser']);
    authSpy.isAuthenticated.and.returnValue(false);
    authSpy.getPreferences.and.returnValue(EMPTY);
    authSpy.getUser.and.returnValue(null);

    const settingsSpy = jasmine.createSpyObj('SettingsService', ['getSettings', 'openSettingsPanel']);
    settingsSpy.getSettings.and.returnValue(makeSettings());

    const confirmSpy = jasmine.createSpyObj('ConfirmService', ['confirm']);

    await TestBed.configureTestingModule({
      imports: [
        ProcessFormComponent,
        FormsModule,
        CommonModule,
        HttpClientTestingModule,
        LucideAngularModule.pick({ Briefcase, Link, ExternalLink, MapPin, Sparkles, Target, Rocket, Heart, Calendar })
      ],
      providers: [
        ChangeDetectorRef,
        { provide: SettingsService, useValue: settingsSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: ConfirmService, useValue: confirmSpy }
      ]
    }).compileComponents();

    settingsServiceSpy = TestBed.inject(SettingsService) as jasmine.SpyObj<SettingsService>;
    confirmServiceSpy = TestBed.inject(ConfirmService) as jasmine.SpyObj<ConfirmService>;

    fixture = TestBed.createComponent(ProcessFormComponent);
    component = fixture.componentInstance;
    component.process = {
      companyName: '', companyWebsite: '', companyLogoUrl: '',
      roleTitle: '', techStack: '', currentStage: component.stages[0],
      workMode: '', salaryExpectation: null, salaryCurrency: 'ILS',
      salaryPeriod: 'Month', location: '', tailoredPitch: '', jobDescriptionUrl: ''
    };
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  // ── Smoke test ──────────────────────────────────────────────────────
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── DEFAULT_LOGO ────────────────────────────────────────────────────
  describe('DEFAULT_LOGO', () => {
    it('should equal the asset path', () => {
      expect(component.DEFAULT_LOGO).toBe('assets/default-company.png');
    });
  });

  // ── logoSrc() ───────────────────────────────────────────────────────
  describe('logoSrc()', () => {
    it('returns the default logo when companyLogoUrl is empty', () => {
      component.process.companyLogoUrl = '';
      expect(component.logoSrc()).toBe(DEFAULT_LOGO);
    });

    it('returns the default logo when companyLogoUrl is null', () => {
      component.process.companyLogoUrl = null;
      expect(component.logoSrc()).toBe(DEFAULT_LOGO);
    });

    it('returns the actual logo URL when set', () => {
      component.process.companyLogoUrl = 'https://example.com/logo.png';
      expect(component.logoSrc()).toBe('https://example.com/logo.png');
    });
  });

  // ── onLogoError() ───────────────────────────────────────────────────
  describe('onLogoError()', () => {
    it('clears the companyLogoUrl', () => {
      component.process.companyLogoUrl = 'https://example.com/logo.png';
      component.onLogoError();
      expect(component.process.companyLogoUrl).toBeNull();
    });

    it('sets logoFetchState to failed when currently fetching', () => {
      component.process.companyLogoUrl = 'https://example.com/logo.png';
      component.logoFetchState = 'fetching';
      component.onLogoError();
      expect(component.logoFetchState).toBe('failed');
    });

    it('sets logoFetchState to idle when not fetching', () => {
      component.logoFetchState = 'idle';
      component.onLogoError();
      expect(component.logoFetchState).toBe('idle');
    });
  });

  // ── techStackScore ──────────────────────────────────────────────────
  describe('techStackScore', () => {
    it('returns 0 when tech stack is empty', () => {
      component.process.techStack = '';
      expect(component.techStackScore).toBe(0);
    });

    it('returns 10 for 1 term', () => {
      component.process.techStack = 'React';
      expect(component.techStackScore).toBe(10);
    });

    it('returns 10 for 2 terms', () => {
      component.process.techStack = 'React Node';
      expect(component.techStackScore).toBe(10);
    });

    it('returns 15 for 3 terms', () => {
      component.process.techStack = 'React, Node.js, PostgreSQL';
      expect(component.techStackScore).toBe(15);
    });

    it('returns 15 for 5 terms', () => {
      component.process.techStack = 'React Node PostgreSQL Docker Redis';
      expect(component.techStackScore).toBe(15);
    });

    it('returns 20 for 6 terms', () => {
      component.process.techStack = 'React, Node.js, PostgreSQL, Docker, Redis, Kafka';
      expect(component.techStackScore).toBe(20);
    });

    it('returns 20 for 7+ terms', () => {
      component.process.techStack = 'React Node PostgreSQL Docker Redis Kafka Kubernetes';
      expect(component.techStackScore).toBe(20);
    });

    it('handles comma-separated terms', () => {
      component.process.techStack = 'TypeScript,Angular,NestJS';
      expect(component.techStackScore).toBe(15);
    });
  });

  // ── completionPercent (unified scoring) ─────────────────────────────
  describe('completionPercent', () => {
    it('returns 0 when process is empty', () => {
      expect(component.completionPercent).toBe(0);
    });

    it('adds 10 for company name', () => {
      component.process.companyName = 'Google';
      expect(component.completionPercent).toBe(10);
    });

    it('adds 10 for role title', () => {
      component.process.roleTitle = 'Engineer';
      expect(component.completionPercent).toBe(10);
    });

    it('adds 10 for company website', () => {
      component.process.companyWebsite = 'google.com';
      expect(component.completionPercent).toBe(10);
    });

    it('adds 10 for job description url', () => {
      component.process.jobDescriptionUrl = 'https://jobs.google.com/123';
      expect(component.completionPercent).toBe(10);
    });

    it('adds 10 for salary expectation', () => {
      component.process.salaryExpectation = 5000;
      expect(component.completionPercent).toBe(10);
    });

    it('adds 10 for real logo (not default)', () => {
      component.process.companyLogoUrl = 'https://google.com/favicon.ico';
      expect(component.completionPercent).toBe(10);
    });

    it('does NOT add points for default logo', () => {
      component.process.companyLogoUrl = DEFAULT_LOGO;
      expect(component.completionPercent).toBe(0);
    });

    it('adds 10% pitch for short text (≤60 chars)', () => {
      component.process.tailoredPitch = 'I am a great fit.';
      expect(component.completionPercent).toBe(10);
    });

    it('adds 15% pitch for medium text (61-150 chars)', () => {
      component.process.tailoredPitch = 'A'.repeat(100);
      expect(component.completionPercent).toBe(15);
    });

    it('adds 20% pitch for long text (150+ chars)', () => {
      component.process.tailoredPitch = 'A'.repeat(151);
      expect(component.completionPercent).toBe(20);
    });

    it('never goes below current percent when switching to II stage', () => {
      component.process.companyName = 'Google';   // +10
      component.process.roleTitle = 'Engineer';   // +10
      const before = component.completionPercent; // 20

      // Switch to a stage that shows II section
      component.process.currentStage = component.stages[2];
      const after = component.completionPercent;

      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('caps at 100', () => {
      component.process.companyName = 'Google';
      component.process.roleTitle = 'Engineer';
      component.process.techStack = 'React Node PostgreSQL Docker Redis Kafka';
      component.process.companyWebsite = 'google.com';
      component.process.jobDescriptionUrl = 'https://jobs.google.com';
      component.process.companyLogoUrl = 'https://google.com/favicon.ico';
      component.process.salaryExpectation = 10000;
      component.process.tailoredPitch = 'A'.repeat(200);
      expect(component.completionPercent).toBeLessThanOrEqual(100);
    });

    it('adds +13 bonus for II notes when II section is visible', () => {
      component.process.currentStage = component.stages[2]; // triggers II section
      component.process.initialInviteContent = 'Recruiter reached out via LinkedIn.';
      const pct = component.completionPercent;
      expect(pct).toBeGreaterThanOrEqual(13);
    });

    it('does NOT add II notes bonus when section is hidden', () => {
      component.process.currentStage = component.stages[0]; // no II
      component.process.initialInviteContent = 'Some notes';
      expect(component.completionPercent).toBe(0);
    });
  });

  // ── progressColor ───────────────────────────────────────────────────
  describe('progressColor', () => {
    it('returns red for 0%', () => {
      expect(component.progressColor).toBe('#ef4444');
    });

    it('returns amber for 40%', () => {
      // Fill enough to be 40%
      component.process.companyName = 'Google';
      component.process.roleTitle = 'Engineer';
      component.process.techStack = 'React Node PostgreSQL';
      component.process.companyWebsite = 'google.com';
      // 10+10+15+10 = 45 -amber
      expect(component.progressColor).toBe('#f59e0b');
    });

    it('returns green for 90%+', () => {
      component.process.companyName = 'Google';
      component.process.roleTitle = 'Engineer';
      component.process.techStack = 'React Node PostgreSQL Docker Redis Kafka';
      component.process.companyWebsite = 'google.com';
      component.process.jobDescriptionUrl = 'https://jobs.google.com';
      component.process.companyLogoUrl = 'https://google.com/favicon.ico';
      component.process.salaryExpectation = 10000;
      component.process.tailoredPitch = 'A'.repeat(200);
      expect(component.progressColor).toBe('#10b981');
    });
  });

  // ── fetchLogo() ─────────────────────────────────────────────────────
  describe('fetchLogo()', () => {
    it('does nothing when companyWebsite is empty', () => {
      component.process.companyWebsite = '';
      component.fetchLogo();
      expect(component.logoFetchState).toBe('idle');
    });

    it('calls showLogoFailed for invalid domain (no dot)', () => {
      component.process.companyWebsite = 'notadomain';
      component.fetchLogo();
      expect(component.logoFetchState).toBe('failed');
    });

    it('calls showLogoFailed for too-short domain', () => {
      component.process.companyWebsite = 'a.b';
      component.fetchLogo();
      expect(component.logoFetchState).toBe('failed');
    });

    it('sets state to fetching for valid domain', () => {
      spyOn(window as any, 'Image').and.returnValue({ onload: null, onerror: null, src: '' });
      component.process.companyWebsite = 'google.com';
      component.fetchLogo();
      expect(component.logoFetchState).toBe('fetching');
    });
  });

  // ── showLogoFailed auto-dismiss ─────────────────────────────────────
  describe('logoFetchState auto-dismiss', () => {
    it('resets failed state to idle after 4 seconds', fakeAsync(() => {
      component.process.companyWebsite = 'notadomain';
      component.fetchLogo();
      expect(component.logoFetchState).toBe('failed');

      tick(4000);
      expect(component.logoFetchState).toBe('idle');
    }));
  });

  // ── formatUrl() ─────────────────────────────────────────────────────
  describe('formatUrl()', () => {
    it('should add https:// prefix if missing', () => {
      expect(component.formatUrl('google.com')).toBe('https://google.com');
    });

    it('should NOT add prefix if already present', () => {
      expect(component.formatUrl('http://google.com')).toBe('http://google.com');
      expect(component.formatUrl('https://google.com')).toBe('https://google.com');
    });
  });

  // ── shouldShowInteractionSection ────────────────────────────────────
  describe('shouldShowInteractionSection', () => {
    it('returns false for first stage', () => {
      component.process.currentStage = component.stages[0];
      expect(component.shouldShowInteractionSection).toBe(false);
    });

    it('returns false for second stage', () => {
      component.process.currentStage = component.stages[1];
      expect(component.shouldShowInteractionSection).toBe(false);
    });

    it('returns true for third stage and beyond', () => {
      component.process.currentStage = component.stages[2];
      expect(component.shouldShowInteractionSection).toBe(true);
    });
  });

  // ── getCompanyInitial() ─────────────────────────────────────────────
  describe('getCompanyInitial()', () => {
    it('returns uppercased first letter of company name', () => {
      component.process.companyName = 'google';
      expect(component.getCompanyInitial()).toBe('G');
    });

    it('returns ? when company name is empty', () => {
      component.process.companyName = '';
      expect(component.getCompanyInitial()).toBe('?');
    });
  });

  // ── userCountry / citiesForUserCountry ──────────────────────────────
  describe('userCountry', () => {
    it('returns country from settings', () => {
      settingsServiceSpy.getSettings.and.returnValue(makeSettings({ country: 'Germany' }));
      expect(component.userCountry).toBe('Germany');
    });

    it('falls back to Israel when country is empty', () => {
      settingsServiceSpy.getSettings.and.returnValue(makeSettings({ country: '' }));
      expect(component.userCountry).toBe('Israel');
    });
  });

  describe('citiesForUserCountry', () => {
    it('returns an array for a known country', () => {
      settingsServiceSpy.getSettings.and.returnValue(makeSettings({ country: 'Israel' }));
      const cities = component.citiesForUserCountry;
      expect(Array.isArray(cities)).toBeTrue();
      expect(cities.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown country', () => {
      settingsServiceSpy.getSettings.and.returnValue(makeSettings({ country: 'Narnia' }));
      expect(component.citiesForUserCountry).toEqual([]);
    });
  });

  // ── CURRENCIES / SALARY_PERIODS constants ───────────────────────────
  describe('CURRENCIES', () => {
    it('contains at least 10 currencies', () => {
      expect(component.CURRENCIES.length).toBeGreaterThanOrEqual(10);
    });

    it('contains ILS, USD, EUR, GBP', () => {
      const codes = component.CURRENCIES.map(c => c.code);
      expect(codes).toContain('ILS');
      expect(codes).toContain('USD');
      expect(codes).toContain('EUR');
      expect(codes).toContain('GBP');
    });

    it('each entry has code, symbol, and label', () => {
      component.CURRENCIES.forEach(c => {
        expect(c.code).toBeTruthy();
        expect(c.symbol).toBeTruthy();
        expect(c.label).toBeTruthy();
      });
    });
  });

  describe('SALARY_PERIODS', () => {
    it('contains Month, Year, Week, Day, Hour options', () => {
      const values = component.SALARY_PERIODS.map(p => p.value);
      expect(values).toContain('Month');
      expect(values).toContain('Year');
      expect(values).toContain('Week');
      expect(values).toContain('Day');
      expect(values).toContain('Hour');
    });
  });

  // ── settingsService.openSettingsPanel ───────────────────────────────
  describe('openSettingsPanel()', () => {
    it('is callable via the public settingsService reference', () => {
      component.settingsService.openSettingsPanel();
      expect(settingsServiceSpy.openSettingsPanel).toHaveBeenCalled();
    });
  });

  // ── cancel() confirmation ───────────────────────────────────────────
  describe('cancel() with confirmation', () => {
    it('calls confirmService.confirm()', async () => {
      confirmServiceSpy.confirm.and.returnValue(Promise.resolve(false));
      await component.cancel();
      expect(confirmServiceSpy.confirm).toHaveBeenCalled();
    });

    it('emits onCancel when confirmed', async () => {
      spyOn(component.onCancel, 'emit');
      confirmServiceSpy.confirm.and.returnValue(Promise.resolve(true));
      await component.cancel();
      expect(component.onCancel.emit).toHaveBeenCalled();
    });

    it('does NOT emit onCancel when rejected', async () => {
      spyOn(component.onCancel, 'emit');
      confirmServiceSpy.confirm.and.returnValue(Promise.resolve(false));
      await component.cancel();
      expect(component.onCancel.emit).not.toHaveBeenCalled();
    });
  });
});
