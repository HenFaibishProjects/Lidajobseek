import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export type EvidenceLevel = 'strong' | 'partial' | 'limited';
export type HandoffStatus =
  | 'PENDING_CHATGPT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface EmployeeCountExact {
  count: number;
  approximate: boolean;
}

export interface EmployeeCountRange {
  min: number;
  max: number;
  approximate: true;
}

export type EmployeeCount = EmployeeCountExact | EmployeeCountRange;

export interface CompanyEmployees {
  israel: EmployeeCount | null;
  israelEngineering: EmployeeCount | null;
  global: EmployeeCount | null;
  verificationNote: string | null;
}

export interface CompanyLocation {
  city: string | null;
  address: string | null;
  building: string | null;
  floor: string | null;
  buildingFloors: number | null;
  companyFloors: string | null;
  campus: string | null;
  verificationNote: string | null;
}

export interface RelevantRole {
  title: string;
  location: string | null;
  workModel: string | null;
  matchScore: number | null;
  url: string;
}

export interface CompanyResearchSource {
  title: string;
  url: string;
  sourceType: string;
}

export interface PublicSignal {
  title: string;
  observation: string;
  interpretation: string;
  candidateImplication: string | null;
  confidence: 'high' | 'medium' | 'low';
  signalType: 'green' | 'yellow' | 'red';
  sourceKind: string;
  corroborated: boolean;
  sourceUrls: string[];
}

export interface CompanyResearchReport {
  companyName: string;
  whatTheyDo: string;
  employees: CompanyEmployees;
  location: CompanyLocation;
  workModel: string | null;
  relevantRoles: RelevantRole[];
  greenFlags: string[];
  redFlags: string[];
  website: string | null;
  researchedAt: string;
  publicSignals: PublicSignal[];
  overallAssessment: {
    summary: string | null;
    findings: Array<{
      statement: string;
      status: 'verified' | 'inferred' | 'conflicting';
      sourceUrls: string[];
    }>;
  } | null;
  details: {
    companySummary: string;
    productSummary: string;
    businessModel: string | null;
    companySizeSummary: string | null;
    engineeringSummary: string | null;
    technologySummary: string | null;
    stabilitySummary: string | null;
    employeeSentimentSummary: string | null;
    recentImportantEvents: string[];
    questionsToAskRecruiter: string[];
  };
  sources: CompanyResearchSource[];
  researchQuality: {
    origin?: 'chatgpt-import';
    evidenceLevel: EvidenceLevel;
    officeEvidenceLevel: EvidenceLevel | null;
    limitations: string[];
  } | null;
  cache: {
    company: 'hit' | 'refreshed';
    roles: 'hit' | 'refreshed' | 'not-requested';
    companyRefreshedAt: string;
    rolesRefreshedAt: string | null;
  } | null;
}

export interface MatchedJob {
  title: string;
  team: string | null;
  location: string | null;
  workModel: string | null;
  matchScore: number;
  matchLevel: 'strong' | 'good' | 'possible';
  matchSummary: string;
  matchedSkills: string[];
  transferableExperience: string[];
  gaps: string[];
  concerns: string[];
  url: string;
  evidenceLevel: 'page-read' | 'search-snippet';
}

export interface JobMatchResult {
  companyName: string;
  summary: string;
  jobsScanned: number;
  relevantJobs: MatchedJob[];
  limitations: string[];
  cache: {
    status: 'hit' | 'refreshed';
    refreshedAt: string;
  };
}

export interface CompanyHistoryItem {
  companyId: string;
  companyName: string;
  website: string | null;
  researchedAt: string;
  manuallyUpdatedAt: string | null;
  whatTheyDo: string | null;
  city: string | null;
  evidenceLevel: EvidenceLevel | null;
  researchOrigin?: 'chatgpt-import';
}

export interface CompanyHistoryDetail {
  companyId: string;
  researchedAt: string;
  manuallyUpdatedAt: string | null;
  report: CompanyResearchReport;
}

export interface ResearchHandoffSummary {
  id: string;
  companyName: string;
  roleTitle: string | null;
  eventType: string;
  researchReason: string;
  status: HandoffStatus;
  createdAt: string;
  notificationSentAt: string | null;
}

export interface ResearchHandoffDetail extends ResearchHandoffSummary {
  recruiterName: string | null;
  existingReportId: string | null;
  context: unknown;
  requestedResearch: string[];
  chatGptPrompt: string;
  deepResearchResult: unknown | null;
  notificationError: string | null;
  notificationAttempts: number;
  completedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class CompanyIntelligenceService {
  private readonly baseUrl = `${environment.apiUrl}/api/intelligence`;

  constructor(private readonly http: HttpClient) {}

  researchCompany(companyName: string, role?: string, forceRefresh = false) {
    return this.http.post<CompanyResearchReport>(
      `${this.baseUrl}/company/research`,
      {
        companyName,
        provider: 'openai',
        forceRefresh,
        ...(role?.trim() ? { role: role.trim() } : {}),
      },
    );
  }

  matchJobs(companyName: string, forceRefresh = false) {
    return this.http.post<JobMatchResult>(`${this.baseUrl}/jobs/match`, {
      companyName,
      provider: 'openai',
      forceRefresh,
    });
  }

  listHistory() {
    return this.http.get<CompanyHistoryItem[]>(
      `${this.baseUrl}/company/history`,
    );
  }

  getHistoryDetail(companyId: string) {
    return this.http.get<CompanyHistoryDetail>(
      `${this.baseUrl}/company/history/${encodeURIComponent(companyId)}`,
    );
  }

  deleteHistory(companyId: string) {
    return this.http.delete<void>(
      `${this.baseUrl}/company/history/${encodeURIComponent(companyId)}`,
    );
  }

  listPendingHandoffs(limit = 20, offset = 0) {
    return this.http.get<ResearchHandoffSummary[]>(
      `${this.baseUrl}/research-handoffs/pending`,
      { params: { limit, offset } },
    );
  }

  getHandoff(id: string) {
    return this.http.get<ResearchHandoffDetail>(
      `${this.baseUrl}/research-handoffs/${encodeURIComponent(id)}`,
    );
  }

  startHandoff(id: string) {
    return this.http.post<ResearchHandoffDetail>(
      `${this.baseUrl}/research-handoffs/${encodeURIComponent(id)}/start`,
      {},
    );
  }

  importHandoffResearch(id: string, content: string) {
    return this.http.post<{
      handoffId: string;
      reportId: string;
      companyId: string;
      importedAt: string;
      reused: boolean;
    }>(
      `${this.baseUrl}/research-handoffs/${encodeURIComponent(id)}/import`,
      { content },
    );
  }
}
