import { z } from 'zod';
import { providerSchema } from '../company-intelligence/company-research-request.schema';

export const jobMatchRequestSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  provider: providerSchema.default('openai'),
  forceRefresh: z.boolean().default(false),
});
export type JobMatchRequest = z.output<typeof jobMatchRequestSchema>;

export const matchLevelSchema = z.enum(['strong', 'good', 'possible']);
export type MatchLevel = z.infer<typeof matchLevelSchema>;
export const jobEvidenceLevelSchema = z.enum(['page-read', 'search-snippet']);
export type JobEvidenceLevel = z.infer<typeof jobEvidenceLevelSchema>;

const shortText = z.string().trim().min(1).max(500);
const shortList = z.array(shortText).max(12);

export const matchedJobSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  team: shortText.nullable(),
  location: shortText.nullable(),
  workModel: shortText.nullable(),
  matchScore: z.number().int().min(0).max(100),
  matchLevel: matchLevelSchema,
  matchSummary: z.string().trim().min(1).max(1000),
  matchedSkills: shortList,
  transferableExperience: shortList,
  gaps: shortList,
  concerns: shortList,
  url: z.string().max(2048),
  evidenceLevel: jobEvidenceLevelSchema,
});
export type MatchedJob = z.infer<typeof matchedJobSchema>;

export const jobMatchContentSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  jobsScanned: z.number().int().min(0),
  relevantJobs: z.array(matchedJobSchema).max(10),
  limitations: z.array(z.string().trim().min(1).max(500)).max(10),
});
export type JobMatchContent = z.infer<typeof jobMatchContentSchema>;

export const jobMatchCacheMetadataSchema = z.strictObject({
  status: z.enum(['hit', 'refreshed']),
  refreshedAt: z.iso.datetime(),
});

export const jobMatchResultSchema = jobMatchContentSchema.extend({
  cache: jobMatchCacheMetadataSchema,
});
export type JobMatchResult = z.infer<typeof jobMatchResultSchema>;

export const requirementRelationSchema = z.enum([
  'direct',
  'transferable',
  'limited',
  'none',
  'unknown',
]);
export type RequirementRelation = z.infer<typeof requirementRelationSchema>;

const llmRequirementAssessmentSchema = z.strictObject({
  requirement: z.string(),
  importance: z.enum(['required', 'preferred']),
  relation: requirementRelationSchema,
  profileSkills: z.array(z.string()),
  note: z.string().nullable(),
});
export type LlmRequirementAssessment = z.infer<
  typeof llmRequirementAssessmentSchema
>;

const llmJobAssessmentSchema = z.strictObject({
  jobId: z.string(),
  title: z.string().nullable(),
  team: z.string().nullable(),
  location: z.string().nullable(),
  locationRegion: z.enum([
    'israel',
    'remote-israel-eligible',
    'abroad',
    'unknown',
  ]),
  workModel: z.string().nullable(),
  workArrangement: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  officeDaysPerWeek: z.number().nullable(),
  roleFit: z.enum(['core', 'adjacent', 'weak', 'unrelated']),
  seniorityFit: z.enum(['match', 'above', 'below', 'unknown']),
  vacancyStatus: z.enum(['appears-open', 'unclear', 'closed']),
  requirements: z.array(llmRequirementAssessmentSchema),
  matchSummary: z.string(),
  concerns: z.array(z.string()),
});
export type LlmJobAssessment = z.infer<typeof llmJobAssessmentSchema>;

export const llmJobMatchSchema = z.strictObject({
  jobs: z.array(llmJobAssessmentSchema),
});
export type LlmJobMatch = z.infer<typeof llmJobMatchSchema>;
