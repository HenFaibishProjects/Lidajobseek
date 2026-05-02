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
import { ProcessesService } from '../../services/processes.service';

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
  
  // NEW: State for the Avatar Dropdown
  isAvatarDropdownOpen: boolean = false;
  
  // FIXED: Removed "const" here, class properties don't use const
  avatarStyles = [
    { id: 'avataaars', name: 'Illustration', icon: '👤' },
    { id: 'bottts', name: 'Robots', icon: '🤖' },
    { id: 'pixel-art', name: 'Pixel Art', icon: '👾' },
    { id: 'adventurer', name: 'Adventurer', icon: '🧗' },
    { id: 'big-ears', name: 'Minimalist', icon: '👂' },
    { id: 'notionists', name: 'Notionist', icon: '🎨' },
    { id: 'lorelei', name: 'Lorelei', icon: '🌸' },
    { id: 'micah', name: 'Micah', icon: '😎' },
    { id: 'open-peeps', name: 'Modern Peeps', icon: '🧍' },
    { id: 'personas', name: 'Personas', icon: '🧑‍🎤' },
    { id: 'miniavs', name: 'Miniavs', icon: '🤏' },
    { id: 'fun-emoji', name: 'Fun Emoji', icon: '🤪' },
    { id: 'croodles', name: 'Doodles', icon: '✏️' },
    { id: 'identicon', name: 'Identicon', icon: '🔣' },
    { id: 'initials', name: 'Initials', icon: '🔠' },
    { id: 'shapes', name: 'Geometry', icon: '🔺' },
    { id: 'rings', name: 'Rings', icon: '⭕' },
    { id: 'thumbs', name: 'Thumbs', icon: '👍' }
  ];

  countryOptions: string[] = [];
  countrySearch = '';
  showCountryDropdown = false;
  detectedCountry: CountryPhoneInfo | null = null;
  isPhoneAmbiguous = false; // True if code matches multiple countries (+1, etc)

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService,
    private confirmService: ConfirmService,
    private router: Router,
    private toast: ToastService,
    private el: ElementRef,
    private processesService: ProcessesService
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
    this.detectCountryFromPhone();
  }

  private detectCountryFromPhone() {
    if (this.settings.profile?.phoneNumber) {
      const result = getCountryByPhone(this.settings.profile.phoneNumber, this.settings.country);
      this.detectedCountry = result.country;
      this.isPhoneAmbiguous = result.isAmbiguous;
    } else {
      this.detectedCountry = null;
      this.isPhoneAmbiguous = false;
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

  // --- NEW: AVATAR DROPDOWN METHODS ---
  toggleAvatarDropdown() {
    this.isAvatarDropdownOpen = !this.isAvatarDropdownOpen;
  }

  getSelectedAvatarStyle() {
    return this.avatarStyles.find(style => style.id === this.settings.avatarStyle);
  }

  selectAvatarStyle(styleId: string) {
    this.settings.avatarStyle = styleId;
    this.isAvatarDropdownOpen = false; // Close it after selection
  }

  getAvatarUrl(styleOverwrite?: string): string {
    const seed = this.settings.profile?.contactEmail || this.currentUser?.email || 'default';
    const style = styleOverwrite || this.settings.avatarStyle || 'avataaars';
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
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
    this.detectCountryFromPhone();
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

  // NEW: Updated Click listener to close BOTH dropdowns if you click outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    
    // Close country dropdown
    if (!target?.closest('.country-combobox')) {
      this.showCountryDropdown = false;
    }
    
    // Close avatar dropdown
    if (!target?.closest('.custom-dropdown')) { 
      this.isAvatarDropdownOpen = false;
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
      this.detectCountryFromPhone();
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
    // NEW: Allow escape key to close Avatar dropdown too
    if (this.isAvatarDropdownOpen) {
      this.isAvatarDropdownOpen = false;
    }
  }

  exportData() {
    this.processesService.exportData().subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobseek-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.show('Export successful', 'success');
      },
      error: (err) => {
        console.error('Export failed', err);
        this.toast.show('Export failed', 'error');
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const processes = JSON.parse(e.target.result);

        const mode = await this.confirmService.custom({
          title: 'Import Data',
          message: 'How would you like to import the data?',
          buttons: [
            { text: 'Append', value: 'append', class: 'btn-secondary' },
            { text: 'Overwrite', value: 'overwrite', class: 'btn-danger' },
            { text: 'Cancel', value: null, class: 'btn-secondary' }
          ]
        });

        if (!mode) return;

        this.processesService.importData(processes, mode).subscribe({
          next: () => {
            this.toast.show('Import successful', 'success');
            // Normally we'd reload data or refresh the page
            window.location.reload();
          },
          error: (err) => {
            console.error('Import failed', err);
            this.toast.show('Import failed', 'error');
          }
        });
      } catch (err) {
        console.error('Invalid file', err);
        this.toast.show('Invalid JSON file', 'error');
      }
      // Reset input
      event.target.value = '';
    };
    reader.readAsText(file);
  }
}