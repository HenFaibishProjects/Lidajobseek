import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PROCESS_STAGES } from '../../shared/process-stages';
import countriesData from '../../../assets/countries.json';
import { InitialInteractionFieldsComponent } from '../initial-interaction-fields/initial-interaction-fields.component';
import { SettingsService } from '../../services/settings.service';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-process-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    InitialInteractionFieldsComponent
  ],
  templateUrl: './process-form.component.html',
  styleUrls: ['./process-form.component.css']
})
export class ProcessFormComponent implements OnInit, OnDestroy {
  readonly DEFAULT_LOGO = 'assets/default-company.png';

  @Input() process: any = {};
  @Input() isEdit: boolean = false;
  @Input() isSubmitting: boolean = false;

  @Output() onSubmit = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  countries: any[] = [];
  stages = PROCESS_STAGES;
  logoFetchState: 'idle' | 'fetching' | 'success' | 'failed' = 'idle';
  private logoFailedTimer: any;
  private _cachedCities: string[] = [];
  private _lastCountry: string = '';

  // Company Research JSON paste
  companyResearchRaw: string = '';
  companyResearchState: 'idle' | 'valid' | 'invalid' = 'idle';
  companyResearchExpanded: boolean = false;
  promptCopied: boolean = false;
  private promptCopiedTimer: any;

  readonly CURRENCIES = [

    { code: 'USD', symbol: '$', label: 'USD - US Dollar' },
    { code: 'EUR', symbol: '€', label: 'EUR - Euro' },
    { code: 'GBP', symbol: '£', label: 'GBP - British Pound' },
    { code: 'AED', symbol: 'د.إ', label: 'AED - UAE Dirham' },
    { code: 'AUD', symbol: 'A$', label: 'AUD - Australian Dollar' },
    { code: 'BRL', symbol: 'R$', label: 'BRL - Brazilian Real' },
    { code: 'CAD', symbol: 'C$', label: 'CAD - Canadian Dollar' },
    { code: 'CHF', symbol: 'Fr', label: 'CHF - Swiss Franc' },
    { code: 'CNY', symbol: '¥', label: 'CNY - Chinese Yuan' },
    { code: 'CZK', symbol: 'Kč', label: 'CZK - Czech Koruna' },
    { code: 'DKK', symbol: 'kr', label: 'DKK - Danish Krone' },
    { code: 'HKD', symbol: 'HK$', label: 'HKD - Hong Kong Dollar' },
    { code: 'HUF', symbol: 'Ft', label: 'HUF - Hungarian Forint' },
    { code: 'IDR', symbol: 'Rp', label: 'IDR - Indonesian Rupiah' },
    { code: 'INR', symbol: '₹', label: 'INR - Indian Rupee' },
    { code: 'JPY', symbol: '¥', label: 'JPY - Japanese Yen' },
    { code: 'KRW', symbol: '₩', label: 'KRW - South Korean Won' },
    { code: 'MXN', symbol: 'MX$', label: 'MXN - Mexican Peso' },
    { code: 'NOK', symbol: 'kr', label: 'NOK - Norwegian Krone' },
    { code: 'NZD', symbol: 'NZ$', label: 'NZD - New Zealand Dollar' },
    { code: 'PLN', symbol: 'zł', label: 'PLN - Polish Zloty' },
    { code: 'RON', symbol: 'lei', label: 'RON - Romanian Leu' },
    { code: 'RUB', symbol: '₽', label: 'RUB - Russian Ruble' },
    { code: 'SAR', symbol: 'ر.س', label: 'SAR - Saudi Riyal' },
    { code: 'SEK', symbol: 'kr', label: 'SEK - Swedish Krona' },
    { code: 'SGD', symbol: 'S$', label: 'SGD - Singapore Dollar' },
    { code: 'THB', symbol: '฿', label: 'THB - Thai Baht' },
    { code: 'TRY', symbol: '₺', label: 'TRY - Turkish Lira' },
    { code: 'TWD', symbol: 'NT$', label: 'TWD - Taiwan Dollar' },
    { code: 'UAH', symbol: '₴', label: 'UAH - Ukrainian Hryvnia' },
    { code: 'ZAR', symbol: 'R', label: 'ZAR - South African Rand' },
    { code: 'ILS', symbol: '₪', label: 'ILS - Israeli Shekel' },
  ];

  readonly SALARY_PERIODS = [
    { value: 'Month', label: 'per Month' },
    { value: 'Year', label: 'per Year' },
    { value: 'Week', label: 'per Week' },
    { value: 'Day', label: 'per Day' },
    { value: 'Hour', label: 'per Hour' },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    public settingsService: SettingsService,
    private confirmService: ConfirmService
  ) {
    this.countries = Object.keys(countriesData).map(name => ({ name }));
  }

  /** Cities for the country the user set in Settings */
  get citiesForUserCountry(): string[] {
    const country = this.userCountry;
    if (country !== this._lastCountry) {
      this._lastCountry = country;
      this._cachedCities = (countriesData as Record<string, string[]>)[country] || [];
    }
    return this._cachedCities;
  }

