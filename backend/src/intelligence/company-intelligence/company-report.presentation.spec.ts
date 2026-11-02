import { z } from 'zod';
import {
  companyReportSchema,
  llmCompanyReportSchema,
  normalizeGeneratedReport,
  companyReportDraftSchema,
  validateReportEvidence,
} from './company-report.schema';
import {
  quickCompanyReportSchema,
  deepCompanyReportSchema,
  toQuickCompanyReport,
  toDeepCompanyReport,
  toCompanyResearchReport,
  companyResearchReportSchema,
  QUICK_PRESENTATION_LIMITS,
} from './company-report.presentation';
import {
  COMPANY_RESEARCH_PROMPT,
  COMPANY_SYNTHESIS_PROMPT,
} from './company-intelligence.prompt';
import {
  reportFixture,
  reportDraftFixture,
  persistedRoleFixture,
  toLlmReport,
} from '../../test/company-report.fixture';

function storedReport() {
  return companyReportSchema.parse({
    ...reportFixture,
    companyName: 'Acme',
    id: '931d32d4-9772-4b08-a281-a99034f47462',
    companyId: '5e7aa3dc-0f47-4fb0-a084-51e7bc527411',
    role: null,
    provider: 'openai',
    mode: 'DEEP',
    candidateProfileStatus: 'configured',
    researchedAt: '2026-10-24T12:00:00.000Z',
  });
}

describe('Hebrew report presentation and official sources', () => {
  it('projects a cached DEEP snapshot into a compact QUICK DTO without changing stored detail', () => {
    const report = storedReport();
    report.relevantRoles = Array.from({ length: 5 }, (_, index) => ({
      ...persistedRoleFixture,
      url: `https://acme.com/jobs/${index}`,
    }));
    report.quickBrief = {
      whatTheyDo: 'Acme מפתחת תוכנת Backend לארגונים. '.repeat(30),
      workModel: 'מודל העבודה לא אומת. '.repeat(30),
      greenFlags: Array(5).fill('מידע חיובי מפורט. '.repeat(30)) as string[],
      redFlags: Array(5).fill('סיכון שדורש בירור. '.repeat(30)) as string[],
    };
    report.location = {
      ...report.location!,
      buildingFloors: 12,
      companyFloors: '7–9',
      campus: 'Example Park',
    };
    const quick = toQuickCompanyReport(report);
    expect(quick.location.buildingFloors).toBe(12);
    expect(quick.location.companyFloors).toBe('7–9');
    expect(quickCompanyReportSchema.safeParse(quick).success).toBe(true);
    expect(quick.relevantRoles).toHaveLength(3);
    expect(quick.greenFlags).toHaveLength(3);
    expect(quick.redFlags).toHaveLength(3);
    expect(quick.whatTheyDo.length).toBeLessThanOrEqual(
      QUICK_PRESENTATION_LIMITS.summary,
    );
    expect(quick.workModel!.length).toBeLessThanOrEqual(160);
    expect(Object.keys(quick.relevantRoles[0]).sort()).toEqual(
      ['title', 'location', 'workModel', 'matchScore', 'url'].sort(),
    );
    expect(quick).not.toHaveProperty('companySummary');
    expect(quick).not.toHaveProperty('engineeringSummary');
    expect(quick).not.toHaveProperty('sources');
    expect(report.relevantRoles).toHaveLength(5);
    expect(toDeepCompanyReport(report).relevantRoles).toHaveLength(5);
    expect(toDeepCompanyReport(report)).toHaveProperty('productSummary');
    expect(toDeepCompanyReport(report)).toHaveProperty('sources');
    expect(
      deepCompanyReportSchema.safeParse(toDeepCompanyReport(report)).success,
    ).toBe(true);
  });

  it('keeps missing location details nullable and provides a Hebrew verification note', () => {
    const generated = llmCompanyReportSchema.parse(
      toLlmReport(reportDraftFixture),
    );
    generated.location.city = { value: 'הרצליה', supported: true };
    generated.location.building = { value: 'בניין שלא אומת', supported: false };
    const normalized = companyReportDraftSchema.parse(
      normalizeGeneratedReport(generated),
    );
    expect(normalized.location).toEqual({
      city: 'הרצליה',
      address: null,
      building: null,
      floor: null,
      buildingFloors: null,
      companyFloors: null,
      campus: null,
      verificationNote: 'לא אומתו: כתובת, בניין, קומה.',
    });
    const report = storedReport();
    report.location = normalized.location;
    report.candidateProfileStatus = 'not-configured';
    report.relevantRoles = [persistedRoleFixture];
    const quick = toQuickCompanyReport(report);
    expect(quick.location.city).toBe('הרצליה');
    expect(quick.relevantRoles[0].matchScore).toBeNull();
    report.location = null;
    expect(toQuickCompanyReport(report).location.floor).toBeNull();
  });

  it.each([COMPANY_RESEARCH_PROMPT, COMPANY_SYNTHESIS_PROMPT])(
    'requires direct natural Hebrew and preserves technical names',
    (prompt) => {
      expect(prompt).toContain('natural Hebrew (he-IL)');
      expect(prompt).toContain(
        'not generated in English and translated afterward',
      );
      expect(prompt).toContain('Spring Boot');
      expect(prompt).toContain('20 seconds');
    },
  );

  it.each([
    'linkedin.com',
    'il.linkedin.com',
    'wikipedia.org',
    'finance.yahoo.com',
    'builtin.com',
    'glassdoor.com',
    'crunchbase.com',
    'leadiq.com',
    'instagram.com',
    'marketwatch.com',
    'jobs.lever.co',
  ])('downgrades %s before deterministic website derivation', (domain) => {
    const official = 'https://www.varonis.com/trust/security';
    const thirdParty = `https://${domain}/company/varonis`;
    const urls = [official, thirdParty];
    const report = validateReportEvidence(
      {
        ...reportDraftFixture,
        sources: urls.map((url) => ({
          title: 'Source',
          url,
          sourceType: 'company-site' as const,
        })),
      },
      new Map(
        urls.map((url) => [
          url,
          { url, title: 'Discovered title', content: 'Company evidence' },
        ]),
      ),
    );
    expect(report.website).toBe('https://www.varonis.com');
    expect(report.sources[1]).toMatchObject({
      url: thirdParty,
      sourceType: 'other',
      title: 'Discovered title',
    });
    const onlyThirdParty = validateReportEvidence(
      {
        ...reportDraftFixture,
        sources: [
          { title: 'Profile', url: thirdParty, sourceType: 'company-site' },
        ],
      },
      new Map([
        [
          thirdParty,
          { url: thirdParty, title: 'Profile', content: 'Company profile' },
        ],
      ]),
    );
    expect(onlyThirdParty.website).toBeNull();
  });

  it('keeps exact URL integrity and genuine conflicting first-party origins strict', () => {
    const urls = [
      'https://www.varonis.com/about',
      'https://varonis.co.il/contact',
    ];
    const draft = {
      ...reportDraftFixture,
      sources: urls.map((url) => ({
        title: 'Source',
        url,
        sourceType: 'company-site' as const,
      })),
    };
    const discovered = new Map(
      urls.map((url) => [
        url,
        { url, title: 'Official source', content: 'Evidence' },
      ]),
    );
    expect(validateReportEvidence(draft, discovered).website).toBeNull();
    discovered.delete(urls[1]);
    expect(() => validateReportEvidence(draft, discovered)).toThrow(
      'undiscovered',
    );
  });

  it('keeps application URL/date formats and presentation-only fields out of LLM output', () => {
    const schema = z.toJSONSchema(llmCompanyReportSchema);
    expect(schema.properties).not.toHaveProperty('website');
    expect(schema.properties).not.toHaveProperty('reportLanguage');
    expect(JSON.stringify(schema)).not.toContain('"format"');
    const quick = z.toJSONSchema(quickCompanyReportSchema);
    const deep = z.toJSONSchema(deepCompanyReportSchema);
    expect(Object.keys(deep.properties!).length).toBeGreaterThan(
      Object.keys(quick.properties!).length,
    );
  });
});

