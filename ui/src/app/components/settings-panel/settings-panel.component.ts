import { Component, OnInit, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService, UserSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../services/confirm.service';
import countriesData from '../../../assets/countries.json';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.css']
})
export class SettingsPanelComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  settings!: UserSettings;
  currentUser: any = null;
  countryOptions: string[] = [];
  countrySearch = '';
  showCountryDropdown = false;

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService,
    private confirmService: ConfirmService,
    private router: Router
  ) {}

  ngOnInit() {
    this.settings = JSON.parse(JSON.stringify(this.settingsService.getSettings()));

    this.countryOptions = Object.keys(countriesData).sort();
    this.countrySearch = this.settings.country;

    // Get current user info from localStorage
    const userStr = localStorage.getItem('app_user');
    if (userStr) {
      try {
        this.currentUser = JSON.parse(userStr);
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }

    if (!this.settings.profile) {
      this.settings.profile = {
        displayName: this.currentUser?.name || '',
        contactEmail: this.currentUser?.email || '',
        phoneNumber: '',
      };
    }
  }

  saveSettings() {
    this.settingsService.updateSettings(this.settings);
    this.closePanel();
  }

  cancelSettings() {
    this.closePanel();
  }

  onThemeChange(theme: 'light' | 'dark' | 'auto') {
    this.settings.theme = theme as any;
  }

  onClockFormatChange(format: '12' | '24') {
    this.settings.clockFormat = format as any;
  }

  onDateFormatChange(format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD') {
    this.settings.dateFormat = format as any;
  }

  onCountryChange(country: string) {
    this.settings.country = country;
  }

  get filteredCountryOptions(): string[] {
    const term = this.countrySearch.trim().toLowerCase();
    if (!term) {
      return this.countryOptions;
    }

    return this.countryOptions.filter(country =>
      country.toLowerCase().includes(term)
    );
  }

  onCountrySearchChange() {
    this.showCountryDropdown = true;
  }

  toggleCountryDropdown() {
    this.showCountryDropdown = !this.showCountryDropdown;
  }

  selectCountry(country: string) {
    this.countrySearch = country;
    this.onCountryChange(country);
    this.showCountryDropdown = false;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && this.showCountryDropdown && this.countrySearch.trim()) {
      const match = this.countryOptions.find(country =>
        country.toLowerCase() === this.countrySearch.trim().toLowerCase()
      );
      this.selectCountry(match ?? this.countrySearch.trim());
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.country-combobox')) {
      this.showCountryDropdown = false;
    }
  }

  onNotificationChange(key: keyof UserSettings['notifications'], value: boolean) {
    (this.settings.notifications as any)[key] = value;
  }

  onDashboardChange(key: keyof UserSettings['dashboard'], value: any) {
    (this.settings.dashboard as any)[key] = value;
  }

  onProfileChange(key: keyof NonNullable<UserSettings['profile']>, value: string) {
    if (!this.settings.profile) {
      this.settings.profile = { displayName: '', contactEmail: '', phoneNumber: '' };
    }
    this.settings.profile[key] = value;
  }

  async resetSettings() {
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to reset all settings to default?',
      'Reset settings'
    );

    if (confirmed) {
      this.settingsService.resetSettings();
    }
  }

  logout() {
    if (confirm('Are you sure you want to logout?')) {
      this.authService.logout();
      this.router.navigate(['/login']);
      this.close.emit();
    }
  }

  closePanel() {
    this.close.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    this.closePanel();
  }
}
