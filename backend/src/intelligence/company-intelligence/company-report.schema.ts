import { z } from 'zod';
import { isResearchLimitation } from './research-quality';
import { cleanOfficeValue } from './location-intelligence';
import { isAllowedResearchUrl } from './research-url';
import type { ResearchSource } from './tavily.service';
import { classifyCompanySource } from './company-source';
import {
  classifyPublicSource,
  validateOverallAssessment,
  validatePublicSignals,
} from './public-intelligence';
import { ResearchError } from './research-error';
import { providerSchema } from './company-research-request.schema';
import { researchModeSchema } from './research-mode';
import { candidateProfileStatusSchema } from '../candidate-profile/candidate-profile';
import {
  interviewInsightsSchema,
  workplaceSignalsSchema,
  groundedResearchInsights,
} from './company-research-insights';

const sourceTypeSchema = z.enum([
  'company-site',
  'news',
  'engineering',
  'employee-review',
  'job-posting',
  'social',
  'event',
  'other',
]);
const sourceSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  sourceType: sourceTypeSchema,
});

export const signalConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const publicSignalSchema = z.strictObject({
  title: z.string(),
  observation: z.string(),
  interpretation: z.string(),
  candidateImplication: z.string().nullable(),
  confidence: signalConfidenceSchema,
  signalType: z.enum(['green', 'yellow', 'red']),
  sourceKind: z.enum([
    'leadership',
    'recruiter',
    'employee',
    'company',
    'third-party',
  ]),
  corroborated: z.boolean(),
  sourceUrls: z.array(z.string()),
});
export type PublicSignal = z.infer<typeof publicSignalSchema>;
export const evidenceFindingSchema = z.strictObject({
  statement: z.string(),
  status: z.enum(['verified', 'inferred', 'conflicting']),
  sourceUrls: z.array(z.string()),
});
export const overallAssessmentSchema = z.strictObject({
  summary: z.string().nullable(),
  findings: z.array(evidenceFindingSchema),
});
export type OverallAssessment = z.infer<typeof overallAssessmentSchema>;

export const COMPANY_FACT_FIELDS = [
  'businessModel',
  'companySizeSummary',
  'officeLocationSummary',
  'workModelSummary',
  'engineeringSummary',
  'technologySummary',
  'stabilitySummary',
  'employeeSentimentSummary',
] as const;

function evidenceFact<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, supported: z.boolean() });
}
const optionalFact = evidenceFact(z.string().nullable());
const factualItem = evidenceFact(z.string());

export const companyLocationSchema = z.strictObject({
  city: z.string().nullable(),
  address: z.string().nullable(),
  building: z.string().nullable(),
  floor: z.string().nullable(),
  buildingFloors: z.number().int().positive().max(300).nullable().default(null),
  companyFloors: z.string().nullable().default(null),
  campus: z.string().nullable().default(null),
  verificationNote: z.string().nullable(),
});
export const employeeCountSchema = z.union([
  z.strictObject({
    count: z.number().int().nonnegative(),
    approximate: z.boolean(),
  }),
  z.strictObject({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    approximate: z.literal(true),
  }),
]);
export const employeesSchema = z.strictObject({
  israel: employeeCountSchema.nullable(),
  israelEngineering: employeeCountSchema.nullable(),
  global: employeeCountSchema.nullable(),
  verificationNote: z.string().nullable(),
});
export const quickBriefSchema = z.strictObject({
  whatTheyDo: z.string(),
  workModel: z.string().nullable(),
  greenFlags: z.array(z.string()),
  redFlags: z.array(z.string()),
  employees: employeesSchema.optional(),
});
const llmLocationSchema = z.strictObject({
  city: optionalFact,
  address: optionalFact,
  building: optionalFact,
  floor: optionalFact,
});
const llmEmployeesSchema = z.strictObject({
  israel: evidenceFact(employeeCountSchema.nullable()),
  israelEngineering: evidenceFact(employeeCountSchema.nullable()),
  global: evidenceFact(employeeCountSchema.nullable()),
  verificationNote: z.string().nullable(),
});
const llmBriefSchema = z.strictObject({
  whatTheyDo: z.string(),
  workModel: optionalFact,
  greenFlags: z.array(z.string()),
  redFlags: z.array(z.string()),
  employees: llmEmployeesSchema,
});

const roleAssessmentSchema = z.strictObject({
  url: z.string(),
  matchScore: z.number().nullable(),
  matchSummary: z.string(),
  matchedSkills: z.array(z.string()),
  gaps: z.array(z.string()),
});
export const llmRelevantRoleSchema = roleAssessmentSchema.extend({
  title: optionalFact,
  location: optionalFact,
  workModel: optionalFact,
  requirements: z.array(factualItem),
});

