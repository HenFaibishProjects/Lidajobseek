import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RECRUITER_RESEARCH_PROVIDER,
  DEFAULT_RECRUITER_RESEARCH_MODEL,
} from '../../config/environment';
import type { LlmProvider } from '../../company-intelligence/company-research-request.schema';
import { CompanyIntelligenceService } from '../../company-intelligence/company-intelligence.service';
import { ResearchHandoffService } from '../handoff/research-handoff.service';
import {
  recruiterEmailDecisionSchema,
  type RecruiterEmailDecision,
} from '../recruiter-email-decision.schema';
import { ResearchError } from '../../company-intelligence/research-error';
import { JobMatchingService } from '../../job-matching/job-matching.service';
import { RecruiterAgentActionEntity } from '../action/recruiter-agent-action.entity';
import { RecruiterAgentActionRepository } from '../action/recruiter-agent-action.repository';
import {
  RecruiterAgentActionError,
  RecruiterAgentActionStatus,
} from '../action/recruiter-agent-action.types';
import type {
  RecruiterAgentActionExecutionResult,
  RecruiterAgentActionResult,
} from '../action/recruiter-agent-action.types';
import type { RecruiterEmailAnalysis } from '../recruiter-email.schema';
import { recruiterEmailAnalysisSchema } from '../recruiter-email.schema';

@Injectable()
export class RecruiterAgentActionService {
  private readonly logger = new Logger(RecruiterAgentActionService.name);

  constructor(
    private readonly actions: RecruiterAgentActionRepository,
    private readonly companies: CompanyIntelligenceService,
    private readonly jobs: JobMatchingService,
    private readonly config: ConfigService,
    private readonly handoffs: ResearchHandoffService,
  ) {}

  async execute(
    gmailMessageId: string,
    analysis: RecruiterEmailAnalysis | RecruiterEmailDecision,
    emailProcessingAttempt: number,
  ): Promise<RecruiterAgentActionExecutionResult> {
    if ('isRelevant' in analysis) recruiterEmailDecisionSchema.parse(analysis);
    else recruiterEmailAnalysisSchema.parse(analysis);
    const existing = await this.actions.createOrFind(
      gmailMessageId,
      analysis.nextAction,
    );
    if (
      existing.status === RecruiterAgentActionStatus.COMPLETED ||
      existing.status === RecruiterAgentActionStatus.DEFERRED
    ) {
      this.log('recruiter-action-reused', existing);
      return { status: existing.status, result: existing.result };
    }
    const action = await this.actions.claim(
      gmailMessageId,
      analysis.nextAction,
      emailProcessingAttempt,
    );
    if (!action) {
      const current = await this.actions.find(
        gmailMessageId,
        analysis.nextAction,
      );
      if (
        current.status === RecruiterAgentActionStatus.COMPLETED ||
        current.status === RecruiterAgentActionStatus.DEFERRED
      ) {
        this.log('recruiter-action-reused', current);
        return { status: current.status, result: current.result };
      }
      throw new RecruiterAgentActionError(
        'Action is already running, exhausted, or email attempt is no longer owned.',
      );
    }

    this.log('recruiter-action-started', action);
    try {
      if (
        action.actionType === 'DRAFT_REPLY' ||
        action.actionType === 'PREPARE_INTERVIEW_CONTEXT'
      ) {
        const deferred = await this.actions.defer(action);
        this.log('recruiter-action-deferred', action);
        return {
          status: RecruiterAgentActionStatus.DEFERRED,
          result: deferred.result,
        };
      }
      const result = await this.run(action, analysis);
      await this.actions.complete(action, result);
      this.log('recruiter-action-completed', action);
      return { status: RecruiterAgentActionStatus.COMPLETED, result };
    } catch (error) {
      const failure = this.toActionError(action, error);
      await this.actions.fail(action, failure);
      this.logger.error({
        event: 'recruiter-action-failed',
        gmailMessageId,
        actionType: action.actionType,
        attempt: action.attempts,
        error: failure.message,
      });
      throw failure;
    }
  }

  recoverExhausted(gmailMessageId: string): Promise<void> {
    return this.actions.recoverExhausted(gmailMessageId);
  }

