import { z } from 'zod';
import {
  candidateProfile,
  candidateProfileSchema,
  CandidateProfileService,
} from '../candidate-profile/candidate-profile';
import {
  companyReportContentSchema,
  companyReportDraftSchema,
  llmCompanyReportSchema,
  validateReportEvidence,
  normalizeGeneratedReport,
} from './company-report.schema';
import { validateRelevantRoles } from './role-evidence';
import {
  reportFixture,
  reportDraftFixture,
  toLlmReport,
} from '../../test/company-report.fixture';

const companyUrl = 'https://www.zoominfo.com/about';
const companySource = {
  title: 'ZoomInfo about',
  url: companyUrl,
  content: 'Official company website',
};
const discoveredCompany = new Map([[companyUrl, companySource]]);
const companyReport = {
  ...reportDraftFixture,
  sources: [
    { title: 'ZoomInfo', url: companyUrl, sourceType: 'company-site' as const },
  ],
};
const profile = candidateProfileSchema.parse({
  ...candidateProfile,
  status: 'configured',
  programmingLanguages: ['Java'],
  frameworks: ['Spring Boot'],
  strengths: ['Distributed systems'],
});
const role = {
  title: 'Senior Backend Engineer',
  url: 'https://careers.acme.com/roles/123',
  location: 'Tel Aviv',
  workModel: 'Hybrid',
  requirements: ['Java or another JVM language'],
  matchScore: 80,
  matchSummary:
    'Synthetic assessment: JVM backend experience is transferable; team requirements need confirmation.',
  matchedSkills: ['Java'],
  gaps: [],
};
const secondRole = {
  ...role,
  title: 'Backend Infrastructure Engineer',
  url: 'https://careers.acme.com/roles/456',
};
const evidenceFor = (entry: typeof role) => ({
  title: entry.title,
  url: entry.url,
  content: `${entry.title}. ${entry.location}. ${entry.workModel}. ${entry.requirements[0]}. Apply now.`,
});
const discoveredRoles = new Map(
  [role, secondRole].map((entry) => [entry.url, evidenceFor(entry)]),
);
const reportWithRoles = {
  ...reportFixture,
  relevantRoles: [role, secondRole],
  sources: [role, secondRole].map((entry) => ({
    title: entry.title,
    url: entry.url,
    sourceType: 'job-posting' as const,
  })),
};

