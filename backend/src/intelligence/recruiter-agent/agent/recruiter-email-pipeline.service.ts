import { Injectable, Logger } from '@nestjs/common';
import { EmailProcessingAuditService } from '../audit/email-processing-audit.service';
import { RecruiterEmailDecisionService } from './recruiter-email-decision.service';
import { RecruiterAgentActionService } from './recruiter-agent-action.service';
import {
  recruiterEmailDecisionSchema,
  savedLegacyDecision,
} from '../recruiter-email-decision.schema';
import type {
  IncomingEmail,
  RecruiterEmailPrefilterResult,
} from '../recruiter-agent.types';

@Injectable()
export class RecruiterEmailPipelineService {
  private readonly logger = new Logger(RecruiterEmailPipelineService.name);
  constructor(
    private readonly audit: EmailProcessingAuditService,
    private readonly decisionService: RecruiterEmailDecisionService,
    private readonly actions: RecruiterAgentActionService,
  ) {}

  async process(
    email: IncomingEmail,
    prefilter: RecruiterEmailPrefilterResult,
  ): Promise<void> {
    await this.audit.create(email, prefilter.decision, prefilter.reasons);
    await this.actions.recoverExhausted(email.id);
    const state = await this.audit.claim(
      email.id,
      prefilter.shouldAnalyze,
      prefilter.decision,
      prefilter.reasons,
    );
    if (!state) return;
    const attempt = state.processingAttempts;
    try {
      if (!prefilter.shouldAnalyze) {
        await this.audit.complete(email.id, attempt);
        return;
      }
      const decision = state.decisionLlmResult
        ? recruiterEmailDecisionSchema.parse(state.decisionLlmResult)
        : (savedLegacyDecision(state) ??
          (await this.decisionService.decide(email, attempt)));
      if (!state.decisionLlmResult)
        await this.audit.saveDecisionLlmResult(email.id, decision, attempt);
      if (
        state.expensiveLlmResult?.researchDepth === undefined &&
        state.expensiveLlmResult?.nextAction === 'RESEARCH_COMPANY'
      ) {
        await this.actions.deferLegacyResearch(email.id, attempt);
      }
      this.logger.log({
        event: 'recruiter-decision-ready',
        gmailMessageId: email.id,
        researchDepth: decision.researchDepth,
        reused: Boolean(state.decisionLlmResult || state.expensiveLlmResult),
      });
      if (decision.isRelevant && decision.researchDepth !== 'NONE')
        await this.actions.execute(email.id, decision, attempt);
      await this.audit.complete(email.id, attempt);
    } catch (error) {
      await this.audit.fail(email.id, attempt, error);
      throw error;
    }
  }
}
