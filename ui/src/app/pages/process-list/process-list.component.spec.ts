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

import { LucideAngularModule, Plus, Search, Filter, Grid, List, Download, Upload, RefreshCw, Trash2, Edit, Eye, MoreVertical, Info, LayoutGrid } from 'lucide-angular';

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

  beforeEach(fakeAsync(() => {
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

    TestBed.configureTestingModule({
      imports: [
        ProcessListComponent, 
        HttpClientTestingModule, 
        FormsModule, 
        RouterTestingModule,
        LucideAngularModule.pick({ Plus, Search, Filter, Grid, List, Download, Upload, RefreshCw, Trash2, Edit, Eye, MoreVertical, Info, LayoutGrid })
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
    tick(); // Handle setTimeout in ngOnInit
  }));

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

  it('should calculate KPI metrics correctly from processes', () => {
    const mockProcesses = [
      { id: '1', currentStage: 'Rejected', createdAt: new Date() },
      { id: '2', currentStage: 'Offer Received', createdAt: new Date() },
      { id: '3', currentStage: 'Technical Interview', createdAt: new Date() },
      { id: '4', currentStage: 'Application Submitted', createdAt: new Date() }
    ];
    component.processes = mockProcesses;
    component.kpiTimeRange = 'all';

    expect(component.kpiProcesses.length).toBe(4);
    expect(component.getRejectionRate()).toBe(25); // 1/4
    expect(component.getOfferCount()).toBe(1);
    expect(component.getInterviewCount()).toBe(1); // Technical Interview is an interview, Offer Received is not
  });

  it('should filter KPIs based on time range', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    
    const mockProcesses = [
      { id: '1', currentStage: 'Rejected', createdAt: new Date() }, // Today
      { id: '2', currentStage: 'Rejected', createdAt: oldDate }     // 2 years ago
    ];
    component.processes = mockProcesses;
    
    component.kpiTimeRange = 'year';
    expect(component.kpiProcesses.length).toBe(1);
    expect(component.getRejectionRate()).toBe(100);

    component.kpiTimeRange = 'all';
    expect(component.kpiProcesses.length).toBe(2);
    expect(component.getRejectionRate()).toBe(100);
  });

  it('should handle zero processes gracefully in KPIs', () => {
    component.processes = [];
    component.kpiTimeRange = 'all';
    
    expect(component.kpiProcesses.length).toBe(0);
    expect(component.getRejectionRate()).toBe(0);
    expect(component.getOfferCount()).toBe(0);
    expect(component.getInterviewCount()).toBe(0);
  });

  it('should not crash if a process has a missing createdAt date', () => {
    component.processes = [{ id: '1', currentStage: 'Applied', createdAt: null as any }];
    component.kpiTimeRange = 'week';
    
    expect(() => component.kpiProcesses).not.toThrow();
    expect(component.kpiProcesses.length).toBe(0);
  });

  it('should provide correct timeline subtitles', () => {
    component.kpiTimeRange = 'week';
    expect(component.getTimelineSubtitle()).toContain('Last 7 days');
    
    component.kpiTimeRange = 'year';
    expect(component.getTimelineSubtitle()).toContain('Last 12 months');
  });

  it('should initialize charts when loading completes and view is ready', () => {
    // Mock ElementRefs with real canvas elements for Chart.js
    component.timelineRef = { nativeElement: document.createElement('canvas') } as any;
    component.stageRef = { nativeElement: document.createElement('canvas') } as any;
    
    // Spy on initDashCharts (private, so cast to any)
    spyOn(component as any, 'initDashCharts').and.callThrough();
    
    // Set state
    component.isLoading = false;
    component.processes = [{ id: '1' }];
    (component as any).dashCharts = {};
    
    // Call hook
    component.ngAfterViewChecked();
    
    expect((component as any).initDashCharts).toHaveBeenCalled();
  });

  it('should not re-initialize charts if already built', () => {
    spyOn(component as any, 'initDashCharts');
    component.isLoading = false;
    component.processes = [{ id: '1' }];
    (component as any).dashCharts = { timeline: {} }; // simulate already built
    
    component.ngAfterViewChecked();
    
    expect((component as any).initDashCharts).not.toHaveBeenCalled();
  });
});