// Deliberately excludes URL/date formats and application-only refinements.
export const llmCompanyReportSchema = z.strictObject({
  companySummary: z.string(),
  quickBrief: llmBriefSchema,
  location: llmLocationSchema,
  productSummary: z.string(),
  businessModel: optionalFact,
  companySizeSummary: optionalFact,
  officeLocationSummary: optionalFact,
  workModelSummary: optionalFact,
  engineeringSummary: optionalFact,
  technologySummary: optionalFact,
  stabilitySummary: optionalFact,
  recentImportantEvents: z.array(factualItem),
  employeeSentimentSummary: optionalFact,
  greenFlags: z.array(z.string()),
  redFlags: z.array(z.string()),
  questionsToAskRecruiter: z.array(z.string()),
  roleDiscoverySummary: z.string().nullable(),
  relevantRoles: z.array(llmRelevantRoleSchema),
  sources: z.array(sourceSchema),
  publicSignals: z.array(publicSignalSchema),
  overallAssessment: overallAssessmentSchema,
  interviewInsights: interviewInsightsSchema.nullable(),
  workplaceSignals: workplaceSignalsSchema.nullable(),
});

export const llmCompanyOnlySchema = llmCompanyReportSchema.omit({
  relevantRoles: true,
  roleDiscoverySummary: true,
});
export const llmRolesOnlySchema = llmCompanyReportSchema.pick({
  relevantRoles: true,
  roleDiscoverySummary: true,
  sources: true,
});
export const llmQuickCompanySchema = z.object({
  companySummary: z.string(),
  productSummary: z.string(),
  quickBrief: llmBriefSchema,
  businessModel: optionalFact,
  engineeringSummary: optionalFact,
  technologySummary: optionalFact,
  greenFlags: z.array(z.string()),
  redFlags: z.array(z.string()),
  questionsToAskRecruiter: z.array(z.string()),
  sources: z.array(sourceSchema),
});
export type LlmQuickCompanyOutput = z.infer<typeof llmQuickCompanySchema>;

const text = z.string().trim().min(1).max(6000);
const optionalText = text.nullable();
const list = z.array(z.string().trim().min(1).max(1500)).max(20);
const safeUrl = z
  .string()
  .max(2048)
  .refine(isAllowedResearchUrl, 'Expected a public HTTP(S) URL');
export const relevantRoleSchema = roleAssessmentSchema.extend({
  title: z.string().trim().min(1).max(300),
  url: safeUrl,
  location: z.string().trim().min(1).max(500).nullable(),
  workModel: z.string().trim().min(1).max(500).nullable(),
  requirements: list,
  matchScore: z.number().int().min(0).max(100).nullable(),
  matchSummary: text,
  matchedSkills: list,
  gaps: list,
});
export const persistedRelevantRoleSchema = relevantRoleSchema.extend({
  evidenceLevel: z.enum(['page-read', 'search-snippet']),
  evidenceSummary: z.string().min(1),
});

export const companyReportDraftSchema = llmCompanyReportSchema.extend({
  interviewInsights: interviewInsightsSchema.nullable().default(null),
  workplaceSignals: workplaceSignalsSchema.nullable().default(null),
  companySummary: text,
  quickBrief: quickBriefSchema,
  location: companyLocationSchema,
  productSummary: text,
  businessModel: optionalText,
  companySizeSummary: optionalText,
  officeLocationSummary: optionalText,
  workModelSummary: optionalText,
  engineeringSummary: optionalText,
  technologySummary: optionalText,
  stabilitySummary: optionalText,
  recentImportantEvents: list,
  employeeSentimentSummary: optionalText,
  greenFlags: list,
  redFlags: list,
  questionsToAskRecruiter: list,
  roleDiscoverySummary: optionalText,
  relevantRoles: z
    .array(
      relevantRoleSchema.extend({
        title: z.string().trim().max(300),
        omittedFacts: z.array(z.string()).optional(),
      }),
    )
    .max(10),
  sources: z
    .array(
      sourceSchema.extend({
        title: z.string().trim().min(1).max(2048),
        url: safeUrl,
      }),
    )
    .min(1)
    .max(25),
  publicSignals: z.array(publicSignalSchema).max(20).default([]),
  overallAssessment: overallAssessmentSchema.nullable().default(null),
});
export const companyReportContentSchema = companyReportDraftSchema.extend({
  website: safeUrl.nullable(),
});
export const roleValidatedReportSchema = companyReportContentSchema.extend({
  relevantRoles: z.array(persistedRelevantRoleSchema).max(10),
});
export const researchOriginSchema = z.enum(['chatgpt-import']);
export const researchQualitySchema = z.strictObject({
  origin: researchOriginSchema.optional(),
  evidenceLevel: z.enum(['strong', 'partial', 'limited']),
  officeEvidenceLevel: z
    .enum(['strong', 'partial', 'limited'])
    .nullable()
    .optional(),
  sourcesDiscovered: z.number().int().min(0),
  pagesRead: z.number().int().min(0),
  limitations: z.array(z.string().min(1)),
});
export const persistedCompanyReportContentSchema =
  roleValidatedReportSchema.extend({
    sources: z
      .array(companyReportDraftSchema.shape.sources.element)
      .min(1)
      .max(75),
    reportLanguage: z.literal('he-IL'),
    researchQuality: researchQualitySchema.nullable(),
  });
