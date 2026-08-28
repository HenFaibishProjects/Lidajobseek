import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
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
import Chart from 'chart.js/auto';



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
    
    // Stub chart initialization by default to prevent hangs
    spyOn(component as any, 'initDashCharts').and.stub();
    
    fixture.detectChanges();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should create unique CSS classes for the two interview waiting stages', () => {
    expect(component.getStatusClass('Waiting for Interview Feedback')).toBe(
      'status-waiting-for-interview-feedback'
    );
    expect(component.getStatusClass('Awaiting Next Interview')).toBe(
      'status-awaiting-next-interview'
    );
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
    const name = (component as any).getDisplayName(emptySettings);
    expect(name).toBe('shepard'); 
  });

  it('should calculate KPI metrics correctly from processes', () => {
    const mockProcesses = [
      { id: '1', currentStage: 'Initial Call Scheduled', createdAt: new Date() },
      { id: '2', currentStage: 'Waiting for Interview Feedback', createdAt: new Date() },
      { id: '3', currentStage: 'Home Task Assigned', createdAt: new Date() },
      { id: '4', currentStage: 'References Requested', createdAt: new Date() }
    ];
    component.processes = mockProcesses;
    component.kpiTimeRange = 'all';

    expect(component.kpiProcesses.length).toBe(4);
    expect(component.getInterviewActiveCount()).toBe(2); 
    expect(component.getHomeTaskCount()).toBe(1);
    expect(component.getReferencesCount()).toBe(1); 
  });

  it('should filter KPIs based on time range', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    
    const mockProcesses = [
      { id: '1', currentStage: 'Waiting for Interview Feedback', createdAt: new Date() }, 
      { id: '2', currentStage: 'Waiting for Interview Feedback', createdAt: oldDate }     
    ];
    component.processes = mockProcesses;
    
    component.kpiTimeRange = 'year';
    expect(component.kpiProcesses.length).toBe(1);
    expect(component.getInterviewActiveCount()).toBe(1);

    component.kpiTimeRange = 'all';
    expect(component.kpiProcesses.length).toBe(2);
    expect(component.getInterviewActiveCount()).toBe(2);
  });

  it('should handle zero processes gracefully in KPIs', () => {
    component.processes = [];
    component.kpiTimeRange = 'all';
    
    expect(component.kpiProcesses.length).toBe(0);
    expect(component.getInterviewActiveCount()).toBe(0);
    expect(component.getHomeTaskCount()).toBe(0);
    expect(component.getReferencesCount()).toBe(0);
  });

  it('should not crash if a process has a missing createdAt date', () => {
    component.processes = [{ id: '1', currentStage: 'Waiting for Interview Feedback', createdAt: null as any }];
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

  // Commented out: .callThrough() triggers real Chart.js canvas rendering,
  // creating animation frames that accumulate and hang the headless browser.
  // it('should initialize charts when loading completes and view is ready', () => {
  //   component.timelineRef = new ElementRef(document.createElement('canvas'));
  //   component.stageRef = new ElementRef(document.createElement('canvas'));
  //   ((component as any).initDashCharts as jasmine.Spy).and.callThrough();
  //   component.isLoading = false;
  //   component.processes = [{ id: '1' }];
  //   (component as any).dashCharts = {};
  //   component.ngAfterViewChecked();
  //   expect((component as any).initDashCharts).toHaveBeenCalled();
  // });

  it('should not re-initialize charts if already built', () => {
    component.isLoading = false;
    component.processes = [{ id: '1' }];
    (component as any).dashCharts = { timeline: {} }; 
    
    component.ngAfterViewChecked();
    
    expect((component as any).initDashCharts).not.toHaveBeenCalled();
  });
});
