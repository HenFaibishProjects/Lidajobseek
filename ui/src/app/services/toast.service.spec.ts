import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should emit a toast event when show() is called', (done) => {
    service.toasts$.subscribe(toasts => {
      if (toasts.length > 0) {
        const toast = toasts[toasts.length - 1];
        expect(toast.message).toBe('Test Message');
        expect(toast.type).toBe('success');
        done();
      }
    });

    service.show('Test Message', 'success');
  });

  it('should default to info type if not specified', (done) => {
    service.toasts$.subscribe(toasts => {
      if (toasts.length > 0) {
        const toast = toasts[toasts.length - 1];
        expect(toast.type).toBe('info');
        done();
      }
    });

    service.show('Default Test');
  });
});
