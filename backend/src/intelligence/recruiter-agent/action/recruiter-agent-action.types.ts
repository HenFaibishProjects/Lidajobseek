import type { ResearchHandoffStatus } from '../handoff/research-handoff.types';
import type { CompanyReport } from '../../company-intelligence/company-report.schema';
import type { JobMatchResult } from '../../job-matching/job-match.schema';
import type { RecruiterResearchDepth } from '../recruiter-research-policy';

export const RECRUITER_AGENT_ACTION_TYPES = [
  'RESEARCH_COMPANY',
  'USE_EXISTING_COMPANY',
  'PREPARE_INTERVIEW_CONTEXT',
  'MATCH_JOB_TO_PROFILE',
  'DRAFT_REPLY',
  'NO_ACTION',
] as const;

export type RecruiterAgentActionType =
  (typeof RECRUITER_AGENT_ACTION_TYPES)[number];

export enum RecruiterAgentActionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEFERRED = 'DEFERRED',
}

export const MAX_ACTION_ATTEMPTS = 3;

export type RecruiterAgentActionResult =
  | {
      handoffId: string;
      companyName: string;
      researchDepth: 'FULL';
      existingReportId: string | null;
      status: ResearchHandoffStatus;
    }
  | {
      reportId: string;
      companyName: string;
      researchedAt: string;
      researchDepth?: Exclude<RecruiterResearchDepth, 'NONE'>;
      cache: CompanyReport['cache'];
    }
  | {
      companyName: string;
      summary: string;
      jobsScanned: number;
      relevantJobCount: number;
      cache: JobMatchResult['cache'];
    }
  | { reason: string };

export interface RecruiterAgentActionExecutionResult {
  status:
    RecruiterAgentActionStatus.COMPLETED | RecruiterAgentActionStatus.DEFERRED;
  result: RecruiterAgentActionResult | null;
}

export class RecruiterAgentActionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RecruiterAgentActionError';
  }
}