export type RoleValidatedReportContent = z.infer<
  typeof roleValidatedReportSchema
>;
export type ResearchQuality = z.infer<typeof researchQualitySchema>;

const UNSUPPORTED_FACT = { value: null, supported: false };

export function expandQuickCompanyOutput(
  output: LlmQuickCompanyOutput,
): z.infer<typeof llmCompanyReportSchema> {
  return {
    ...output,
    location: {
      city: UNSUPPORTED_FACT,
      address: UNSUPPORTED_FACT,
      building: UNSUPPORTED_FACT,
      floor: UNSUPPORTED_FACT,
    },
    companySizeSummary: UNSUPPORTED_FACT,
    officeLocationSummary: UNSUPPORTED_FACT,
    workModelSummary: UNSUPPORTED_FACT,
    stabilitySummary: UNSUPPORTED_FACT,
    employeeSentimentSummary: UNSUPPORTED_FACT,
    recentImportantEvents: [],
    roleDiscoverySummary: null,
    relevantRoles: [],
    publicSignals: [],
    overallAssessment: { summary: null, findings: [] },
    interviewInsights: null,
    workplaceSignals: null,
  };
}

export function normalizeGeneratedReport(
  output: z.infer<typeof llmCompanyReportSchema>,
): unknown {
  const normalized: Record<string, unknown> = { ...output };
  for (const field of COMPANY_FACT_FIELDS) {
    normalized[field] =
      output[field].supported &&
      !isResearchLimitation(output[field].value ?? '')
        ? output[field].value?.trim() || null
        : null;
  }
  const employees = output.quickBrief.employees;
  const employeeCounts = Object.fromEntries(
    (['israel', 'israelEngineering', 'global'] as const).map((field) => {
      const fact = employees[field];
      const value = fact.supported ? fact.value : null;
      const validRange = !value || !('min' in value) || value.min <= value.max;
      return [field, validRange ? value : null];
    }),
  );
  normalized.quickBrief = {
    ...output.quickBrief,
    employees: {
      ...employeeCounts,
      verificationNote: Object.values(employeeCounts).some(
        (count) => count !== null,
      )
        ? employees.verificationNote?.trim() || null
        : null,
    },
    workModel:
      output.quickBrief.workModel.supported &&
      !isResearchLimitation(output.quickBrief.workModel.value ?? '')
        ? output.quickBrief.workModel.value?.trim() || null
        : null,
  };
  const location = Object.fromEntries(
    Object.entries(output.location).map(([field, fact]) => [
      field,
      fact.supported ? fact.value?.trim() || null : null,
    ]),
  );
  location.building = cleanOfficeValue(location.building, location.address);
  const missingLocation = Object.entries(location)
    .filter(([, value]) => !value)
    .map(
      ([field]) =>
        ({ city: 'עיר', address: 'כתובת', building: 'בניין', floor: 'קומה' })[
          field
        ],
    );
  normalized.location = {
    ...location,
    verificationNote: missingLocation.length
      ? `לא אומתו: ${missingLocation.join(', ')}.`
      : null,
  };
  normalized.roleDiscoverySummary = output.roleDiscoverySummary?.trim() || null;
  for (const field of [
    'greenFlags',
    'redFlags',
    'questionsToAskRecruiter',
  ] as const)
    normalized[field] = output[field]
      .map((value) => value.trim())
      .filter(Boolean);
  normalized.recentImportantEvents = output.recentImportantEvents
    .filter((item) => item.supported)
    .map((item) => item.value.trim())
    .filter(Boolean);
  normalized.relevantRoles = output.relevantRoles.map(
    ({ title, location, workModel, requirements, ...assessment }) => ({
      ...assessment,
      omittedFacts: [
        !title.supported ? 'title' : null,
        !location.supported ? 'location' : null,
        !workModel.supported ? 'work model' : null,
        requirements.some((item) => !item.supported) ? 'requirements' : null,
      ].filter((field): field is string => field !== null),
      title: title.supported ? (title.value?.trim() ?? '') : '',
      location: location.supported ? location.value?.trim() || null : null,
      workModel: workModel.supported ? workModel.value?.trim() || null : null,
      requirements: requirements
        .filter((item) => item.supported)
        .map((item) => item.value.trim())
        .filter(Boolean),
      matchedSkills: assessment.matchedSkills
        .map((skill) => skill.trim())
        .filter(Boolean),
      gaps: assessment.gaps.map((gap) => gap.trim()).filter(Boolean),
    }),
  );
  return normalized;
}

