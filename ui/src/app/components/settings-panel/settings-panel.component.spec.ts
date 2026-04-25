import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsPanelComponent } from './settings-panel.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../services/confirm.service';
import { Router } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { of } from 'rxjs';

describe('SettingsPanelComponent', () => {
  let component: SettingsPanelComponent;
  let fixture: ComponentFixture<SettingsPanelComponent>;
  let settingsServiceMock: any;
  let authServiceMock: any;
  let confirmServiceMock: any;
  let toastServiceMock: any;
  let routerMock: any;

  beforeEach(async () => {
    settingsServiceMock = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue({
        theme: 'light',
        language: 'en',
        country: 'United States',
        clockFormat: '12',
        dateFormat: 'MM/DD/YYYY',
        notifications: {
          email: true,
          push: true,
          reminders: true
        },
        dashboard: {
          showStats: true,
          compactMode: false
        },
        profile: {
          displayName: 'Test User',
          contactEmail: 'test@example.com',
          phoneNumber: '+11234567890'
        }
      }),
      updateSettings: jasmine.createSpy('updateSettings')
    };

    authServiceMock = {
      logout: jasmine.createSpy('logout')
    };

    confirmServiceMock = {
      confirm: jasmine.createSpy('confirm').and.returnValue(Promise.resolve(true))
    };

    toastServiceMock = {
      show: jasmine.createSpy('show')
    };

    routerMock = {
      navigate: jasmine.createSpy('navigate')
    };

    await TestBed.configureTestingModule({
      imports: [SettingsPanelComponent, FormsModule, CommonModule],
      providers: [
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with settings from service', () => {
    expect(settingsServiceMock.getSettings).toHaveBeenCalled();
    expect(component.settings.theme).toBe('light');
    expect(component.settings.profile?.displayName).toBe('Test User');
  });

  it('should sanitize phone number input', () => {
    component.onProfileChange('phoneNumber', '123-abc-456');
    expect(component.settings.profile?.phoneNumber).toBe('123--456');
    
    component.onProfileChange('phoneNumber', '+1 (555) 000-1234');
    expect(component.settings.profile?.phoneNumber).toBe('+1 555 000-1234');
  });

  it('should detect country from phone number', () => {
    component.onProfileChange('phoneNumber', '+44');
    expect(component.detectedCountry?.name).toBe('United Kingdom');
    expect(component.detectedCountry?.flag).toBe('🇬🇧');

    component.onProfileChange('phoneNumber', '+972');
    expect(component.detectedCountry?.name).toBe('Israel');
  });

  it('should track changes correctly', () => {
    expect(component.hasChanges()).toBeFalse();
    
    component.settings.theme = 'dark';
    expect(component.hasChanges()).toBeTrue();
    
    component.settings.theme = 'light';
    expect(component.hasChanges()).toBeFalse();
  });

  it('should validate phone number format', () => {
    component.settings.profile!.phoneNumber = '+12345';
    expect(component.isFormValid()).toBeTrue();

    component.settings.profile!.phoneNumber = 'invalid';
    expect(component.isFormValid()).toBeFalse();
  });

  it('should call updateSettings and show success toast on save', () => {
    component.settings.theme = 'dark'; // ensure hasChanges is true
    component.saveSettings();
    expect(settingsServiceMock.updateSettings).toHaveBeenCalledWith(component.settings);
    expect(toastServiceMock.show).toHaveBeenCalledWith(jasmine.any(String), 'success');
  });

  it('should reset settings when confirmed', async () => {
    await component.resetSettings();
    expect(confirmServiceMock.confirm).toHaveBeenCalled();
    expect(settingsServiceMock.updateSettings).not.toHaveBeenCalled(); // reset uses its own method
    expect(toastServiceMock.show).toHaveBeenCalledWith(jasmine.any(String), 'info');
  });

  it('should close country dropdown on selection', () => {
    component.showCountryDropdown = true;
    component.selectCountry('Canada');
    expect(component.settings.country).toBe('Canada');
    expect(component.showCountryDropdown).toBeFalse();
  });
});
