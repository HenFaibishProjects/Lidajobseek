import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ToastService } from './services/toast.service';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';

import { of } from 'rxjs';
import { LucideAngularModule, Sparkles } from 'lucide-angular';

describe('AppComponent', () => {
  let fixture: any;
  let component: any;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'isAuthenticated',
      'logout',
    ]);

    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        RouterTestingModule,
        HttpClientTestingModule,
        LucideAngularModule.pick({ Sparkles })
      ],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SettingsService, useValue: jasmine.createSpyObj('SettingsService', ['hydrateFromStoredUser', 'getSettings'], { openSettings$: of() }) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['show']) },
        { provide: KeyboardShortcutsService, useValue: jasmine.createSpyObj('KeyboardShortcutsService', ['getShortcuts']) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have the 'ui' title`, () => {
    expect(component.title).toEqual('Reqcue');
  });

  it('should hide the app shell on the login route even with a valid session', () => {
    authService.isAuthenticated.and.returnValue(true);
    spyOnProperty(router, 'url', 'get').and.returnValue('/login');

    expect(component.showAppShell).toBeFalse();
  });

  it('should show the app shell on authenticated application routes', () => {
    authService.isAuthenticated.and.returnValue(true);
    spyOnProperty(router, 'url', 'get').and.returnValue('/pipeline');

    expect(component.showAppShell).toBeTrue();
  });
});
