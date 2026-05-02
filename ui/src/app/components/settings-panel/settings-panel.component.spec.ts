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
import { ProcessesService } from '../../services/processes.service';

describe('SettingsPanelComponent', () => {
  let component: SettingsPanelComponent;
  let fixture: ComponentFixture<SettingsPanelComponent>;
  let settingsServiceMock: any;
  let authServiceMock: any;
  let confirmServiceMock: any;
  let toastServiceMock: any;
  let routerMock: any;
  let processesServiceMock: any;

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
        },
        avatarStyle: 'avataaars'
      }),
      updateSettings: jasmine.createSpy('updateSettings'),
      resetSettings: jasmine.createSpy('resetSettings')
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

    processesServiceMock = {
      exportData: jasmine.createSpy('exportData'),
      importData: jasmine.createSpy('importData').and.returnValue(of(true))
    };

    await TestBed.configureTestingModule({
      imports: [SettingsPanelComponent, FormsModule, CommonModule],
      providers: [
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: ProcessesService, useValue: processesServiceMock }
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
    expect(settingsServiceMock.resetSettings).toHaveBeenCalled();
    expect(settingsServiceMock.updateSettings).not.toHaveBeenCalled(); // reset uses its own method
    expect(toastServiceMock.show).toHaveBeenCalledWith(jasmine.any(String), 'info');
  });

  it('should close country dropdown on selection', () => {
    component.showCountryDropdown = true;
    component.selectCountry('Canada');
    expect(component.settings.country).toBe('Canada');
    expect(component.showCountryDropdown).toBeFalse();
  });

  describe('Avatar Features', () => {
    it('should initialize with default avatar style', () => {
      expect(component.settings.avatarStyle).toBe('avataaars');
    });

    it('should toggle avatar dropdown visibility', () => {
      expect(component.isAvatarDropdownOpen).toBeFalse();
      component.toggleAvatarDropdown();
      expect(component.isAvatarDropdownOpen).toBeTrue();
      component.toggleAvatarDropdown();
      expect(component.isAvatarDropdownOpen).toBeFalse();
    });

    it('should update avatar style and close dropdown when a style is selected', () => {
      component.isAvatarDropdownOpen = true;
      component.selectAvatarStyle('bottts');
      expect(component.settings.avatarStyle).toBe('bottts');
      expect(component.isAvatarDropdownOpen).toBeFalse();
    });

    it('should generate correct DiceBear URL based on email and style', () => {
      component.settings.profile!.contactEmail = 'john@example.com';
      component.settings.avatarStyle = 'pixel-art';
      const url = component.getAvatarUrl();
      expect(url).toContain('7.x/pixel-art/svg');
      expect(url).toContain('seed=john%40example.com');
    });

    it('should use style overwrite in getAvatarUrl when provided', () => {
      component.settings.profile!.contactEmail = 'john@example.com';
      component.settings.avatarStyle = 'avataaars';
      const url = component.getAvatarUrl('big-ears');
      expect(url).toContain('7.x/big-ears/svg');
    });

    it('should return correct info for selected avatar style', () => {
      component.settings.avatarStyle = 'pixel-art';
      const style = component.getSelectedAvatarStyle();
      expect(style?.id).toBe('pixel-art');
      expect(style?.name).toBe('Pixel Art');
    });
  });

  describe('Data Management', () => {
    it('should call exportData when export is triggered', () => {
      component.exportData();
      expect(processesServiceMock.exportData).toHaveBeenCalled();
    });

    it('should trigger file input click for import', () => {
      const mockInput = { click: jasmine.createSpy('click') };
      spyOn(document, 'getElementById').and.returnValue(mockInput as any);
      
      component.triggerImport();
      expect(mockInput.click).toHaveBeenCalled();
    });

    it('should call importData when file is selected', () => {
      const mockFile = new File(['{}'], 'test.json', { type: 'application/json' });
      const mockEvent = { target: { files: [mockFile] } };
      
      component.onFileSelected(mockEvent as any);
      expect(processesServiceMock.importData).toHaveBeenCalledWith(mockFile);
      expect(toastServiceMock.show).toHaveBeenCalledWith(jasmine.any(String), 'success');
    });
  });
});
