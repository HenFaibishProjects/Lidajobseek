import { z } from 'zod';
import {
  recruiterEmailAnalysisSchema,
  readSavedRecruiterAnalysis,
} from './recruiter-email.schema';
import type { EmailProcessingAuditEntity } from './audit/email-processing-audit.entity';

export const recruiterEmailDecisionSchema = z
  .object({
    ...recruiterEmailAnalysisSchema.shape,
    isRelevant: z.boolean(),
    confidence: z.number().min(0).max(1),
    companyName: z.string().trim().min(1).max(200).nullable(),
    summary: z.string().max(1500),
    eventType: z.enum([
      ...recruiterEmailAnalysisSchema.shape.eventType.options,
      'IRRELEVANT',
    ]),
  })
  .superRefine((decision, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: 'custom', path: ['researchDepth'], message });
    if (!decision.companyName && decision.researchDepth !== 'NONE')
      invalid('Unknown company requires NONE.');
    if (
      !decision.isRelevant &&
      (decision.researchDepth !== 'NONE' || decision.nextAction !== 'NO_ACTION')
    )
      invalid('Irrelevant messages require NONE and NO_ACTION.');
    if (decision.eventType === 'IRRELEVANT' && decision.isRelevant)
      invalid('IRRELEVANT event cannot be relevant.');
    if (decision.researchDepth === 'NONE') {
      if (
        decision.companyResearchNeeded ||
        !['NO_ACTION', 'USE_EXISTING_COMPANY'].includes(decision.nextAction)
      )
        invalid('NONE stops without research or other external actions.');
    } else if (
      decision.nextAction !== 'RESEARCH_COMPANY' ||
      !decision.companyResearchNeeded
    )
      invalid(
        'QUICK/FULL require a research request. FULL is a manual ChatGPT handoff.',
      );
  });
export type RecruiterEmailDecision = z.infer<
  typeof recruiterEmailDecisionSchema
>;

export function savedLegacyDecision(
  state: EmailProcessingAuditEntity,
): RecruiterEmailDecision | null {
  if (state.expensiveLlmResult) {
    const analysis = readSavedRecruiterAnalysis(state.expensiveLlmResult);
    const isRelevant = state.cheapLlmClassification?.isRelevant ?? true;
    const researchDepth =
      isRelevant && analysis.companyName?.trim()
        ? analysis.researchDepth
        : 'NONE';
    return recruiterEmailDecisionSchema.parse({
      ...analysis,
      companyName: analysis.companyName?.trim() || null,
      isRelevant,
      confidence: state.cheapLlmClassification?.confidence ?? 0,
      summary: analysis.summary.slice(0, 1500),
      researchDepth,
      companyResearchNeeded: researchDepth !== 'NONE',
      nextAction: researchDepth === 'NONE' ? 'NO_ACTION' : 'RESEARCH_COMPANY',
    });
  }
  const cheap = state.cheapLlmClassification;
  if (cheap?.isRelevant === false)
    return recruiterEmailDecisionSchema.parse({
      isRelevant: false,
      confidence: cheap.confidence,
      companyName: cheap.companyName?.trim() || null,
      roleTitle: cheap.roleTitle,
      recruiterName: null,
      eventType: 'IRRELEVANT',
      stage: null,
      summary: 'Legacy irrelevant classification.',
      actionRequired: false,
      requestedAction: null,
      interview: null,
      researchDepth: 'NONE',
      researchReason: cheap.reason.slice(0, 500) || 'No research needed.',
      companyResearchNeeded: false,
      nextAction: 'NO_ACTION',
    });
  return null;
}
