import { z } from 'zod';
import {
  candidateFlags,
  isResearchLimitation,
  usefulGreenFlags,
} from './research-quality';
import { cleanOfficeValue, naturalOfficeNote } from './location-intelligence';
import {
  companyReportSchema,
  companyLocationSchema,
  cacheMetadataSchema,
  relevantRoleSchema,
  employeesSchema,
  overallAssessmentSchema,
  publicSignalSchema,
  researchOriginSchema,
} from './company-report.schema';
import { PUBLIC_INTELLIGENCE_LIMITS } from './public-intelligence';
import type { CompanyReport } from './company-report.schema';
import {
  interviewInsightsSchema,
  workplaceSignalsSchema,
} from './company-research-insights';

export const QUICK_PRESENTATION_LIMITS = {
  summary: 420,
  workModel: 160,
  flag: 80,
  flags: 3,
  roles: 3,
  limitations: 3,
  limitation: 200,
} as const;
export const quickCompanyReportSchema = z.strictObject({
  companyName: z.string(),
  whatTheyDo: z.string().max(QUICK_PRESENTATION_LIMITS.summary),
  employees: employeesSchema,
  location: companyLocationSchema,
  workModel: z.string().max(QUICK_PRESENTATION_LIMITS.workModel).nullable(),
  relevantRoles: z
    .array(
      relevantRoleSchema.pick({
        title: true,
        location: true,
        workModel: true,
        matchScore: true,
        url: true,
      }),
    )
    .max(3),
  greenFlags: z.array(z.string().max(QUICK_PRESENTATION_LIMITS.flag)).max(3),
  redFlags: z.array(z.string().max(QUICK_PRESENTATION_LIMITS.flag)).max(3),
  cache: cacheMetadataSchema.nullable(),
  researchQuality: z
    .strictObject({
      origin: researchOriginSchema.optional(),
      evidenceLevel: z.enum(['strong', 'partial', 'limited']),
      officeEvidenceLevel: z.enum(['strong', 'partial', 'limited']).nullable(),
      limitations: z
        .array(z.string().max(QUICK_PRESENTATION_LIMITS.limitation))
        .max(3),
    })
    .nullable(),
});
export const deepCompanyReportSchema = companyReportSchema.omit({
  quickBrief: true,
});
export const companyResearchReportSchema = quickCompanyReportSchema.extend({
  website: z.string().nullable(),
  researchedAt: z.iso.datetime(),
  publicSignals: z
    .array(publicSignalSchema)
    .max(PUBLIC_INTELLIGENCE_LIMITS.signals),
  overallAssessment: overallAssessmentSchema.nullable(),
  interviewInsights: interviewInsightsSchema.nullable().default(null),
  workplaceSignals: workplaceSignalsSchema.nullable().default(null),
  details: z.strictObject({
    companySummary: z.string(),
    productSummary: z.string(),
    businessModel: z.string().nullable(),
    companySizeSummary: z.string().nullable(),
    engineeringSummary: z.string().nullable(),
    technologySummary: z.string().nullable(),
    stabilitySummary: z.string().nullable(),
    employeeSentimentSummary: z.string().nullable(),
    recentImportantEvents: z.array(z.string()),
    questionsToAskRecruiter: z.array(z.string()),
  }),
  sources: companyReportSchema.shape.sources,
});
export type QuickCompanyReport = z.infer<typeof quickCompanyReportSchema>;
export type CompanyResearchReport = z.infer<typeof companyResearchReportSchema>;
export type DeepCompanyReport = z.infer<typeof deepCompanyReportSchema>;