describe('QUICK company explanation length', () => {
  it('keeps a two-sentence explanation of about 45–65 words without truncation', () => {
    const report = storedReport();
    const twoSentences =
      'Varonis מפתחת פלטפורמת Data Security שמגינה על מידע ארגוני בענן ובמערכות פנימיות, ומזהה הרשאות מסוכנות, חשיפות של קבצים רגישים ופעילות חריגה של משתמשים בזמן אמת. המוצרים שלה משמשים ארגונים גדולים, בנקים וחברות ביטוח לניהול גישה למידע רגיש, לעמידה ברגולציה ולזיהוי מוקדם של איומי אבטחה ודליפות מידע.';
    expect(twoSentences.split(/\s+/).length).toBeGreaterThanOrEqual(45);
    expect(twoSentences.split(/\s+/).length).toBeLessThanOrEqual(65);
    report.quickBrief = {
      whatTheyDo: twoSentences,
      workModel: null,
      greenFlags: [],
      redFlags: [],
    };
    const quick = toQuickCompanyReport(report);
    expect(quick.whatTheyDo).toBe(twoSentences);
    expect(quickCompanyReportSchema.safeParse(quick).success).toBe(true);
    expect(COMPANY_SYNTHESIS_PROMPT).toContain(
      'whatTheyDo in exactly 2 short informative Hebrew sentences (roughly 45–65 words, at most 420 characters)',
    );
  });
});

describe('Unified company research presentation', () => {
  it('keeps the concise brief visible and moves deeper findings into details', () => {
    const report = storedReport();
    report.publicSignals = Array.from({ length: 6 }, (_, index) => ({
      title: `תובנה ${index}`,
      observation: 'דפוס חוזר בפוסטים של ההנהלה.',
      interpretation: 'זו הסקה ולא עובדה מאומתת.',
      candidateImplication: null,
      confidence: 'medium' as const,
      signalType: 'yellow' as const,
      sourceKind: 'leadership' as const,
      corroborated: false,
      sourceUrls: ['https://acme.com/'],
    }));
    const unified = toCompanyResearchReport(report);
    expect(companyResearchReportSchema.safeParse(unified).success).toBe(true);
    expect(unified).toMatchObject({
      companyName: 'Acme',
      whatTheyDo: toQuickCompanyReport(report).whatTheyDo,
      details: {
        companySummary: report.companySummary,
        productSummary: report.productSummary,
        questionsToAskRecruiter: report.questionsToAskRecruiter,
      },
      website: report.website,
    });
    expect(unified.publicSignals).toHaveLength(4);
    expect(unified).not.toHaveProperty('quickBrief');
    expect(unified).not.toHaveProperty('researchEvidence');
  });

  it('reads reports saved before public signals existed', () => {
    const legacyRow: Record<string, unknown> = {
      ...storedReport(),
    };
    delete legacyRow.publicSignals;
    delete legacyRow.overallAssessment;
    const parsed = companyReportSchema.parse(legacyRow);
    expect(parsed.publicSignals).toEqual([]);
    expect(parsed.overallAssessment).toBeNull();
    expect(toCompanyResearchReport(parsed).publicSignals).toEqual([]);
  });
});