export const cacheMetadataSchema = z.strictObject({
  company: z.enum(['hit', 'refreshed']),
  roles: z.enum(['hit', 'refreshed', 'not-requested']),
  companyRefreshedAt: z.iso.datetime(),
  rolesRefreshedAt: z.iso.datetime().nullable(),
});
export type CacheMetadata = z.infer<typeof cacheMetadataSchema>;

export const companyReportSchema = persistedCompanyReportContentSchema.extend({
  sources: z
    .array(persistedCompanyReportContentSchema.shape.sources.element)
    .max(75),
  quickBrief: quickBriefSchema.nullable().default(null),
  location: companyLocationSchema.nullable().default(null),
  reportLanguage: z.literal('he-IL').nullable().default(null),
  cache: cacheMetadataSchema.nullable().default(null),
  mode: researchModeSchema,
  candidateProfileStatus: candidateProfileStatusSchema,
  id: z.uuid(),
  companyId: z.uuid(),
  companyName: z.string().min(1),
  role: z.string().nullable(),
  provider: providerSchema,
  researchedAt: z.iso.datetime(),
});
export type CompanyReportDraft = z.infer<typeof companyReportDraftSchema>;
export type CompanyReportContent = z.infer<typeof companyReportContentSchema>;
export type PersistedCompanyReportContent = z.infer<
  typeof persistedCompanyReportContentSchema
>;
export type CompanyReport = z.infer<typeof companyReportSchema>;

export function validateReportEvidence(
  report: CompanyReportDraft,
  discovered: ReadonlyMap<string, ResearchSource>,
): CompanyReportContent {
  const {
    sources: unusedSources,
    relevantRoles,
    publicSignals: unusedSignals,
    overallAssessment: unusedAssessment,
    interviewInsights: unusedInterviews,
    workplaceSignals: unusedWorkplace,
    ...narrative
  } = report;
  void unusedSources;
  void unusedSignals;
  void unusedAssessment;
  void unusedInterviews;
  void unusedWorkplace;
  if (
    /https?:\/\//i.test(
      JSON.stringify({
        ...narrative,
        relevantRoles: relevantRoles.map(({ url: unusedUrl, ...role }) => {
          void unusedUrl;
          return role;
        }),
      }),
    )
  ) {
    throw new ResearchError(
      'EVIDENCE_INVALID',
      'Evidence URLs must appear only in website, sources or role URL fields',
    );
  }
  const usedUrls = new Set<string>();

  const sources = report.sources.flatMap((source) => {
    const evidence = discovered.get(source.url);

    if (!evidence) {
      throw new ResearchError(
        'EVIDENCE_INVALID',
        'Report contains an undiscovered source',
      );
    }

    if (usedUrls.has(source.url)) {
      return [];
    }

    usedUrls.add(source.url);

    return [
      {
        ...source,
        title: evidence.title,
        sourceType: classifyCompanySource(source.url, source.sourceType),
      },
    ];
  });
  const insights =
    report.interviewInsights || report.workplaceSignals
      ? groundedResearchInsights(
          report.interviewInsights,
          report.workplaceSignals,
          discovered,
        )
      : { interviewInsights: null, workplaceSignals: null };
  for (const section of [
    insights.interviewInsights,
    insights.workplaceSignals,
  ]) {
    if (!section) continue;
    for (const items of Object.values(section)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (typeof item === 'string') continue;
        for (const url of item.sourceUrls) {
          if (usedUrls.has(url)) continue;
          usedUrls.add(url);
          sources.push({
            url,
            title: discovered.get(url)!.title,
            sourceType: 'other',
          });
        }
      }
    }
  }
  report = { ...report, ...insights };
  const officialOrigins = new Set(
    sources
      .filter((source) => source.sourceType === 'company-site')
      .map((source) => new URL(source.url).origin),
  );
  const website = officialOrigins.size === 1 ? [...officialOrigins][0] : null;
  const publicSignals = validatePublicSignals(report.publicSignals, discovered);
  const overallAssessment = validateOverallAssessment(
    report.overallAssessment,
    discovered,
  );
  const citedUrls = [
    ...publicSignals.flatMap((signal) => signal.sourceUrls),
    ...(overallAssessment?.findings ?? []).flatMap(
      (finding) => finding.sourceUrls,
    ),
  ];
  for (const url of citedUrls) {
    if (usedUrls.has(url)) continue;
    usedUrls.add(url);
    sources.push({
      url,
      title: discovered.get(url)!.title,
      sourceType: classifyPublicSource(url),
    });
  }
  return { ...report, website, sources, publicSignals, overallAssessment };
}
