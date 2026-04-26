import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../services/toast.service';
import { CommonModule } from '@angular/common';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent, CommonModule],
      providers: [ToastService]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display a toast when service emits', () => {
    toastService.show('Test Toast', 'success');
    fixture.detectChanges();
    
    const toastElement = fixture.nativeElement.querySelector('.toast');
    expect(toastElement).toBeTruthy();
    expect(toastElement.textContent).toContain('Test Toast');
  });

  it('should remove toast after duration', fakeAsync(() => {
    toastService.show('Temporary Toast', 'info');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast')).toBeTruthy();
    
    tick(3500); // Service has 3000ms delay + buffer
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
  }));

  it('should allow manual removal', () => {
    toastService.show('Manual Toast');
    fixture.detectChanges();
    
    const toastElement = fixture.nativeElement.querySelector('.toast');
    toastElement.click(); // Clicking the toast calls toastService.remove()
    
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.toast')).toBeNull();
  });
});