  get userCountry(): string {
    return this.settingsService.getSettings().country || 'Israel';
  }

  ngOnInit(): void {
    // Self-heal: if a website is set but logo was lost, re-fetch silently
    if (this.process?.companyWebsite && !this.process?.companyLogoUrl) {
      setTimeout(() => this.fetchLogo(), 300);
    }
    // Restore raw textarea if editing an existing process that already has research
    if (this.process?.companyResearch) {
      this.companyResearchRaw = JSON.stringify(this.process.companyResearch, null, 2);
      this.companyResearchState = 'valid';
      this.companyResearchExpanded = true;
    }
  }


  ngOnDestroy(): void {
    if (this.logoFailedTimer) {
      clearTimeout(this.logoFailedTimer);
    }
    if (this.promptCopiedTimer) {
      clearTimeout(this.promptCopiedTimer);
    }
  }

  // ── Progress tracking ──────────────────────────────────────────────
  /** Count distinct terms in the tech stack field (comma or space-separated) */
  private techTermCount(): number {
    return (this.process.techStack || '')
      .trim()
      .split(/[,\s]+/)
      .filter((w: string) => w.length > 0).length;
  }

  /** 10% for 1-2 terms · 15% for 3-5 · 20% for 6+ */
  get techStackScore(): number {
    const n = this.techTermCount();
    if (n === 0) return 0;
    if (n <= 2) return 10;
    if (n <= 5) return 15;
    return 20;
  }

  get completionPercent(): number {
    const p = this.process;
    if (!p) return 0;

    const hasRealLogo = !!p.companyLogoUrl && p.companyLogoUrl !== this.DEFAULT_LOGO;
    const pitchLen = (p.tailoredPitch || '').trim().length;
    const tech = this.techStackScore;

    // ── Base score (identical weights in both modes) ───────────────
    let pct = 0;
    if (p.companyName?.trim()) pct += 10;
    if (p.roleTitle?.trim()) pct += 10;
    pct += tech;                                // 0 / 10 / 15 / 20
    if (p.companyWebsite?.trim()) pct += 10;
    if (p.jobDescriptionUrl?.trim()) pct += 10;
    if (hasRealLogo) pct += 10;
    if (p.salaryExpectation) pct += 10;
    // Pitch: 0 → 10 → 15 → 20%
    if (pitchLen > 0) pct += pitchLen <= 60 ? 10 : pitchLen <= 150 ? 15 : 20;

    // ── II notes bonus (only adds, never subtracts) ────────────────
    // Switching stages can never reduce the percentage.
    if (this.shouldShowInteractionSection && p.initialInviteContent?.trim()) {
      pct += 13;
    }

    return Math.min(100, pct);
  }

  get progressColor(): string {
    const p = this.completionPercent;
    if (p < 30) return '#ef4444';
    if (p < 60) return '#f59e0b';
    if (p < 85) return '#3b82f6';
    return '#10b981';
  }

  get progressLabel(): string {
    const p = this.completionPercent;
    if (p === 0) return 'Start filling in the details below';
    if (p < 30) return 'Just getting started…';
    if (p < 60) return 'Good progress, keep going!';
    if (p < 85) return 'Almost there!';
    if (p < 100) return 'Nearly complete!';
    return 'All done - looking great!';
  }

  // ── Logo ──────────────────────────────────────────────────────────
  fetchLogo() {
    if (!this.process.companyWebsite?.trim()) return;

    let domain = this.process.companyWebsite.toLowerCase().trim();
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
    domain = domain.split(/[/?#]/)[0];

    if (!domain.includes('.') || domain.length < 4) {
      this.showLogoFailed();
      return;
    }

    this.logoFetchState = 'fetching';
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    // Pre-check the image - Google returns a tiny 16x16 default when no favicon exists
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth <= 16 && probe.naturalHeight <= 16) {
        // Generic fallback icon - treat as failure
        this.process.companyLogoUrl = null;
        this.showLogoFailed();
      } else {
        this.process.companyLogoUrl = url;
        this.logoFetchState = 'success';
      }
      this.cdr.detectChanges();
    };
    probe.onerror = () => {
      this.process.companyLogoUrl = null;
      this.showLogoFailed();
      this.cdr.detectChanges();
    };
    probe.src = url;
  }

  private showLogoFailed() {
    clearTimeout(this.logoFailedTimer);
    this.logoFetchState = 'failed';
    this.logoFailedTimer = setTimeout(() => {
      this.logoFetchState = 'idle';
      this.cdr.detectChanges();
    }, 4000);
  }

  onWebsiteBlur() { this.fetchLogo(); }

  formatUrl(url: string | undefined): string {
    if (!url) return '';
    return (url.startsWith('http://') || url.startsWith('https://')) ? url : 'https://' + url;
  }

  // ── Stage logic ───────────────────────────────────────────────────
  get shouldShowInteractionSection(): boolean {
    if (!this.process?.currentStage) return false;
    return this.process.currentStage !== this.stages[0] && this.process.currentStage !== this.stages[1];
  }

