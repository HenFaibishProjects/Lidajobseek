import { Component, OnInit, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService, UserSettings } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import countriesData from '../../../assets/countries.json';
import { getCountryByPhone, CountryPhoneInfo } from '../../utils/phone-utils';

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
  initialSettings!: string; // Used for deep change detection
  currentUser: any = null;
  countryOptions: string[] = [];
  countrySearch = '';
  showCountryDropdown = false;
  detectedCountry: CountryPhoneInfo | null = null;

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService,
    private confirmService: ConfirmService,
    private router: Router,
    private toast: ToastService,
    private el: ElementRef
  ) {}

  onPanelClick(event: MouseEvent) {
    // Prevent the panel click from reaching the overlay (which would close the whole panel)
    event.stopPropagation();

    // Handle closing the country dropdown if clicking outside of it
    const dropdownContainer = this.el.nativeElement.querySelector('.country-dropdown-container');
    if (this.showCountryDropdown && dropdownContainer && !dropdownContainer.contains(event.target)) {
      this.showCountryDropdown = false;
    }
  }

  ngOnInit() {
    this.settings = JSON.parse(JSON.stringify(this.settingsService.getSettings()));
    this.initialSettings = JSON.stringify(this.settings); // Capture baseline for change detection

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

    // Initial detection if phone exists
    if (this.settings.profile?.phoneNumber) {
      this.detectedCountry = getCountryByPhone(this.settings.profile.phoneNumber);
    }
  }

  saveSettings() {
    if (!this.isFormValid()) {
      this.toast.show('Please fix the errors before saving', 'error');
      return;
    }
    this.settingsService.updateSettings(this.settings);
    this.toast.show('Settings saved successfully', 'success');
    this.closePanel();
  }

  isFormValid(): boolean {
    const phonePattern = /^[\+]?[0-9\-\s]*$/;
    if (this.settings.profile?.phoneNumber && !phonePattern.test(this.settings.profile.phoneNumber)) {
      return false;
    }
    return true;
  }

  hasChanges(): boolean {
    return this.initialSettings !== JSON.stringify(this.settings);
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
    if (this.showCountryDropdown) {
      this.countrySearch = ''; // Clear search when opening
    }
  }

  selectCountry(country: string) {
    this.settings.country = country;
    this.countrySearch = country;
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
    
    // Sanitize phone number to allow only numbers, +, -, and spaces
    if (key === 'phoneNumber') {
      const sanitized = value.replace(/[^0-9+\-\s]/g, '');
      if (this.settings.profile) {
        this.settings.profile.phoneNumber = sanitized;
      }
      this.detectedCountry = getCountryByPhone(sanitized);
    } else {
      this.settings.profile[key] = value;
    }
  }

  onPhoneKeydown(event: KeyboardEvent) {
    const allowedKeys = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 
      '+', '-', ' ', 
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'Home', 'End'
    ];
    
    // Allow Ctrl+A, Ctrl+C, Ctrl+V, etc.
    if (event.ctrlKey || event.metaKey) return;

    if (!allowedKeys.includes(event.key)) {
      event.preventDefault();
    }
  }

  async resetSettings() {
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to reset all settings to default?',
      'Reset settings'
    );

    if (confirmed) {
      this.settingsService.resetSettings();
      this.toast.show('Settings reset to defaults', 'info');
      // Update local settings after reset
      this.settings = JSON.parse(JSON.stringify(this.settingsService.getSettings()));
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
    if (this.showCountryDropdown) {
      this.showCountryDropdown = false;
    }
  }
}
