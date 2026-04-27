import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ProcessListComponent } from './process-list.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { ProcessesService } from '../../services/processes.service';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { of, BehaviorSubject } from 'rxjs';

describe('ProcessListComponent', () => {
  let component: ProcessListComponent;
  let fixture: ComponentFixture<ProcessListComponent>;
  let processesServiceMock: any;
  let settingsServiceMock: any;
  let authServiceMock: any;

  const mockSettings = {
    theme: 'light',
    language: 'en',
    avatarStyle: 'bottts',
    profile: {
      displayName: 'Commander Shepard',
      contactEmail: 'shepard@n7.com'
    }
  };

  const settingsSubject = new BehaviorSubject(mockSettings);

  beforeEach(async () => {
    processesServiceMock = {
      getAll: jasmine.createSpy('getAll').and.returnValue(of([])),
      exportData: jasmine.createSpy('exportData'),
      importData: jasmine.createSpy('importData')
    };

    settingsServiceMock = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(mockSettings),
      settings$: settingsSubject.asObservable()
    };

    authServiceMock = {
      getUser: jasmine.createSpy('getUser').and.returnValue({ email: 'shepard@n7.com' })
    };

    await TestBed.configureTestingModule({
      imports: [
        ProcessListComponent, 
        HttpClientTestingModule, 
        FormsModule, 
        RouterTestingModule
      ],
      providers: [
        { provide: ProcessesService, useValue: processesServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: ToastService, useValue: { show: jasmine.createSpy('show') } },
        { provide: ConfirmService, useValue: { custom: jasmine.createSpy('custom') } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProcessListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch avatar URL based on settings', () => {
    const url = component.getAvatarUrl();
    expect(url).toContain('7.x/bottts/svg');
    expect(url).toContain('seed=shepard%40n7.com');
  });

  it('should update display name when settings change', fakeAsync(() => {
    const newSettings = {
      ...mockSettings,
      profile: { ...mockSettings.profile, displayName: 'John Doe' }
    };
    settingsSubject.next(newSettings);
    tick();
    fixture.detectChanges();
    
    expect(component.userDisplayName).toBe('John Doe');
  }));

  it('should fall back to email if display name is empty', () => {
    const emptySettings = {
      ...mockSettings,
      profile: { ...mockSettings.profile, displayName: '' }
    };
    // Re-initialize for this test or mock getDisplayName
    const name = (component as any).getDisplayName(emptySettings);
    expect(name).toBe('shepard'); // derived from email in authServiceMock
  });
});
