import { z } from 'zod';
import { RECRUITER_AGENT_ACTION_TYPES } from './action/recruiter-agent-action.types';
import { RECRUITER_RESEARCH_DEPTHS } from './recruiter-research-policy';

export const cheapRecruiterEmailClassificationSchema = z.object({
  isRelevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  emailType: z.enum([
    'RECRUITER_OUTREACH',
    'INTERVIEW_INVITATION',
    'INTERVIEW_SCHEDULING',
    'INTERVIEW_UPDATE',
    'HIRING_PROCESS_UPDATE',
    'APPLICATION_CONFIRMATION',
    'IRRELEVANT',
  ]),
  companyName: z.string().nullable(),
  roleTitle: z.string().nullable(),
  reason: z.string(),
});

export const recruiterEmailAnalysisSchema = z
  .object({
    companyName: z.string().nullable(),
    roleTitle: z.string().nullable(),
    recruiterName: z.string().nullable(),
    eventType: z.enum([
      'RECRUITER_OUTREACH',
      'INTERVIEW_INVITATION',
      'INTERVIEW_SCHEDULING',
      'INTERVIEW_RESCHEDULE',
      'INTERVIEW_CANCELLATION',
      'HIRING_PROCESS_UPDATE',
      'OTHER_RELEVANT',
    ]),
    stage: z.string().nullable(),
    summary: z.string(),
    actionRequired: z.boolean(),
    requestedAction: z.string().nullable(),
    interview: z
      .object({
        date: z.string().nullable(),
        time: z.string().nullable(),
        location: z.string().nullable(),
        meetingUrl: z.string().nullable(),
      })
      .nullable(),
    companyResearchNeeded: z.boolean(),
    researchDepth: z.enum(RECRUITER_RESEARCH_DEPTHS),
    researchReason: z.string().trim().min(1).max(500),
    nextAction: z.enum(RECRUITER_AGENT_ACTION_TYPES),
  })
  .superRefine((analysis, context) => {
    if (!analysis.companyName?.trim() && analysis.researchDepth !== 'NONE') {
      context.addIssue({
        code: 'custom',
        path: ['researchDepth'],
        message: 'Unknown company requires NONE.',
      });
    }
    if (
      analysis.nextAction === 'RESEARCH_COMPANY' &&
      (analysis.researchDepth === 'NONE' || !analysis.companyResearchNeeded)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextAction'],
        message:
          'Company research requires QUICK/FULL and companyResearchNeeded.',
      });
    }
  });

export function readSavedRecruiterAnalysis(
  value: unknown,
): RecruiterEmailAnalysis {
  const saved = z.record(z.string(), z.unknown()).parse(value);
  if (saved.researchDepth === undefined) {
    return recruiterEmailAnalysisSchema.parse({
      ...saved,
      researchDepth: 'NONE',
      researchReason:
        'Legacy analysis has no research-depth authorization; automatic company research skipped.',
      companyResearchNeeded: false,
      nextAction:
        saved.nextAction === 'RESEARCH_COMPANY'
          ? 'NO_ACTION'
          : saved.nextAction,
    });
  }
  return recruiterEmailAnalysisSchema.parse(saved);
}

export type CheapRecruiterEmailClassification = z.infer<
  typeof cheapRecruiterEmailClassificationSchema
>;
export type RecruiterEmailAnalysis = z.infer<
  typeof recruiterEmailAnalysisSchema
>;
export type RecruiterAgentNextAction = RecruiterEmailAnalysis['nextAction'];
