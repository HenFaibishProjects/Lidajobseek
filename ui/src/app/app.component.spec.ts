import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ToastService } from './services/toast.service';

import { LucideAngularModule, Sparkles } from 'lucide-angular';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        RouterTestingModule,
        HttpClientTestingModule,
        LucideAngularModule.pick({ Sparkles })
      ],
      providers: [
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['isAuthenticated', 'logout']) },
        { provide: SettingsService, useValue: jasmine.createSpyObj('SettingsService', ['hydrateFromStoredUser']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['show']) }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'ui' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Reqcue');
  });
});