  onStageChange() {
    if (this.shouldShowInteractionSection) {
      if (!this.process.initialInviteDate)
        this.process.initialInviteDate = new Date().toISOString().split('T')[0];
      if (!this.process.initialInviteMethod) {
        this.process.initialInviteMethod = 'LinkedIn';
        this.process.initiatedBy = 'Recruiter';
        this.process.firstContactChannel = 'LinkedIn';
      }
    }
    this.cdr.detectChanges();
  }

  onWorkModeChange() {
    if (this.process.workMode !== 'hybrid') {
      this.process.daysFromOffice = null;
    }
    this.cdr.detectChanges();
  }

  // ── Submit / Cancel ───────────────────────────────────────────────
  submit() {
    if (this.process.companyWebsite && !this.process.companyLogoUrl) this.fetchLogo();
    if (!this.shouldShowInteractionSection) {
      this.process.initialInviteDate = null;
      this.process.initialInviteMethod = '';
      this.process.initiatedBy = '';
      this.process.firstContactChannel = '';
      this.process.initialInviteContent = '';
    }
    if (this.process.workMode !== 'hybrid') {
      this.process.daysFromOffice = null;
    }
    this.onSubmit.emit();
  }

  /** Returns the logo to display - real logo → default asset, never empty */
  logoSrc(): string {
    return this.process.companyLogoUrl || this.DEFAULT_LOGO;
  }

  onLogoLoaded() {
    // Called when the displayed img loads successfully (real logo)
    if (this.logoFetchState === 'fetching') this.logoFetchState = 'success';
  }

  onLogoError() {
    // If the failure happened for the real logo, try the default one
    if (this.process.companyLogoUrl) {
      this.process.companyLogoUrl = null;
      if (this.logoFetchState === 'fetching') this.showLogoFailed();
      else this.logoFetchState = 'idle';
      this.cdr.detectChanges();
    } else {
      // If even the default logo fails, just stop
      this.logoFetchState = 'idle';
    }
  }

  getCompanyInitial(): string {
    return (this.process.companyName?.charAt(0) || '?').toUpperCase();
  }

  async cancel() {
    const confirmed = await this.confirmService.confirm(
      'Are you sure you want to discard this application? Any unsaved changes will be lost.',
      'Discard Changes'
    );
    if (confirmed) {
      this.onCancel.emit();
    }
  }

  scoreLabel(val: number): string {
    return ['—', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'][val] || '—';
  }

  // ── Company Research JSON ─────────────────────────────────────────
  onCompanyResearchChange() {
    const raw = this.companyResearchRaw.trim();
    if (!raw) {
      this.companyResearchState = 'idle';
      this.process.companyResearch = null;
      return;
    }
    try {
      this.process.companyResearch = JSON.parse(raw);
      this.companyResearchState = 'valid';
    } catch {
      this.process.companyResearch = null;
      this.companyResearchState = 'invalid';
    }
  }

  toggleCompanyResearch() {
    this.companyResearchExpanded = !this.companyResearchExpanded;
  }

  copyResearchPrompt(event: Event) {
    event.stopPropagation(); // prevent toggling the section
    const companyName = this.process.companyName?.trim() || 'Unknown Company';
    const prompt =
`Research the following company as a potential employer. Company name: ${companyName}
 Country or location: israel 
Use web search and public sources only. Return a concise JSON overview for a job seeker. Rules: 1. Verify that you found the correct company and do not mix it with similarly named companies. 2. Prefer official sources, LinkedIn, career pages, reputable news sites, and employee review sites. 3. Do not guess. Use null when reliable information is unavailable. 4. Keep the response short: - Maximum 1-2 sentences per summary - Maximum 3 items in each list - Maximum 3 recent news items 5. Do not repeat the same fact in multiple sections. 6. Focus on information relevant to someone considering working at the company. 7. Return valid JSON only. You MUST verify that the JSON is 100% valid and properly escaped. 8. Write summaries in Hebrew. Keep JSON keys and enum values in English. Return exactly this structure: { "company": { "name": null, "website": null, "location": null, "industry": null, "summary": null, "employee_range": null, "growth_trend": "growing | stable | shrinking | unknown" }, "workplace": { "work_model": "remote | hybrid | onsite | mixed | unknown", "review_rating": null, "review_count": null, "reviews_summary": null }, "hiring": { "is_hiring": null, "open_roles_summary": null }, "recent_news": [ { "date": null, "title": null, "summary": null, "source_url": null } ], "job_seeker_summary": { "overall_impression": null, "positive_signals": [], "concerns": [], "missing_information": [] } }
Please verify the JSON validation and provide the final result in a JSON canvas (code block) ready to copy.`;

    navigator.clipboard.writeText(prompt).then(() => {
      clearTimeout(this.promptCopiedTimer);
      this.promptCopied = true;
      this.promptCopiedTimer = setTimeout(() => {
        this.promptCopied = false;
        this.cdr.detectChanges();
      }, 2500);
      this.cdr.detectChanges();
    }).catch(() => {
      // Fallback for environments without clipboard API
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.promptCopied = true;
      this.promptCopiedTimer = setTimeout(() => { this.promptCopied = false; this.cdr.detectChanges(); }, 2500);
      this.cdr.detectChanges();
    });
  }
}
