import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../../services/settings.service';
import { ProcessesService } from '../../services/processes.service';
import { ToastService } from '../../services/toast.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css'
})
export class OnboardingComponent {
  @Output() close = new EventEmitter<void>();

  step = 1;
  isSaving = false;
  selectedGoal = '';

  constructor(
    private settingsService: SettingsService,
    private processesService: ProcessesService,
    private toastService: ToastService,
    private router: Router
  ) {}

  nextStep() {
    this.step++;
  }

  selectGoal(goal: string) {
    this.selectedGoal = goal;
  }

  skip() {
    this.finishOnboarding();
  }

  async addSampleData() {
    this.isSaving = true;
    try {
      // Add sample process
      const sampleProcess = await this.processesService.create({
        companyName: 'Acme Corp',
        roleTitle: 'Senior Software Engineer',
        location: 'Remote',
        workMode: 'remote',
        source: 'LinkedIn',
        salaryRange: '$120k - $150k',
        scoreTech: 8,
        scoreWLB: 9,
        scoreGrowth: 7,
        scoreVibe: 8,
        currentStage: 'Interview Scheduled',
        notes: 'Sample process added from onboarding. Great company culture!'
      }).toPromise();

      this.toastService.show('Sample data added successfully!', 'success');
      this.finishOnboarding();
    } catch (e) {
      this.toastService.show('Failed to add sample data', 'error');
      this.isSaving = false;
    }
  }

  finishOnboarding() {
    this.isSaving = true;
    this.settingsService.updateSettings({ hasSeenOnboarding: true });
    this.close.emit();
  }
}
