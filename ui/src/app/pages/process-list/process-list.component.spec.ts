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

  it('should create unique CSS classes for interview waiting stages', () => {
    expect(component.getStatusClass('Waiting for Interview Feedback')).toBe(
      'status-waiting-for-interview-feedback'
    );
    expect(component.getStatusClass('Awaiting Next Interview')).toBe(
      'status-awaiting-next-interview'
    );
    expect(component.getStatusClass('Awaiting New Interview Date')).toBe(
      'status-awaiting-new-interview-date'
    );
  });

  it('should use compact stage labels in the process table', () => {
    expect(component.getCompactStageLabel('Waiting for Interview Feedback')).toBe('Waiting for Feedback');
    expect(component.getCompactStageLabel('Awaiting New Interview Date')).toBe('Awaiting New Date');
    expect(component.getCompactStageLabel('Awaiting Next Interview')).toBe('Awaiting Next Interview');
  });

  it('should hide only rejected and withdrawn processes by default', () => {
    component.processes = [
      { id: 1, currentStage: 'Waiting for Interview Feedback' },
      { id: 2, currentStage: 'Rejected', isClosed: true },
      { id: 3, currentStage: 'Withdrawn', isClosed: true },
      { id: 4, currentStage: 'Offer Declined', isClosed: true },
    ];

    component.showAllProcesses = false;
    component.applyFilters();

    expect(component.filteredProcesses.map((process) => process.id)).toEqual([
      1,
      4,
    ]);
  });

  it('should include rejected and withdrawn processes when Show all is checked', () => {
    component.processes = [
      { id: 1, currentStage: 'Waiting for Interview Feedback' },
      { id: 2, currentStage: 'Rejected', isClosed: true },
      { id: 3, currentStage: 'Withdrawn', isClosed: true },
    ];

    component.showAllProcesses = true;
    component.applyFilters();

    expect(component.filteredProcesses.length).toBe(3);
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

  it('should sort processes by their opened date', () => {
    component.processes = [
      { id: 'later', createdAt: '2026-08-20T10:00:00Z' },
      { id: 'earlier', createdAt: '2026-08-10T10:00:00Z' },
    ];

    component.sort('created');

    expect(component.filteredProcesses.map((process) => process.id)).toEqual(['earlier', 'later']);
  });

  it('should calculate calendar days since the last update', () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    expect(component.getDaysSinceUpdate(today)).toBe(0);
    expect(component.getDaysSinceUpdate(yesterday)).toBe(1);
    expect(component.getDaysSinceUpdateLabel(yesterday)).toBe('1 day');
    expect(component.getDaysSinceUpdateLabel(today)).toBe('0 days');
    expect(component.getDaysSinceUpdate('invalid-date')).toBeNull();
  });

  it('should mark a process with a future interview as scheduled regardless of update age', () => {
    const oldUpdate = new Date();
    oldUpdate.setDate(oldUpdate.getDate() - 14);
    const futureInterview = new Date();
    futureInterview.setDate(futureInterview.getDate() + 7);

    const process = {
      currentStage: 'Awaiting Next Interview',
      updatedAt: oldUpdate,
      interactions: [{ date: futureInterview }],
    };

    expect(component.getFollowUpState(process)).toBe('scheduled');
    expect(component.getFollowUpBadgeTitle(process)).toContain('No follow-up needed');
  });

  it('should flag interview feedback after seven days', () => {
    const warningUpdate = new Date();
    warningUpdate.setDate(warningUpdate.getDate() - 4);
    const overdueUpdate = new Date();
    overdueUpdate.setDate(overdueUpdate.getDate() - 7);

    expect(component.getFollowUpState({
      currentStage: 'Waiting for Interview Feedback',
      updatedAt: warningUpdate,
    })).toBe('warning');
    expect(component.getFollowUpState({
      currentStage: 'Waiting for Interview Feedback',
      updatedAt: overdueUpdate,
    })).toBe('overdue');
  });

  it('should flag waiting for a new interview date using the same thresholds', () => {
    const overdueUpdate = new Date();
    overdueUpdate.setDate(overdueUpdate.getDate() - 7);

    expect(component.getFollowUpState({
      currentStage: 'Awaiting New Interview Date',
      updatedAt: overdueUpdate,
    })).toBe('overdue');
  });

  it('should sort processes by days since their last update', () => {
    const recentUpdate = new Date();
    const oldUpdate = new Date();
    oldUpdate.setDate(oldUpdate.getDate() - 8);
    component.processes = [
      { id: 'old', updatedAt: oldUpdate },
      { id: 'recent', updatedAt: recentUpdate },
    ];

    component.sort('age');

    expect(component.filteredProcesses.map((process) => process.id)).toEqual(['recent', 'old']);
  });

  it('should format company and role for chart tooltips', () => {
    expect((component as any).formatProcessTooltipLabel({
      companyName: 'Acme',
      roleTitle: 'Backend Engineer',
    })).toBe('Acme · Backend Engineer');

    expect((component as any).formatProcessTooltipLabel({ companyName: 'Acme' })).toBe('Acme');
  });

  it('should calculate the four KPI cards for all time', () => {
    const mockProcesses = [
      { id: '1', currentStage: 'Initial Call Scheduled', createdAt: new Date() },
      { id: '2', currentStage: 'Rejected', createdAt: new Date(), isClosed: false },
      { id: '3', currentStage: 'Withdrawn', createdAt: new Date() },
      { id: '4', currentStage: 'Waiting for Interview Feedback', createdAt: new Date() },
    ];
    component.processes = mockProcesses;
    component.kpiTimeRange = 'all';

    expect(component.kpiProcesses.length).toBe(4);
    expect(component.getInProgressCount()).toBe(2);
    expect(component.getRejectedCount()).toBe(1);
    expect(component.getWithdrawnCount()).toBe(1);
  });

  it('should keep status cards all-time while the activity range changes', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    
    const mockProcesses = [
      { id: '1', currentStage: 'Waiting for Interview Feedback', createdAt: new Date() },
      { id: '2', currentStage: 'Rejected', createdAt: new Date() },
      { id: '3', currentStage: 'Withdrawn', createdAt: new Date() },
      { id: '4', currentStage: 'Waiting for Interview Feedback', createdAt: oldDate },
    ];
    component.processes = mockProcesses;
    
    component.kpiTimeRange = 'year';
    expect(component.kpiProcesses.length).toBe(3);
    expect(component.getInProgressCount()).toBe(2);
    expect(component.getRejectedCount()).toBe(1);
    expect(component.getWithdrawnCount()).toBe(1);

    component.kpiTimeRange = 'all';
    expect(component.kpiProcesses.length).toBe(4);
    expect(component.getInProgressCount()).toBe(2);
  });

  it('should count complete calendar days in the selected activity range', () => {
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - 13);

    const justBeforeRange = new Date(rangeStart);
    justBeforeRange.setMilliseconds(-1);

    component.processes = [
      { id: '1', currentStage: 'Initial Call Scheduled', createdAt: new Date() },
      { id: '2', currentStage: 'Initial Call Scheduled', createdAt: rangeStart },
      { id: '3', currentStage: 'Initial Call Scheduled', createdAt: justBeforeRange },
    ];
    component.kpiTimeRange = '2weeks';

    expect(component.kpiProcesses.map((process) => process.id)).toEqual(['1', '2']);
  });

  it('should handle zero processes gracefully in KPIs', () => {
    component.processes = [];
    component.kpiTimeRange = 'all';
    
    expect(component.kpiProcesses.length).toBe(0);
    expect(component.getInProgressCount()).toBe(0);
    expect(component.getRejectedCount()).toBe(0);
    expect(component.getWithdrawnCount()).toBe(0);
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

  it('should clearly describe the selected KPI period', () => {
    component.kpiTimeRange = 'week';
    expect(component.getKpiPeriodLabel()).toBe('Last 7 days');

    component.kpiTimeRange = '3weeks';
    expect(component.getKpiPeriodLabel()).toBe('Last 21 days');

    component.kpiTimeRange = 'all';
    expect(component.getKpiPeriodLabel()).toBe('All time');
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