  async deferLegacyResearch(
    gmailMessageId: string,
    emailProcessingAttempt: number,
  ): Promise<void> {
    const action = await this.actions.deferLegacyResearch(
      gmailMessageId,
      emailProcessingAttempt,
    );
    if (action) this.log('recruiter-action-deferred', action);
  }

  private async run(
    action: RecruiterAgentActionEntity,
    analysis: RecruiterEmailAnalysis | RecruiterEmailDecision,
  ): Promise<RecruiterAgentActionResult> {
    switch (action.actionType) {
      case 'RESEARCH_COMPANY': {
        if (analysis.researchDepth === 'NONE')
          throw new RecruiterAgentActionError(
            'Research depth NONE cannot execute company research.',
          );
        const companyName = this.requireCompanyName(analysis);
        const provider =
          this.config.get<LlmProvider>('RECRUITER_RESEARCH_PROVIDER') ??
          DEFAULT_RECRUITER_RESEARCH_PROVIDER;
        const modelName =
          this.config.get<string>('RECRUITER_RESEARCH_MODEL')?.trim() ||
          DEFAULT_RECRUITER_RESEARCH_MODEL;
        const mode = 'QUICK';
        this.logger.log({
          event: 'recruiter-research-selected',
          gmailMessageId: action.gmailMessageId,
          actionType: action.actionType,
          attempt: action.attempts,
          researchDepth: analysis.researchDepth,
          provider,
          model: modelName,
        });
        const existingReport =
          analysis.researchDepth === 'FULL'
            ? await this.handoffs.findFreshResearch(companyName)
            : null;
        const report =
          existingReport ??
          (await this.companies.research(
            {
              companyName,
              role: analysis.roleTitle ?? undefined,
              provider,
              forceRefresh: false,
            },
            mode,
            { modelName, companyOnly: true },
          ));
        this.logger.log({
          event: 'recruiter-research-finished',
          gmailMessageId: action.gmailMessageId,
          researchDepth: analysis.researchDepth,
          provider,
          model: modelName,
          cache: report.cache,
        });
        if (analysis.researchDepth === 'FULL') {
          const handoff = await this.handoffs.ensure(
            action.gmailMessageId,
            analysis,
            report,
          );
          return {
            handoffId: handoff.id,
            companyName,
            researchDepth: 'FULL',
            existingReportId: handoff.existingReportId,
            status: handoff.status,
          };
        }
        return {
          reportId: report.id,
          companyName: report.companyName,
          researchedAt: report.researchedAt,
          researchDepth: analysis.researchDepth,
          cache: report.cache,
        };
      }
      case 'MATCH_JOB_TO_PROFILE': {
        const companyName = this.requireCompanyName(analysis);
        const matches = await this.jobs.match({
          companyName,
          provider: 'openai',
          forceRefresh: false,
        });
        return {
          companyName: matches.companyName,
          summary: matches.summary,
          jobsScanned: matches.jobsScanned,
          relevantJobCount: matches.relevantJobs.length,
          cache: matches.cache,
        };
      }
      case 'USE_EXISTING_COMPANY':
      case 'NO_ACTION':
        return { reason: 'No external work required.' };
      default:
        throw new RecruiterAgentActionError('Unsupported recruiter action.');
    }
  }

  private requireCompanyName(
    analysis: RecruiterEmailAnalysis | RecruiterEmailDecision,
  ): string {
    const companyName = analysis.companyName?.trim();
    if (!companyName) {
      throw new RecruiterAgentActionError(
        `Company name is required for ${analysis.nextAction}.`,
      );
    }
    return companyName;
  }

  private toActionError(
    action: RecruiterAgentActionEntity,
    error: unknown,
  ): RecruiterAgentActionError {
    if (error instanceof RecruiterAgentActionError) return error;
    const code = error instanceof ResearchError ? ` (${error.code})` : '';
    return new RecruiterAgentActionError(
      `${action.actionType} execution failed${code}.`,
      error,
    );
  }

  private log(event: string, action: RecruiterAgentActionEntity): void {
    this.logger.log({
      event,
      gmailMessageId: action.gmailMessageId,
      actionType: action.actionType,
      attempt: action.attempts,
    });
  }
}