function compact(value: string, maxCharacters: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxCharacters) return text;
  const shortened = text.slice(0, maxCharacters - 1);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${lastSpace > maxCharacters / 2 ? shortened.slice(0, lastSpace) : shortened}…`;
}
export function toQuickCompanyReport(
  report: CompanyReport,
): QuickCompanyReport {
  const brief = report.quickBrief;
  const location = report.location ?? {
    city: null,
    address: null,
    building: null,
    floor: null,
    buildingFloors: null,
    companyFloors: null,
    campus: null,
    verificationNote: 'פרטי המיקום לא אומתו.',
  };
  const missingFlags = [
    ...(brief?.redFlags ?? []),
    ...(brief?.greenFlags ?? []),
  ].filter(isResearchLimitation);
  const cleanLocation = {
    ...location,
    verificationNote: naturalOfficeNote(location.verificationNote),
    building: cleanOfficeValue(location.building, location.address),
    campus: cleanOfficeValue(location.campus ?? null, location.address),
    companyFloors: cleanOfficeValue(location.companyFloors ?? null, null),
    floor: cleanOfficeValue(location.floor, null),
  };
  const omittedDetails: string[] = [];
  if (brief?.workModel && isResearchLimitation(brief.workModel))
    omittedDetails.push('לא הצלחתי לאמת את מודל העבודה בישראל.');
  if (location.building && !cleanLocation.building)
    omittedDetails.push('לא מצאתי מקור אמין לשם בניין המשרדים.');
  if (location.campus && !cleanLocation.campus)
    omittedDetails.push('לא מצאתי מקור אמין לשם מתחם המשרדים.');
  if (
    (location.companyFloors && !cleanLocation.companyFloors) ||
    (location.floor && !cleanLocation.floor)
  )
    omittedDetails.push('לא נמצא מידע אמין על קומות המשרד.');
  const limitations = [
    ...new Set([
      ...missingFlags,
      ...omittedDetails,
      ...(report.researchQuality?.limitations ?? []),
    ]),
  ];
  return quickCompanyReportSchema.parse({
    companyName: report.companyName,
    whatTheyDo: compact(
      brief?.whatTheyDo.trim() || report.companySummary.trim(),
      QUICK_PRESENTATION_LIMITS.summary,
    ),
    employees: {
      israel: brief?.employees?.israel ?? null,
      israelEngineering: brief?.employees?.israelEngineering ?? null,
      global: brief?.employees?.global ?? null,
      verificationNote: brief?.employees?.verificationNote
        ? compact(
            brief.employees.verificationNote,
            QUICK_PRESENTATION_LIMITS.workModel,
          )
        : null,
    },
    location: Object.fromEntries(
      Object.entries(cleanLocation).map(([field, value]) => [
        field,
        typeof value === 'string'
          ? compact(value, QUICK_PRESENTATION_LIMITS.workModel)
          : value,
      ]),
    ),
    workModel:
      brief?.workModel && !isResearchLimitation(brief.workModel)
        ? compact(brief.workModel, QUICK_PRESENTATION_LIMITS.workModel)
        : null,
    relevantRoles: report.relevantRoles
      .slice(0, QUICK_PRESENTATION_LIMITS.roles)
      .map((role) => ({
        title: role.title,
        location: role.location
          ? compact(role.location, QUICK_PRESENTATION_LIMITS.workModel)
          : null,
        workModel: role.workModel
          ? compact(role.workModel, QUICK_PRESENTATION_LIMITS.workModel)
          : null,
        matchScore:
          report.candidateProfileStatus === 'configured'
            ? role.matchScore
            : null,
        url: role.url,
      })),
    greenFlags: usefulGreenFlags(brief?.greenFlags ?? [])
      .slice(0, QUICK_PRESENTATION_LIMITS.flags)
      .map((flag) => compact(flag, QUICK_PRESENTATION_LIMITS.flag)),
    redFlags: candidateFlags(brief?.redFlags ?? [])
      .slice(0, QUICK_PRESENTATION_LIMITS.flags)
      .map((flag) => compact(flag, QUICK_PRESENTATION_LIMITS.flag)),
    cache: report.cache,
    researchQuality:
      report.researchQuality || limitations.length
        ? {
            ...(report.researchQuality?.origin
              ? { origin: report.researchQuality.origin }
              : {}),
            evidenceLevel: report.researchQuality?.evidenceLevel ?? 'limited',
            officeEvidenceLevel:
              report.researchQuality?.officeEvidenceLevel ?? null,
            limitations: limitations
              .slice(0, QUICK_PRESENTATION_LIMITS.limitations)
              .map((value) =>
                compact(value, QUICK_PRESENTATION_LIMITS.limitation),
              ),
          }
        : null,
  });
}
export function toDeepCompanyReport(report: CompanyReport): DeepCompanyReport {
  return deepCompanyReportSchema.strip().parse(report);
}

export function toCompanyResearchReport(
  report: CompanyReport,
): CompanyResearchReport {
  return companyResearchReportSchema.parse({
    ...toQuickCompanyReport(report),
    website: report.website,
    researchedAt: report.researchedAt,
    publicSignals: report.publicSignals.slice(
      0,
      PUBLIC_INTELLIGENCE_LIMITS.signals,
    ),
    overallAssessment: report.overallAssessment,
    interviewInsights: report.interviewInsights,
    workplaceSignals: report.workplaceSignals,
    details: {
      companySummary: report.companySummary,
      productSummary: report.productSummary,
      businessModel: report.businessModel,
      companySizeSummary: report.companySizeSummary,
      engineeringSummary: report.engineeringSummary,
      technologySummary: report.technologySummary,
      stabilitySummary: report.stabilitySummary,
      employeeSentimentSummary: report.employeeSentimentSummary,
      recentImportantEvents: report.recentImportantEvents,
      questionsToAskRecruiter: report.questionsToAskRecruiter,
    },
    sources: report.sources,
  });
}
