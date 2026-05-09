import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PipelineBoardComponent } from './pipeline-board.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

describe('PipelineBoardComponent', () => {
  let component: PipelineBoardComponent;
  let fixture: ComponentFixture<PipelineBoardComponent>;
  let mockProcessesService: any;

  beforeEach(async () => {
    mockProcessesService = {
      getAll: jasmine.createSpy('getAll').and.returnValue(of([])),
      update: jasmine.createSpy('update').and.returnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [PipelineBoardComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ProcessesService, useValue: mockProcessesService },
        { provide: ToastService, useValue: { show: jasmine.createSpy() } }
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PipelineBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Time-ago badges', () => {
    it('should return "today" for today', () => {
      const today = new Date().toISOString();
      expect(component.getDaysAgo(today)).toBe('today');
    });

    it('should return "1d" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(component.getDaysAgo(yesterday.toISOString())).toBe('1d');
    });

    it('should return correct age badge class', () => {
      const fresh = new Date();
      expect(component.getAgeBadgeClass(fresh.toISOString())).toBe('age-fresh');

      const recent = new Date();
      recent.setDate(recent.getDate() - 5);
      expect(component.getAgeBadgeClass(recent.toISOString())).toBe('age-recent');

      const stale = new Date();
      stale.setDate(stale.getDate() - 10);
      expect(component.getAgeBadgeClass(stale.toISOString())).toBe('age-stale');

      const overdue = new Date();
      overdue.setDate(overdue.getDate() - 20);
      expect(component.getAgeBadgeClass(overdue.toISOString())).toBe('age-overdue');
    });
  });

  describe('Columns structure', () => {
    it('should have 5 columns: applied, in-process, offer, hired, closed', () => {
      expect(component.columns.length).toBe(5);
      expect(component.columns.map(c => c.id)).toEqual(['applied', 'in-process', 'offer', 'hired', 'closed']);
    });
  });
});
