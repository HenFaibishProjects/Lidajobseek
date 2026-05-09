import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoachHubComponent } from './coach-hub.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ToastService } from '../../services/toast.service';
import { ResourcesService } from '../../services/resources.service';
import { ConfirmService } from '../../services/confirm.service';
import { AuthService } from '../../services/auth.service';
import { of } from 'rxjs';

describe('CoachHubComponent', () => {
  let component: CoachHubComponent;
  let fixture: ComponentFixture<CoachHubComponent>;
  let mockAuthService: any;
  let mockResourcesService: any;

  beforeEach(async () => {
    mockAuthService = {
      getPreferences: jasmine.createSpy('getPreferences').and.returnValue(of({
        appSettings: {
          coachHubCategories: [
            { id: 'CV', name: 'Resumes', icon: '📄', color: '#000', enabled: true }
          ]
        }
      })),
      updatePreferences: jasmine.createSpy('updatePreferences').and.returnValue(of({}))
    };

    mockResourcesService = {
      getAll: jasmine.createSpy('getAll').and.returnValue(of([]))
    };

    await TestBed.configureTestingModule({
      imports: [CoachHubComponent, HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ResourcesService, useValue: mockResourcesService },
        { provide: ToastService, useValue: { show: jasmine.createSpy() } },
        { provide: ConfirmService, useValue: { confirm: jasmine.createSpy() } }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CoachHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load categories from authService appSettings on init', () => {
    expect(mockAuthService.getPreferences).toHaveBeenCalled();
    expect(component.categories.length).toBe(1);
    expect(component.categories[0].name).toBe('Resumes');
  });

  it('should save categories to authService when saveCategories is called', () => {
    component.categories = [{ id: 'TEST', name: 'Test', icon: 'x', color: '#fff', enabled: true }];
    component.saveCategories();
    expect(mockAuthService.updatePreferences).toHaveBeenCalledWith({
      appSettings: { coachHubCategories: component.categories }
    });
  });
});
