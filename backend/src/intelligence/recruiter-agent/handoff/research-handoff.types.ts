import type { CompanyReport } from '../../company-intelligence/company-report.schema';
import type { RecruiterEmailAnalysis } from '../recruiter-email.schema';

export enum ResearchHandoffStatus {
  PENDING_CHATGPT = 'PENDING_CHATGPT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
export const MAX_NOTIFICATION_ATTEMPTS = 3;
export const NOTIFICATION_RETRY_MS = 5 * 60 * 1000;
export const NOTIFICATION_LEASE_MS = 5 * 60 * 1000;
export const NOTIFICATION_BATCH_SIZE = 5;

export interface ExistingResearchContext {
  reportId: string;
  researchedAt: string;
  mode: string;
  whatTheyDo: string;
  workModel: string | null;
  employees: NonNullable<CompanyReport['quickBrief']>['employees'] | null;
  location: CompanyReport['location'];
  sources: Array<{ title: string; url: string }>;
  limitations: string[];
}
export interface ResearchHandoffContext {
  companyName: string;
  roleTitle: string | null;
  recruiterName: string | null;
  eventType: string;
  researchReason: string;
  summary: string;
  interview: RecruiterEmailAnalysis['interview'];
  existingResearch: ExistingResearchContext | null;
}

export const HANDOFF_RESEARCH_CHECKLIST = [
  'Company & business: what the company does, its product and business model, main customers and use cases, competitors and market positioning',
  'Business health: current situation, funding rounds, revenue and profitability where public, acquisitions (made or received), layoffs and restructuring, with dates',
  'Leadership: current leadership team and recent leadership changes (CEO, CTO, VP R&D, Israel site lead)',
  'Recent important company news from the last 12-18 months and what it may mean for the role',
  'Israel presence: exact Israeli presence, whether Israel hosts R&D/engineering, local site role vs. HQ',
  'Israel office: exact local office address, building name, office floor or company floors, and total building floor count where publicly supportable',
  'Local hybrid/onsite/remote policy and actual office-day expectations reported by employees, not just official policy',
  'Supportable approximate global, Israel and Israel R&D/engineering headcounts, plus local team size and Israel hiring trend (growing, stable, shrinking)',
  'Engineering organization: structure, teams and groups, backend/platform/data/cloud work and which team this role likely belongs to',
  'Technology stack, architecture, scale and distributed-systems challenges, cloud and infrastructure providers',
  'Engineering culture and developer practices (code review, testing, CI/CD, on-call, ownership, engineering blog, open source, conference talks)',
  'Employee tenure and turnover signals where supportable (e.g. LinkedIn tenure patterns, repeated departures), clearly labeled as inference',
  'Recent company, management, employee and former-employee public posts',
  'Reddit and public community discussions; distinguish experience from established facts',
  'Glassdoor/public workplace reviews where accessible without login/paywall bypass; repeated positive themes and repeated negative themes, separating anecdotes from patterns',
  'Software-engineering candidate interview reports, prioritizing recent Israel-specific evidence and this role/seniority',
  'Reported recruiter/screening calls, coding questions and topics, system design topics, home assignments, onsite/long interview days, behavioral and manager interviews',
  'Reported interview difficulty, time between stages, candidate experiences and publicly reported rejection reasons',
  'Candidate preparation for Hen: what to prepare technically, likely topics worth refreshing, questions for the recruiter and for the engineering manager',
  'Positive signals, supported warning signs, remaining unknowns and questions for the recruiter',
  'Practical evidence-based fit assessment for this specific role and whether it is a reasonable opportunity to continue exploring',
] as const;
