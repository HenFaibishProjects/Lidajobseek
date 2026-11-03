import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { CompanyIntelligenceService } from './company-intelligence.service';

describe('CompanyIntelligenceService', () => {
  let service: CompanyIntelligenceService;
  let http: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/api/intelligence`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CompanyIntelligenceService],
    });
    service = TestBed.inject(CompanyIntelligenceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the integrated company research endpoint', () => {
    service.researchCompany('ZoomInfo', 'Backend Engineer').subscribe();

    const request = http.expectOne(`${baseUrl}/company/research`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      companyName: 'ZoomInfo',
      role: 'Backend Engineer',
      provider: 'openai',
      forceRefresh: false,
    });
    request.flush({});
  });

  it('calls job matching with the configured profile backend', () => {
    service.matchJobs('ZoomInfo', true).subscribe();

    const request = http.expectOne(`${baseUrl}/jobs/match`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      companyName: 'ZoomInfo',
      provider: 'openai',
      forceRefresh: true,
    });
    request.flush({});
  });

  it('loads saved company history without external research', () => {
    service.listHistory().subscribe();

    const request = http.expectOne(`${baseUrl}/company/history`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads pending research handoffs', () => {
    service.listPendingHandoffs().subscribe();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === `${baseUrl}/research-handoffs/pending` &&
        candidate.params.get('limit') === '20' &&
        candidate.params.get('offset') === '0',
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });
});
