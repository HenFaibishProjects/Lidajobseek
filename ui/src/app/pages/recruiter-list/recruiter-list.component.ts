import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RecruitmentAgenciesService } from '../../services/recruitment-agencies.service';
import { ConfirmService } from '../../services/confirm.service';
import { ToastService } from '../../services/toast.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-recruiter-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DateFormatPipe],
  templateUrl: './recruiter-list.component.html',
  styleUrls: ['./recruiter-list.component.css'],
})
export class RecruiterListComponent implements OnInit {
  agencies: any[] = [];
  filtered: any[] = [];
  isLoading = true;
  searchText = '';

  constructor(
    private agenciesService: RecruitmentAgenciesService,
    private confirmService: ConfirmService,
    private toastService: ToastService,
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading = true;
    this.agenciesService.getAll().subscribe({
      next: (data) => { this.agencies = data; this.applyFilters(); this.isLoading = false; },
      error: () => { this.toastService.show('Failed to load agencies', 'error'); this.isLoading = false; },
    });
  }

  applyFilters() {
    this.filtered = this.agencies.filter((a) => {
      if (!this.searchText) return true;
      const q = this.searchText.toLowerCase();
      return (
        a.agencyName?.toLowerCase().includes(q) ||
        a.primaryContactName?.toLowerCase().includes(q)
      );
    });
  }

  clearSearch() { this.searchText = ''; this.applyFilters(); }

  async deleteAgency(agency: any) {
    if (await this.confirmService.delete(`agency "${agency.agencyName}"`)) {
      this.agenciesService.delete(agency.id).subscribe({
        next: () => { this.toastService.show('Agency removed', 'success'); this.load(); },
        error: () => this.toastService.show('Failed to remove agency', 'error'),
      });
    }
  }

  /** Short truncate for checkpoint summary */
  truncate(str: string | null, len = 60): string {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }
}
