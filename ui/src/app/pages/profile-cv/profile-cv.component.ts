import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProfilesService } from '../../services/profiles.service';
import { ToastService } from '../../services/toast.service';

import { DateFormatPipe } from '../../pipes/date-format.pipe';

@Component({
  selector: 'app-profile-cv',
  standalone: true,
  imports: [CommonModule, RouterLink, DateFormatPipe],
  templateUrl: './profile-cv.component.html',
  styleUrls: ['./profile-cv.component.css']
})
export class ProfileCvComponent implements OnInit {
  loading = false;
  profile: any = null;
  aiProfile: any = null;
  useAi = true;
  downloadingPdf = false;

  constructor(
    private profilesService: ProfilesService,
    private toastService: ToastService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.useAi = params.get('ai') !== 'false';
      this.fetchProfile();
    });
  }

  fetchProfile() {
    this.loading = true;
    this.profilesService.getMyProfile().subscribe({
      next: (data) => {
        this.profile = data;
        this.fetchProfessionalCv();
      },
      error: () => {
        this.toastService.show('Failed to load CV preview', 'error');
        this.loading = false;
      }
    });
  }

  fetchProfessionalCv() {
    this.profilesService.getProfessionalCv(this.useAi).subscribe({
      next: (data) => {
        this.aiProfile = data;
        this.loading = false;
      },
      error: () => {
        this.toastService.show('DeepSeek AI preview is unavailable', 'error');
        this.loading = false;
      }
    });
  }

  loadCv(useAi: boolean) {
    this.useAi = useAi;
    this.fetchProfessionalCv();
  }

  async copyToClipboard() {
    const cv = this.aiProfile || this.profile;
    const text = `
CAREER PROFILE
${cv.about || ''}

TOP SKILLS
${cv.topSkills || ''}

EXPERIENCE
${cv.experience || ''}

OLD COMPANIES
${cv.oldCompanies || ''}

ACTIVITY
${cv.activity || ''}

PRIVATE PROJECTS
${cv.privateProjects || ''}

EDUCATION
${cv.education || ''}

CERTIFICATIONS
${cv.certifications || ''}

LINKS
${cv.links || ''}
    `.trim();

    try {
      await navigator.clipboard.writeText(text);
      this.toastService.show('CV copied to clipboard!', 'success');
    } catch (err) {
      this.toastService.show('Failed to copy', 'error');
    }
  }

  printCv() {
    window.print();
  }

  downloadAsText() {
    const cv = this.aiProfile || this.profile;
    const text = `CAREER PROFILE\n${cv.about || ''}\n\nTOP SKILLS\n${cv.topSkills || ''}\n\nEXPERIENCE\n${cv.experience || ''}\n\nOLD COMPANIES\n${cv.oldCompanies || ''}\n\nACTIVITY\n${cv.activity || ''}\n\nPRIVATE PROJECTS\n${cv.privateProjects || ''}\n\nEDUCATION\n${cv.education || ''}\n\nCERTIFICATIONS\n${cv.certifications || ''}\n\nLINKS\n${cv.links || ''}`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cv-${this.useAi ? 'ai' : 'template'}-${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
    this.toastService.show('CV downloaded as text file', 'success');
  }

  async downloadAsPdf() {
    this.downloadingPdf = true;
    try {
      // Dynamic import to avoid issues if libraries aren't installed yet
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const element = document.querySelector('.cv-shell') as HTMLElement;
      if (!element) {
        throw new Error('CV content not found');
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`cv-${this.useAi ? 'ai-enhanced' : 'template'}-${new Date().toISOString().split('T')[0]}.pdf`);

      this.toastService.show('CV downloaded as PDF!', 'success');
    } catch (error) {
      console.error('PDF generation error:', error);
      this.toastService.show('PDF download failed. Try print or text download.', 'error');
    } finally {
      this.downloadingPdf = false;
    }
  }
}
