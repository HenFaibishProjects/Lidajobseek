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
    service.toast$.subscribe(toast => {
      expect(toast.message).toBe('Test Message');
      expect(toast.type).toBe('success');
      done();
    });

    service.show('Test Message', 'success');
  });

  it('should default to success type if not specified', (done) => {
    service.toast$.subscribe(toast => {
      expect(toast.type).toBe('success');
      done();
    });

    service.show('Default Test');
  });
});
