import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfilesService } from '../../services/profiles.service';
import { ToastService } from '../../services/toast.service';

import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DateFormatPipe],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  loading = false;
  shareEmail = '';
  shareResult: { exists: boolean } | null = null;
  completionPercentage = 0;
  missingFields: Array<{ key: string; label: string; priority: string }> = [];

  profile: any = {
    about: '',
    topSkills: '',
    activity: '',
    oldCompanies: '',
    experience: '',
    privateProjects: '',
    education: '',
    certifications: '',
    links: '',
    lastCvUrl: '',
    lastCvGeneratedAt: '',
    lastCvAi: null
  };

  profileFields = [
    { key: 'about', label: 'About', priority: 'high' },
    { key: 'topSkills', label: 'Top Skills', priority: 'high' },
    { key: 'experience', label: 'Experience', priority: 'high' },
    { key: 'oldCompanies', label: 'Old Companies', priority: 'medium' },
    { key: 'activity', label: 'Activity', priority: 'medium' },
    { key: 'privateProjects', label: 'Private Projects', priority: 'medium' },
    { key: 'education', label: 'Education', priority: 'low' },
    { key: 'certifications', label: 'Certifications', priority: 'low' },
    { key: 'links', label: 'Links', priority: 'low' }
  ];

  constructor(
    private profilesService: ProfilesService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.loading = true;
    this.profilesService.getMyProfile().subscribe({
      next: (data) => {
        this.profile = { ...this.profile, ...data };
        this.calculateCompletion();
        this.loading = false;
      },
      error: () => {
        this.toastService.show('Failed to load profile', 'error');
        this.loading = false;
      }
    });
  }

  calculateCompletion() {
    const fields = this.profileFields;
    const filledFields = fields.filter(field => {
      const value = this.profile[field.key];
      return value && value.trim().length > 0;
    });

    this.completionPercentage = Math.round((filledFields.length / fields.length) * 100);
    this.missingFields = fields
      .filter(field => !this.profile[field.key] || this.profile[field.key].trim().length === 0)
      .sort((a, b) => {
        const priorityOrder: { [key: string]: number } = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  saveProfile() {
    this.loading = true;
    this.profilesService.updateMyProfile(this.profile).subscribe({
      next: () => {
        this.calculateCompletion();
        this.toastService.show('Profile saved successfully', 'success');
        this.loading = false;
      },
      error: () => {
        this.toastService.show('Failed to save profile', 'error');
        this.loading = false;
      }
    });
  }

  getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  getCompletionColor(): string {
    if (this.completionPercentage >= 80) return '#10b981';
    if (this.completionPercentage >= 50) return '#f59e0b';
    return '#ef4444';
  }

  shareProfile() {
    const email = this.shareEmail.trim();
    if (!email) {
      this.toastService.show('Please enter an email address', 'warning');
      return;
    }

    this.loading = true;
    this.profilesService.shareProfile(email).subscribe({
      next: (response) => {
        this.shareResult = { exists: response.exists };
        if (response.exists) {
          this.toastService.show('Profile shared successfully', 'success');
        } else {
          this.toastService.show('User not found', 'warning');
        }
        this.loading = false;
      },
      error: () => {
        this.toastService.show('Failed to share profile', 'error');
        this.loading = false;
      }
    });
  }
}