describe('Website origin and role evidence', () => {
  it('derives the website from a validated official /about source without LLM website output', () => {
    expect(
      validateReportEvidence(companyReport, discoveredCompany).website,
    ).toBe('https://www.zoominfo.com');
  });

  it('uses the shared origin for multiple official pages', () => {
    const productUrl = 'https://www.zoominfo.com/products/';
    const evidence = new Map([
      ...discoveredCompany,
      [
        productUrl,
        { title: 'Products', url: productUrl, content: 'Company products' },
      ] as const,
    ]);
    expect(
      validateReportEvidence(
        {
          ...companyReport,
          sources: [
            ...companyReport.sources,
            { title: 'Products', url: productUrl, sourceType: 'company-site' },
          ],
        },
        evidence,
      ).website,
    ).toBe('https://www.zoominfo.com');
  });

  it('returns null without official-site evidence, even when an uncited official page was discovered', () => {
    expect(
      validateReportEvidence(
        {
          ...companyReport,
          sources: [{ ...companyReport.sources[0], sourceType: 'news' }],
        },
        discoveredCompany,
      ).website,
    ).toBeNull();
    const newsUrl = 'https://news.com/article';
    const evidence = new Map([
      ...discoveredCompany,
      [
        newsUrl,
        { title: 'News', url: newsUrl, content: 'Company news' },
      ] as const,
    ]);
    expect(
      validateReportEvidence(
        {
          ...companyReport,
          sources: [{ title: 'News', url: newsUrl, sourceType: 'news' }],
        },
        evidence,
      ).website,
    ).toBeNull();
  });

  it('returns null for conflicting official origins instead of choosing one', () => {
    const other = 'https://other.com/about';
    const evidence = new Map([
      ...discoveredCompany,
      [
        other,
        { title: 'Other', url: other, content: 'Ambiguous company' },
      ] as const,
    ]);
    expect(
      validateReportEvidence(
        {
          ...companyReport,
          sources: [
            ...companyReport.sources,
            { title: 'Other', url: other, sourceType: 'company-site' },
          ],
        },
        evidence,
      ).website,
    ).toBeNull();
  });

  it('keeps exact citation validation despite matching website origins', () => {
    expect(() =>
      validateReportEvidence(
        {
          ...companyReport,
          sources: [
            { ...companyReport.sources[0], url: 'https://www.zoominfo.com/' },
          ],
        },
        discoveredCompany,
      ),
    ).toThrow('undiscovered');
  });

  it('excludes website from LLM and draft schemas while preserving nullable application output', () => {
    const schema = z.toJSONSchema(llmCompanyReportSchema);
    expect(schema.properties).not.toHaveProperty('website');
    expect(schema.required).not.toContain('website');
    expect(companyReportDraftSchema.safeParse(reportDraftFixture).success).toBe(
      true,
    );
    expect(
      companyReportDraftSchema.safeParse({
        ...reportDraftFixture,
        website: 'https://invented.com/',
      }).success,
    ).toBe(false);
    expect(
      llmCompanyReportSchema.safeParse(toLlmReport(reportDraftFixture)).success,
    ).toBe(true);
    expect(
      llmCompanyReportSchema.safeParse({
        ...reportDraftFixture,
        website: 'https://invented.com/',
      }).success,
    ).toBe(false);
    expect(
      companyReportContentSchema.safeParse({
        ...reportDraftFixture,
        website: null,
      }).success,
    ).toBe(true);
    expect(
      companyReportContentSchema.safeParse({
        ...reportDraftFixture,
        website: 'https://www.zoominfo.com',
      }).success,
    ).toBe(true);
  });

  it('supports multiple roles, preserves semantic assessments and assigns read/snippet evidence deterministically', () => {
    const validated = validateRelevantRoles(
      reportWithRoles,
      discoveredRoles,
      new Map([[role.url, evidenceFor(role).content]]),
      profile,
      undefined,
      10,
    );
    expect(validated.relevantRoles).toHaveLength(2);
    expect(validated.relevantRoles[0]).toMatchObject({
      title: role.title,
      matchScore: 80,
      evidenceLevel: 'page-read',
    });
    expect(validated.relevantRoles[1]).toMatchObject({
      evidenceLevel: 'search-snippet',
    });
    expect(validated.relevantRoles[1].evidenceSummary).toContain(
      'דורשים אימות',
    );
  });
  it('rejects an invented role URL even on a discovered company domain', () => {
    expect(() =>
      validateRelevantRoles(
        {
          ...reportWithRoles,
          relevantRoles: [
            { ...role, url: 'https://careers.acme.com/roles/invented' },
          ],
        },
        discoveredRoles,
        new Map(),
        profile,
        'Backend',
        10,
      ),
    ).toThrow('discovered and cited');
  });
  it('sanitizes unsupported semantic facts independently without exact-text matching', () => {
    const output = llmCompanyReportSchema.parse(
      toLlmReport({ ...reportDraftFixture, relevantRoles: [role] }),
    );
    output.relevantRoles[0].location = { value: 'London', supported: false };
    output.relevantRoles[0].workModel = {
      value: 'Fully remote',
      supported: false,
    };
    output.relevantRoles[0].requirements = [
      { value: 'Java backend development experience', supported: true },
      { value: 'Ten years of Rust', supported: false },
    ];
    output.sources = [
      { title: role.title, url: role.url, sourceType: 'job-posting' },
    ];
    const draft = companyReportDraftSchema.parse(
      normalizeGeneratedReport(output),
    );
    const content = validateReportEvidence(
      draft,
      new Map([[role.url, evidenceFor(role)]]),
    );
    const report = {
      ...content,
      sources: [
        {
          title: role.title,
          url: role.url,
          sourceType: 'job-posting' as const,
        },
      ],
    };
    const validated = validateRelevantRoles(
      report,
      discoveredRoles,
      new Map(),
      profile,
      'Backend',
      3,
    );
    expect(validated.relevantRoles[0]).toMatchObject({
      location: null,
      workModel: null,
      requirements: ['Java backend development experience'],
      title: role.title,
    });
  });

  it('prefers the discovered posting title and permits semantically grounded paraphrases', () => {
    const report = {
      ...reportWithRoles,
      relevantRoles: [
        {
          ...role,
          title: 'Backend developer',
          location: 'Tel Aviv, Israel',
          workModel: 'Hybrid office/home arrangement',
          requirements: ['JVM backend experience'],
        },
      ],
    };
    const validated = validateRelevantRoles(
      report,
      discoveredRoles,
      new Map(),
      profile,
      'Backend',
      10,
    );
    expect(validated.relevantRoles[0]).toMatchObject({
      title: role.title,
      location: 'Tel Aviv, Israel',
      workModel: 'Hybrid office/home arrangement',
      requirements: ['JVM backend experience'],
    });
  });

  it('omits unsupported company facts and events using the same semantic fact rule', () => {
    const output = llmCompanyReportSchema.parse(
      toLlmReport(reportDraftFixture),
    );
    output.workModelSummary = { value: 'Four days remote', supported: false };
    output.companySizeSummary = {
      value: 'Thousands of people',
      supported: false,
    };
    output.technologySummary = {
      value:
        'Some evidence suggests a JVM backend; team-specific details are unclear.',
      supported: true,
    };
    output.recentImportantEvents = [
      { value: 'Unverified acquisition rumor', supported: false },
    ];
    const report = companyReportDraftSchema.parse(
      normalizeGeneratedReport(output),
    );
    expect(report).toMatchObject({
      workModelSummary: null,
      companySizeSummary: null,
      recentImportantEvents: [],
      technologySummary: output.technologySummary.value,
    });
  });

  it('keeps a title-only search result with partial details and unchanged candidate assessments', () => {
    const evidence = new Map([
      [role.url, { title: role.title, url: role.url, content: '' }],
    ]);
    const assessments = {
      matchScore: 65,
      matchSummary: 'Provisional transferable experience assessment.',
      gaps: ['Specific framework experience needs confirmation.'],
    };
    const validated = validateRelevantRoles(
      { ...reportWithRoles, relevantRoles: [{ ...role, ...assessments }] },
      evidence,
      new Map(),
      profile,
      'Backend',
      3,
    );
    expect(validated.relevantRoles).toHaveLength(1);
    expect(validated.relevantRoles[0]).toMatchObject({
      title: role.title,
      location: null,
      workModel: null,
      requirements: [],
      ...assessments,
      evidenceLevel: 'search-snippet',
    });
    expect(validated.relevantRoles[0].evidenceSummary).toContain(
      'דורשים אימות',
    );
    expect(validated.relevantRoles[0].evidenceSummary).toContain(
      'פרטים נוספים הושמטו',
    );
  });

  it.each(['', role.url, 'Careers'])(
    'excludes an ungrounded role with source title %j while preserving other roles',
    (title) => {
      const evidence = new Map([
        ...discoveredRoles,
        [role.url, { title, url: role.url, content: '' }] as const,
      ]);
      const validated = validateRelevantRoles(
        reportWithRoles,
        evidence,
        new Map(),
        profile,
        'Backend',
        10,
      );
      expect(validated.relevantRoles.map((entry) => entry.url)).toEqual([
        secondRole.url,
      ]);
      const noneGrounded = validateRelevantRoles(
        { ...reportWithRoles, relevantRoles: [role] },
        evidence,
        new Map(),
        profile,
        'Backend',
        10,
      );
      expect(noneGrounded.relevantRoles).toEqual([]);
    },
  );

  it('still rejects a discovered role URL when it is not cited as a job-posting', () => {
    expect(() =>
      validateRelevantRoles(
        {
          ...reportWithRoles,
          sources: [{ title: role.title, url: role.url, sourceType: 'other' }],
          relevantRoles: [role],
        },
        discoveredRoles,
        new Map(),
        profile,
        'Backend',
        10,
      ),
    ).toThrow('discovered and cited');
  });

  it('deduplicates the same exact role URL without selecting a single winner', () => {
    expect(
      validateRelevantRoles(
        { ...reportWithRoles, relevantRoles: [role, role, secondRole] },
        discoveredRoles,
        new Map(),
        profile,
        'Backend',
        10,
      ).relevantRoles,
    ).toHaveLength(2);
  });
  it('allows intent-based discovery without inventing personal skills or a score', () => {
    const report = {
      ...reportWithRoles,
      relevantRoles: [{ ...role, matchScore: null, matchedSkills: [] }],
    };
    const validated = validateRelevantRoles(
      report,
      discoveredRoles,
      new Map(),
      candidateProfile,
      'Backend Developer',
      3,
    );
    expect(validated.relevantRoles[0]).toMatchObject({
      matchScore: null,
      matchedSkills: [],
      gaps: [],
    });
    expect(validated.relevantRoles[0].matchSummary).toContain('אינו מוגדר');
    expect(
      validateRelevantRoles(
        { ...reportFixture, relevantRoles: [] },
        discoveredRoles,
        new Map(),
        candidateProfile,
        undefined,
        3,
      ).roleDiscoverySummary,
    ).toContain('אינה מעידה');
    expect(() =>
      validateRelevantRoles(
        reportWithRoles,
        discoveredRoles,
        new Map(),
        candidateProfile,
        'Backend',
        3,
      ),
    ).toThrow('configured profile');
  });
  it('keeps role URLs allowed only in typed URL fields and provider schemas format-free', () => {
    const discovered = new Map([...discoveredCompany, ...discoveredRoles]);
    expect(() =>
      validateReportEvidence(
        { ...companyReport, relevantRoles: [role] },
        discovered,
      ),
    ).not.toThrow();
    expect(() =>
      validateReportEvidence(
        { ...companyReport, companySummary: role.url },
        discovered,
      ),
    ).toThrow('Evidence URLs');
    expect(
      JSON.stringify(z.toJSONSchema(llmCompanyReportSchema)),
    ).not.toContain('"format"');
    expect(
      companyReportContentSchema.safeParse({
        ...reportFixture,
        relevantRoles: [{ ...role, matchScore: 101 }],
      }).success,
    ).toBe(false);
  });
  it('rejects a matched skill absent from the verified profile and enforces the per-mode role cap', () => {
    expect(() =>
      validateRelevantRoles(
        {
          ...reportWithRoles,
          relevantRoles: [{ ...role, matchedSkills: ['Invented experience'] }],
        },
        discoveredRoles,
        new Map(),
        profile,
        'Backend',
        10,
      ),
    ).toThrow('Matched skills');
    expect(
      validateRelevantRoles(
        reportWithRoles,
        discoveredRoles,
        new Map(),
        profile,
        'Backend',
        1,
      ).relevantRoles,
    ).toHaveLength(1);
  });

  it('keeps the shipped profile as an explicit placeholder and rejects fake configured emptiness', () => {
    expect(new CandidateProfileService().getProfile()).toMatchObject({
      status: 'not-configured',
      programmingLanguages: [],
      backendExperience: { years: null, level: null },
    });
    expect(
      candidateProfileSchema.safeParse({
        ...candidateProfile,
        status: 'configured',
      }).success,
    ).toBe(false);
  });
});
