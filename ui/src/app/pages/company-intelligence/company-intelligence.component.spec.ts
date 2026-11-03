import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CompanyIntelligenceService } from '../../services/company-intelligence.service';
import { CompanyIntelligenceComponent } from './company-intelligence.component';

describe('CompanyIntelligenceComponent', () => {
  let fixture: ComponentFixture<CompanyIntelligenceComponent>;
  let component: CompanyIntelligenceComponent;

  const service = {
    researchCompany: jasmine.createSpy('researchCompany'),
    matchJobs: jasmine.createSpy('matchJobs'),
    listHistory: jasmine.createSpy('listHistory').and.returnValue(of([])),
    getHistoryDetail: jasmine.createSpy('getHistoryDetail'),
    deleteHistory: jasmine.createSpy('deleteHistory'),
    listPendingHandoffs: jasmine
      .createSpy('listPendingHandoffs')
      .and.returnValue(of([])),
    getHandoff: jasmine.createSpy('getHandoff'),
    startHandoff: jasmine.createSpy('startHandoff'),
    cancelHandoff: jasmine.createSpy('cancelHandoff').and.returnValue(of({})),
    importHandoffResearch: jasmine.createSpy('importHandoffResearch'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyIntelligenceComponent],
      providers: [
        { provide: CompanyIntelligenceService, useValue: service },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyIntelligenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the integrated intelligence page', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab).toBe('research');
  });

  it('loads history when the history tab is opened', () => {
    component.setTab('history');
    expect(service.listHistory).toHaveBeenCalled();
  });

  it('loads the next pending handoff page with the current offset', () => {
    component.handoffs = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      companyName: 'Company',
      roleTitle: null,
      eventType: 'INTERVIEW',
      researchReason: 'Research',
      status: 'PENDING_CHATGPT' as const,
      createdAt: new Date().toISOString(),
      notificationSentAt: null,
    }));
    component.handoffOffset = 20;
    component.hasMoreHandoffs = true;

    component.loadHandoffs(false);

    expect(service.listPendingHandoffs).toHaveBeenCalledWith(20, 20);
  });

  it('hides legacy duplicate handoffs when one message only adds a role title', () => {
    component.handoffs = [
      {
        id: 'newer',
        companyName: 'WalkMe',
        roleTitle: null,
        eventType: 'INTERVIEW_INVITATION',
        researchReason: 'Screening call',
        status: 'PENDING_CHATGPT',
        createdAt: '2026-11-03T12:30:43.000Z',
        notificationSentAt: null,
      },
      {
        id: 'older-specific',
        companyName: 'WalkMe',
        roleTitle: 'Senior Software Engineer - Big Data Platform',
        eventType: 'INTERVIEW_SCHEDULING',
        researchReason: 'Active interview scheduling',
        status: 'PENDING_CHATGPT',
        createdAt: '2026-11-03T12:29:39.000Z',
        notificationSentAt: null,
      },
    ];

    expect(component.visibleHandoffs).toHaveSize(1);
    expect(component.visibleHandoffs[0].id).toBe('older-specific');
  });

  it('removes the selected pending company and compatible legacy duplicate', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.handoffs = [
      {
        id: 'generic',
        companyName: 'WalkMe',
        roleTitle: null,
        eventType: 'INTERVIEW_INVITATION',
        researchReason: 'Screening call',
        status: 'PENDING_CHATGPT',
        createdAt: '2026-11-03T12:30:43.000Z',
        notificationSentAt: null,
      },
      {
        id: 'specific',
        companyName: 'WalkMe',
        roleTitle: 'Senior Software Engineer - Big Data Platform',
        eventType: 'INTERVIEW_SCHEDULING',
        researchReason: 'Active interview scheduling',
        status: 'PENDING_CHATGPT',
        createdAt: '2026-11-03T12:29:39.000Z',
        notificationSentAt: null,
      },
    ];

    component.removePendingHandoff(component.visibleHandoffs[0]);

    expect(service.cancelHandoff).toHaveBeenCalledWith('generic');
    expect(service.cancelHandoff).toHaveBeenCalledWith('specific');
    expect(component.handoffs).toEqual([]);
  });

  it('shows handoff errors inside the open modal without clearing pasted research', () => {
    component.activeTab = 'handoffs';
    component.handoffImportContent = 'research that needs correction';
    component.handoffDetail = {
      id: 'handoff-1',
      companyName: 'WalkMe',
      roleTitle: 'Backend Engineer',
      eventType: 'INTERVIEW_INVITATION',
      researchReason: 'Prepare for interview',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      notificationSentAt: null,
      recruiterName: 'Recruiter',
      existingReportId: null,
      context: {},
      requestedResearch: [],
      chatGptPrompt: 'Research WalkMe',
      deepResearchResult: null,
      notificationError: null,
      notificationAttempts: 0,
      completedAt: null,
    };
    component.errorMessage = 'תוצאת המחקר אינה תקינה';

    fixture.detectChanges();

    const modalError = fixture.nativeElement.querySelector(
      '.ci-detail-modal .ci-alert-error',
    ) as HTMLElement | null;

    expect(modalError?.textContent).toContain('תוצאת המחקר אינה תקינה');
    expect(component.handoffImportContent).toBe('research that needs correction');
  });

  it('requires a company name before research', () => {
    component.companyName = '   ';
    component.researchCompany();
    expect(component.errorMessage).toContain('שם חברה');
  });
});
