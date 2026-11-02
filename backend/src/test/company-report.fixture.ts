import type {
  CompanyReportDraft,
  PersistedCompanyReportContent,
} from '../intelligence/company-intelligence/company-report.schema';

export const reportFixture: PersistedCompanyReportContent = {
  reportLanguage: 'he-IL',
  interviewInsights: null,
  workplaceSignals: null,
  quickBrief: {
    whatTheyDo: 'Acme מפתחת מוצר תוכנה לארגונים.',
    workModel: null,
    greenFlags: [],
    redFlags: [],
  },
  location: {
    city: null,
    address: null,
    building: null,
    floor: null,
    buildingFloors: null,
    companyFloors: null,
    campus: null,
    verificationNote: 'פרטי המיקום לא אומתו.',
  },
  website: 'https://acme.com/',
  researchQuality: null,
  companySummary: 'Synthetic company summary for tests.',
  productSummary: 'Synthetic product summary for tests.',
  businessModel: null,
  companySizeSummary: null,
  officeLocationSummary: null,
  workModelSummary: null,
  engineeringSummary: null,
  technologySummary: null,
  stabilitySummary: null,
  recentImportantEvents: [],
  employeeSentimentSummary: null,
  greenFlags: [],
  redFlags: [],
  questionsToAskRecruiter: ['What does the team own?'],
  roleDiscoverySummary: null,
  relevantRoles: [],
  sources: [
    { title: 'Acme', url: 'https://acme.com/', sourceType: 'company-site' },
  ],
  publicSignals: [],
  overallAssessment: null,
};

export const persistedRoleFixture: PersistedCompanyReportContent['relevantRoles'][number] =
  {
    title: 'Senior Backend Engineer',
    url: 'https://acme.com/jobs/123',
    location: null,
    workModel: null,
    requirements: ['Java'],
    matchScore: 80,
    matchSummary: 'Synthetic transferable backend experience assessment.',
    matchedSkills: ['Java'],
    gaps: [],
    evidenceLevel: 'search-snippet',
    evidenceSummary:
      'Search snippet only; vacancy status requires confirmation.',
  };

const {
  reportLanguage: persistedLanguage,
  website: persistedWebsite,
  researchQuality: historicalQuality,
  ...draftContent
} = reportFixture;
void persistedLanguage;
void historicalQuality;
void persistedWebsite;
export const reportDraftFixture: CompanyReportDraft = draftContent;

export function toLlmReport(report: unknown): unknown {
  const value = report as Record<string, unknown>;
  const result: Record<string, unknown> = {
    ...value,
    interviewInsights: value.interviewInsights ?? null,
    workplaceSignals: value.workplaceSignals ?? null,
    publicSignals: value.publicSignals ?? [],
    overallAssessment: value.overallAssessment ?? {
      summary: null,
      findings: [],
    },
  };
  for (const field of [
    'businessModel',
    'companySizeSummary',
    'officeLocationSummary',
    'workModelSummary',
    'engineeringSummary',
    'technologySummary',
    'stabilitySummary',
    'employeeSentimentSummary',
  ]) {
    result[field] = { value: value[field], supported: value[field] !== null };
  }
  const brief = value.quickBrief as Record<string, unknown>;
  const employees = (brief?.employees ?? {}) as Record<string, unknown>;
  result.quickBrief = {
    ...brief,
    employees: {
      ...Object.fromEntries(
        ['israel', 'israelEngineering', 'global'].map((field) => [
          field,
          {
            value: employees[field] ?? null,
            supported: employees[field] != null,
          },
        ]),
      ),
      verificationNote: employees.verificationNote ?? null,
    },
    workModel: {
      value: brief?.workModel ?? null,
      supported: brief?.workModel != null,
    },
  };
  const location = value.location as Record<string, unknown>;
  result.location = Object.fromEntries(
    ['city', 'address', 'building', 'floor'].map((field) => [
      field,
      {
        value: location?.[field] ?? null,
        supported: location?.[field] != null,
      },
    ]),
  );
  result.recentImportantEvents = (
    (value.recentImportantEvents as string[]) ?? []
  ).map((item) => ({ value: item, supported: true }));
  if (Array.isArray(value.relevantRoles))
    result.relevantRoles = value.relevantRoles.map(
      (role: Record<string, unknown>) => ({
        ...role,
        title: { value: role.title, supported: true },
        location: { value: role.location, supported: role.location !== null },
        workModel: {
          value: role.workModel,
          supported: role.workModel !== null,
        },
        requirements: ((role.requirements as string[]) ?? []).map((item) => ({
          value: item,
          supported: true,
        })),
      }),
    );
  return result;
}
