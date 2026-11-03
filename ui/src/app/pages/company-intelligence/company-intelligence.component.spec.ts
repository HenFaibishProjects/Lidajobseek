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

  it('requires a company name before research', () => {
    component.companyName = '   ';
    component.researchCompany();
    expect(component.errorMessage).toContain('company name');
  });
});
