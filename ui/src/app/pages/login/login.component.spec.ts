import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import { of, throwError } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let settingsServiceMock: jasmine.SpyObj<SettingsService>;
  let router: Router;

  beforeEach(async () => {
    authServiceMock = jasmine.createSpyObj('AuthService', ['login', 'register', 'verifyInvitationCode']);
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);
    settingsServiceMock = jasmine.createSpyObj('SettingsService', ['hydrateFromStoredUser', 'syncWithServer']);

    await TestBed.configureTestingModule({
      imports: [
        LoginComponent,
        HttpClientTestingModule,
        RouterTestingModule,
        FormsModule
      ],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in login mode (not register)', () => {
    expect(component.isRegister).toBeFalse();
    expect(component.error).toBe('');
  });

  describe('submit() -login mode', () => {
    it('should show validation error if email or password is empty', () => {
      component.email = '';
      component.password = '';
      component.submit();
      expect(component.error).toBe('Please enter email and password');
      expect(authServiceMock.login).not.toHaveBeenCalled();
    });

    it('should call authService.login with correct credentials', () => {
      authServiceMock.login.and.returnValue(of({} as any));
      component.email = 'user@example.com';
      component.password = 'secret';
      component.submit();
      expect(authServiceMock.login).toHaveBeenCalledWith('user@example.com', 'secret');
    });

    it('should navigate to / and hydrate settings on successful login', () => {
      authServiceMock.login.and.returnValue(of({} as any));
      spyOn(router, 'navigate');
      component.email = 'user@example.com';
      component.password = 'secret';
      component.submit();
      expect(settingsServiceMock.hydrateFromStoredUser).toHaveBeenCalled();
      expect(settingsServiceMock.syncWithServer).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should show a professional 401 error message for wrong credentials', () => {
      authServiceMock.login.and.returnValue(throwError(() => ({ status: 401 })));
      component.email = 'user@example.com';
      component.password = 'wrongpass';
      component.submit();
      expect(component.error).toContain('Authentication Failed');
      expect(component.error).toContain('incorrect');
      expect(toastServiceMock.show).toHaveBeenCalledWith(component.error, 'error');
    });

    it('should show a rate-limit warning for 429 responses', () => {
      authServiceMock.login.and.returnValue(throwError(() => ({ status: 429 })));
      component.email = 'user@example.com';
      component.password = 'anypass';
      component.submit();
      expect(component.error).toContain('Security Alert');
      expect(component.error).toContain('Too many login attempts');
      expect(toastServiceMock.show).toHaveBeenCalledWith(component.error, 'error');
    });

    it('should show a generic connection error for unexpected status codes', () => {
      authServiceMock.login.and.returnValue(throwError(() => ({ status: 503 })));
      component.email = 'user@example.com';
      component.password = 'anypass';
      component.submit();
      expect(component.error).toContain('Connection Error');
      expect(component.error).toContain('unable to reach the server');
      expect(toastServiceMock.show).toHaveBeenCalledWith(component.error, 'error');
    });

    it('should always show the error via toastService on any login failure', () => {
      authServiceMock.login.and.returnValue(throwError(() => ({ status: 0 })));
      component.email = 'user@example.com';
      component.password = 'anypass';
      component.submit();
      expect(toastServiceMock.show).toHaveBeenCalledWith(jasmine.any(String), 'error');
    });
  });

  describe('submit() -register mode', () => {
    beforeEach(() => {
      component.isRegister = true;
    });

    it('should show error if any required register field is missing', () => {
      component.email = 'user@example.com';
      component.password = '';
      component.name = '';
      component.verificationCode = '';
      component.submit();
      expect(component.error).toBe('Please fill all fields including verification code');
      expect(authServiceMock.register).not.toHaveBeenCalled();
    });

    it('should call authService.register with all fields', () => {
      authServiceMock.register.and.returnValue(of({} as any));
      component.email = 'new@example.com';
      component.password = 'pass123';
      component.name = 'New User';
      component.verificationCode = 'CODE123';
      component.submit();
      expect(authServiceMock.register).toHaveBeenCalledWith('new@example.com', 'pass123', 'New User', 'CODE123');
    });

    it('should switch to login mode and show success toast after registration', () => {
      authServiceMock.register.and.returnValue(of({} as any));
      component.email = 'new@example.com';
      component.password = 'pass123';
      component.name = 'New User';
      component.verificationCode = 'CODE123';
      component.submit();
      expect(component.isRegister).toBeFalse();
      expect(toastServiceMock.show).toHaveBeenCalledWith('Registration successful! Please login.', 'success');
    });
  });
});
