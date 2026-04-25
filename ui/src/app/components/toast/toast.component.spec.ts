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

  it('should add a toast when service emits', () => {
    toastService.show('Test Toast', 'success');
    expect(component.toasts.length).toBe(1);
    expect(component.toasts[0].message).toBe('Test Toast');
    expect(component.toasts[0].type).toBe('success');
  });

  it('should remove toast after duration', fakeAsync(() => {
    toastService.show('Temporary Toast', 'info', 1000);
    expect(component.toasts.length).toBe(1);
    
    tick(1500); // Wait for duration + animation buffer
    expect(component.toasts.length).toBe(0);
  }));

  it('should allow manual removal', () => {
    toastService.show('Manual Toast');
    const toastId = component.toasts[0].id;
    component.remove(toastId);
    expect(component.toasts.length).toBe(0);
  });
});
