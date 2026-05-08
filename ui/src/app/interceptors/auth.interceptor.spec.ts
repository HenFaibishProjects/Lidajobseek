import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('AuthInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['getToken', 'logout']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: HTTP_INTERCEPTORS,
          useClass: AuthInterceptor,
          multi: true
        },
        { provide: AuthService, useValue: authSpy }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    const interceptor = new AuthInterceptor(authService);
    expect(interceptor).toBeTruthy();
  });

  it('should add an Authorization header for authenticated requests to protected paths', () => {
    authService.getToken.and.returnValue('fake-token');

    httpClient.get('/api/processes').subscribe();

    const req = httpMock.expectOne('/api/processes');
    expect(req.request.headers.has('Authorization')).toBeTrue();
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-token');
    req.flush({});
  });

  it('should not add an Authorization header if token does not exist', () => {
    authService.getToken.and.returnValue(null);

    httpClient.get('/api/processes').subscribe();

    const req = httpMock.expectOne('/api/processes');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('should NOT add Authorization header to /login even if a token exists', () => {
    authService.getToken.and.returnValue('fake-token');

    httpClient.post('/api/auth/login', {}).subscribe({ error: () => { } });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('should NOT add Authorization header to /register even if a token exists', () => {
    authService.getToken.and.returnValue('fake-token');

    httpClient.post('/api/auth/register', {}).subscribe({ error: () => { } });

    const req = httpMock.expectOne('/api/auth/register');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 400, statusText: 'Bad Request' });
  });

  it('should NOT add Authorization header to /verify-code even if a token exists', () => {
    authService.getToken.and.returnValue('fake-token');

    httpClient.post('/api/auth/verify-code', {}).subscribe({ error: () => { } });

    const req = httpMock.expectOne('/api/auth/verify-code');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 400, statusText: 'Bad Request' });
  });

  it('should call authService.logout and return EMPTY on 401 for protected paths', () => {
    authService.getToken.and.returnValue('expired-token');
    let completed = false;

    httpClient.get('/api/processes').subscribe({ complete: () => (completed = true) });

    const req = httpMock.expectOne('/api/processes');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(completed).toBeTrue(); // EMPTY completes without error
  });

  it('should NOT call authService.logout on 401 for /login -lets the error propagate', () => {
    authService.getToken.and.returnValue(null);
    let errorReceived = false;

    httpClient.post('/api/auth/login', {}).subscribe({ error: () => (errorReceived = true) });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(errorReceived).toBeTrue(); // Error is propagated to the component
  });
});
