import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService, DateFormatPreference, TimeFormatPreference, ThemePreference } from './auth.service';

export interface UserSettings {
  theme: ThemePreference;
  clockFormat: TimeFormatPreference;
  dateFormat: DateFormatPreference;
  country: string;
  avatarStyle: string;
  profile?: {
    displayName: string;
    contactEmail: string;
    phoneNumber: string;
  };
  notifications: {
    email: boolean;
    desktop: boolean;
    followUps: boolean;
    interviews: boolean;
  };
  dashboard: {
    showStats: boolean;
    showTasks: boolean;
    defaultView: 'grid' | 'list';
  };
  hasSeenOnboarding: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  clockFormat: '24',
  dateFormat: 'DD/MM/YYYY',
  country: 'United States',
  avatarStyle: 'avataaars',
  profile: {
    displayName: '',
    contactEmail: '',
    phoneNumber: '',
  },
  notifications: {
    email: true,
    desktop: true,
    followUps: true,
    interviews: true
  },
  dashboard: {
    showStats: true,
    showTasks: true,
    defaultView: 'grid'
  },
  hasSeenOnboarding: true
};

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'jobseek_user_settings';
  private settingsSubject = new BehaviorSubject<UserSettings>(this.loadSettings());

  settings$ = this.settingsSubject.asObservable();

  constructor(private authService: AuthService) {
    // Apply theme on initialization
    this.applyTheme(this.settingsSubject.value.theme);
    this.hydrateFromStoredUser();
    this.syncWithServer();
  }

  syncWithServer() {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.authService.getPreferences().subscribe({
      next: (prefs) => {
        const merged = {
          ...this.settingsSubject.value,
          theme: prefs.theme,
          country: prefs.country,
          dateFormat: prefs.dateFormat,
          clockFormat: prefs.timeFormat,
          avatarStyle: prefs.avatarStyle || 'avataaars',
          hasSeenOnboarding: prefs.hasSeenOnboarding ?? this.settingsSubject.value.hasSeenOnboarding,
        } as UserSettings;

        this.settingsSubject.next(merged);
        this.saveSettings(merged);
        this.applyTheme(merged.theme);
      },
      error: () => {
        // keep local settings fallback
      },
    });
  }

  getSettings(): UserSettings {
    return this.settingsSubject.value;
  }

  updateSettings(settings: Partial<UserSettings>) {
    const currentSettings = this.settingsSubject.value;
    const newSettings = { ...currentSettings, ...settings };

    // If theme changed, apply it
    if (settings.theme && settings.theme !== currentSettings.theme) {
      this.applyTheme(settings.theme);
    }

    this.settingsSubject.next(newSettings);
    this.saveSettings(newSettings);

    if (this.authService.isAuthenticated()) {
      this.authService.updatePreferences({
        theme: newSettings.theme,
        country: newSettings.country,
        dateFormat: newSettings.dateFormat,
        timeFormat: newSettings.clockFormat,
        avatarStyle: newSettings.avatarStyle,
        hasSeenOnboarding: newSettings.hasSeenOnboarding,
      }).subscribe({
        error: () => {
          // local settings are already saved, avoid breaking UX
        }
      });
    }
  }

  updateNotificationSetting(key: keyof UserSettings['notifications'], value: boolean) {
    const currentSettings = this.getSettings();
    this.updateSettings({
      notifications: {
        ...currentSettings.notifications,
        [key]: value
      }
    });
  }

  updateDashboardSetting(key: keyof UserSettings['dashboard'], value: any) {
    const currentSettings = this.getSettings();
    this.updateSettings({
      dashboard: {
        ...currentSettings.dashboard,
        [key]: value
      }
    });
  }

  setTheme(theme: ThemePreference) {
    this.updateSettings({ theme });
  }

  setClockFormat(format: TimeFormatPreference) {
    this.updateSettings({ clockFormat: format });
  }

  setDateFormat(format: DateFormatPreference) {
    this.updateSettings({ dateFormat: format });
  }

  resetSettings() {
    this.updateSettings(DEFAULT_SETTINGS);
  }

  hydrateFromStoredUser() {
    const user = this.authService.getUser();
    if (!user) {
      return;
    }

    const patch: Partial<UserSettings> = {};

    if (user.themePreference) {
      patch.theme = user.themePreference as ThemePreference;
    }

    if (typeof user.countryPreference === 'string') {
      patch.country = user.countryPreference;
    }

    if (user.dateFormatPreference) {
      patch.dateFormat = user.dateFormatPreference as DateFormatPreference;
    }

    if (user.timeFormatPreference) {
      patch.clockFormat = user.timeFormatPreference as TimeFormatPreference;
    }

    if (user.avatarStylePreference) {
      patch.avatarStyle = user.avatarStylePreference;
    }

    if (user.hasSeenOnboarding !== undefined) {
      patch.hasSeenOnboarding = user.hasSeenOnboarding;
    }

    const existingProfile = this.settingsSubject.value.profile;
    const displayName = (user.name || existingProfile?.displayName || '').trim();
    const contactEmail = (user.email || existingProfile?.contactEmail || '').trim();

    patch.profile = {
      displayName,
      contactEmail,
      phoneNumber: user.phone || existingProfile?.phoneNumber || '',
    };

    if (Object.keys(patch).length === 0) {
      return;
    }

    const merged = { ...this.settingsSubject.value, ...patch };
    this.settingsSubject.next(merged);
    this.saveSettings(merged);
    this.applyTheme(merged.theme);
  }

  private loadSettings(): UserSettings {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch (e) {
        console.error('Failed to parse settings', e);
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  private saveSettings(settings: UserSettings) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
  }

  private applyTheme(theme: ThemePreference) {
    const body = document.body;

    if (theme === 'auto') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.toggle('dark-theme', prefersDark);
    } else {
      body.classList.toggle('dark-theme', theme === 'dark');
    }
  }

  // Format time based on user preference
  formatTime(date: Date): string {
    const settings = this.getSettings();
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.clockFormat === '12'
    });
  }

  // Format date based on user preference
  formatDate(date: Date): string {
    const settings = this.getSettings();
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    switch (settings.dateFormat) {
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      default:
        return `${day}/${month}/${year}`;
    }
  }
}
