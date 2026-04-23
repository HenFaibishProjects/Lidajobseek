import { TestBed } from '@angular/core/testing';
import { SettingsService, UserSettings } from './settings.service';
import { AuthService } from './auth.service';
import { of, EMPTY } from 'rxjs';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('SettingsService', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  const mockLocalStorage = (() => {
    let store: { [key: string]: string } = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => store[key] = value,
      clear: () => store = {},
    };
  })();

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', [
      'isAuthenticated',
      'getPreferences',
      'updatePreferences',
      'getUser'
    ]);

    authSpy.isAuthenticated.and.returnValue(false);
    authSpy.getPreferences.and.returnValue(EMPTY);
    authSpy.getUser.and.returnValue(null);

    authServiceSpy = authSpy;

    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
    
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jasmine.createSpy('matchMedia').and.returnValue({
          matches: false,
          media: '',
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }),
      });
    }

    mockLocalStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SettingsService,
        { provide: AuthService, useValue: authSpy }
      ]
    });
  });

  // Helper to get a fresh service after localStorage setup
  function getService(): SettingsService {
    return TestBed.inject(SettingsService);
  }

  it('should be created and load default settings if storage is empty', () => {
    const service = getService();
    expect(service).toBeTruthy();
    expect(service.getSettings().theme).toBe('light');
  });

  it('should load settings from localStorage', () => {
    mockLocalStorage.setItem('jobseek_user_settings', JSON.stringify({ theme: 'dark' }));
    const service = getService();
    expect(service.getSettings().theme).toBe('dark');
  });

  it('should handle corrupted local storage JSON', () => {
    mockLocalStorage.setItem('jobseek_user_settings', '{ invalid }');
    const service = getService();
    expect(service.getSettings().theme).toBe('light'); 
  });

  it('should sync with server if authenticated', () => {
    const service = getService();
    authServiceSpy.isAuthenticated.and.returnValue(true);
    const mockPrefs = { theme: 'dark', country: 'US', dateFormat: 'YYYY-MM-DD', timeFormat: '12' };
    authServiceSpy.getPreferences.and.returnValue(of(mockPrefs as any));

    service.syncWithServer();

    const current = service.getSettings();
    expect(current.theme).toBe('dark');
    expect(current.country).toBe('US');
    expect(current.dateFormat).toBe('YYYY-MM-DD');
    expect(current.clockFormat).toBe('12');
  });

  it('should format date correctly according to preference', () => {
    const service = getService();
    const testDate = new Date(2026, 3, 23); 
    
    service.updateSettings({ dateFormat: 'MM/DD/YYYY' });
    expect(service.formatDate(testDate)).toBe('04/23/2026');

    service.updateSettings({ dateFormat: 'YYYY-MM-DD' });
    expect(service.formatDate(testDate)).toBe('2026-04-23');

    service.updateSettings({ dateFormat: 'DD/MM/YYYY' });
    expect(service.formatDate(testDate)).toBe('23/04/2026');
  });

  it('should toggle dark-theme class on body', () => {
    const service = getService();
    service.setTheme('dark');
    expect(document.body.classList.contains('dark-theme')).toBeTrue();

    service.setTheme('light');
    expect(document.body.classList.contains('dark-theme')).toBeFalse();
  });
});
