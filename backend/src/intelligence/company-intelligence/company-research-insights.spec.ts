import { groundedResearchInsights } from './company-research-insights';
import {
  companyReportSchema,
  validateReportEvidence,
  companyReportDraftSchema,
} from './company-report.schema';
import { toCompanyResearchReport } from './company-report.presentation';
import {
  reportFixture,
  reportDraftFixture,
} from '../../test/company-report.fixture';
import type { ResearchSource } from './tavily.service';

const url = 'https://www.reddit.com/r/interviews/synthetic';
const finding = {
  statement: 'דיווח מועמד על תרגיל תכנות.',
  status: 'DIRECT_REPORT' as const,
  sourceUrls: [url],
  reportedAt: '2024-03',
  context: 'Software engineer ברומניה; אינו התהליך הנוכחי בישראל.',
};
const evidence = new Map<string, ResearchSource>([
  [
    url,
    {
      url,
      title: 'Synthetic candidate report',
      content: 'Candidate describes a coding exercise in Romania in 2024.',
    },
  ],
]);

describe('Grounded interview and workplace sections', () => {
  it('returns unknowns and limitations when secondary sources are unavailable', () => {
    const result = groundedResearchInsights(null, null, new Map());
    expect(result.interviewInsights).toMatchObject({
      summary: null,
      stages: [],
      reportedTopics: [],
      candidateExperiences: [],
    });
    expect(result.interviewInsights.limitations.join(' ')).toContain(
      'Glassdoor',
    );
    expect(result.workplaceSignals.summary).toBeNull();
    expect(result.workplaceSignals.negativeSignals).toEqual([]);
    expect(result.workplaceSignals.limitations.length).toBeGreaterThan(0);
  });
  it('retains dated foreign candidate experiences with explicit context and source identity', () => {
    const result = groundedResearchInsights(
      {
        summary: 'דיווח היסטורי בלבד.',
        stages: [finding],
        reportedTopics: [],
        candidateExperiences: [finding],
        limitations: ['לא אומת תהליך בישראל.'],
      },
      null,
      evidence,
    );
    expect(result.interviewInsights.stages).toEqual([finding]);
    expect(result.interviewInsights.limitations).toContain(
      'לא אומת תהליך בישראל.',
    );
  });
  it('drops invented/unsupported references and suppresses a summary without grounded findings', () => {
    const result = groundedResearchInsights(
      {
        summary: 'Invented process',
        stages: [
          { ...finding, sourceUrls: ['https://invented.example/interview'] },
        ],
        reportedTopics: [],
        candidateExperiences: [],
        limitations: [],
      },
      null,
      evidence,
    );
    expect(result.interviewInsights.stages).toEqual([]);
    expect(result.interviewInsights.summary).toBeNull();
  });
  it('keeps anonymous review claims as experiences rather than established facts', () => {
    const result = groundedResearchInsights(
      null,
      {
        summary: 'דיווח אישי בלבד.',
        positiveSignals: [],
        negativeSignals: [{ ...finding, status: 'FACT' }],
        mixedSignals: [],
        limitations: [],
      },
      evidence,
    );
    expect(result.workplaceSignals.negativeSignals[0].status).toBe(
      'DIRECT_REPORT',
    );
  });
  it('adds structured citations to the existing source list without storing duplicate source bodies', () => {
    const discovered = new Map(evidence);
    discovered.set('https://acme.com/', {
      url: 'https://acme.com/',
      title: 'Acme',
      content: 'Company information',
    });
    const report = validateReportEvidence(
      companyReportDraftSchema.parse({
        ...reportDraftFixture,
        interviewInsights: {
          summary: 'דיווח אחד.',
          stages: [finding],
          reportedTopics: [],
          candidateExperiences: [],
          limitations: [],
        },
      }),
      discovered,
    );
    expect(report.sources.filter((source) => source.url === url)).toHaveLength(
      1,
    );
    expect(report.sources.find((source) => source.url === url)).toEqual({
      url,
      title: 'Synthetic candidate report',
      sourceType: 'other',
    });
    expect(report.interviewInsights?.stages[0].context).toContain('רומניה');
  });
  it('reads historical reports without the new fields and exposes new sections through the existing presentation', () => {
    const { interviewInsights, workplaceSignals, ...legacy } = reportFixture;
    const report = companyReportSchema.parse({
      ...legacy,
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      companyName: 'Acme',
      role: null,
      provider: 'deepseek',
      mode: 'DEEP',
      candidateProfileStatus: 'not-configured',
      researchedAt: '2026-11-01T08:00:00.000Z',
    });
    expect(report.interviewInsights).toBeNull();
    const sections = groundedResearchInsights(null, null, new Map());
    expect(
      toCompanyResearchReport({ ...report, ...sections }).interviewInsights
        ?.limitations.length,
    ).toBeGreaterThan(0);
  });
});
