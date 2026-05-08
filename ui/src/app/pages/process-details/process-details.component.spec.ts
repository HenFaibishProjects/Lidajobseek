import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { ProcessDetailsComponent } from './process-details.component';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { SettingsService } from '../../services/settings.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, BehaviorSubject } from 'rxjs';
import { LucideAngularModule, Briefcase, ExternalLink, Mail, Phone, Calendar, MapPin, Globe, Clock, Target, Rocket, Heart, Sparkles, Send, CheckCircle, Check, Clock4, FileText, ChevronRight, X, MessageSquare, Plus, History, Lightbulb, Trash2, Edit2, AlertCircle, Pencil, Edit, CheckCircle2, Users, User, UserPlus, Link } from 'lucide-angular';

describe('ProcessDetailsComponent', () => {
  let component: ProcessDetailsComponent;
  let fixture: ComponentFixture<ProcessDetailsComponent>;

  const mockProcess = {
    id: 1,
    companyName: 'Google',
    roleTitle: 'Frontend Engineer',
    currentStage: 'Applied',
    jobDescriptionUrl: 'https://careers.google.com/jobs/123',
    interactions: [],
    reviews: [],
    contacts: []
  };

  const mockSettings = {
    theme: 'dark',
    country: 'United States',
    avatarStyle: 'bottts',
    profile: { displayName: 'Test User', contactEmail: 'test@test.com' }
  };
  const settingsSubject = new BehaviorSubject(mockSettings);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ProcessDetailsComponent,
        HttpClientTestingModule,
        RouterTestingModule,
        LucideAngularModule.pick({ Briefcase, ExternalLink, Mail, Phone, Calendar, MapPin, Globe, Clock, Target, Rocket, Heart, Sparkles, Send, CheckCircle, Check, Clock4, FileText, ChevronRight, X, MessageSquare, Plus, History, Lightbulb, Trash2, Edit2, AlertCircle, Pencil, Edit, CheckCircle2, Users, User, UserPlus, Link })
      ],
      providers: [
        {
          provide: ProcessesService,
          useValue: {
            getById: jasmine.createSpy('getById').and.returnValue(of({ ...mockProcess })),
            delete: jasmine.createSpy('delete').and.returnValue(of({})),
          }
        },
        { provide: ToastService, useValue: { show: jasmine.createSpy('show') } },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jasmine.createSpy('getSettings').and.returnValue(mockSettings),
            settings$: settingsSubject.asObservable()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProcessDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should correctly format jobDescriptionUrl', () => {
    expect(component.formatUrl('google.com')).toBe('https://google.com');
    expect(component.formatUrl('https://google.com')).toBe('https://google.com');
  });

  it('should render the Visit Original Post link when jobDescriptionUrl is present', () => {
    const compiled = fixture.nativeElement;
    const visitLink = compiled.querySelector('.btn-visit-detail');
    expect(visitLink).toBeTruthy();
    expect(visitLink.getAttribute('href')).toBe('https://careers.google.com/jobs/123');
  });
});
