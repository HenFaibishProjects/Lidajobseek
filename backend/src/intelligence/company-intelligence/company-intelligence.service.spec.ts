import * as locationResearch from './location-intelligence';
import * as followUpResearch from './research-follow-up';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { llmCompanyReportSchema } from './company-report.schema';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { companySection, roleSection } from './research-cache';
import { RESEARCH_LIMITS } from './research-mode';
import {
  candidateProfile,
  CandidateProfileService,
} from '../candidate-profile/candidate-profile';
import { LlmProviders } from './llm-providers';
import { TavilyService } from './tavily.service';
import { FirecrawlService } from './firecrawl.service';
import { CompanyRepository } from './company.repository';
import { ResearchError } from './research-error';
import {
  reportFixture,
  reportDraftFixture,
  toLlmReport,
} from '../../test/company-report.fixture';

jest.mock('./research-follow-up', () => {
  const actual = jest.requireActual<typeof import('./research-follow-up')>(
    './research-follow-up',
  );
  return {
    ...actual,
    investigateFollowUps: jest.fn().mockResolvedValue({
      queries: [],
      searchCalls: 0,
      readCalls: 0,
      plannerFailed: false,
      stopReason: 'complete',
    }),
  };
});
jest.mock('./location-intelligence', () => {
  const actual = jest.requireActual<typeof import('./location-intelligence')>(
    './location-intelligence',
  );
  return {
    ...actual,
    investigateLocation: jest.fn().mockImplementation(() =>
      Promise.resolve({
        facts: actual.unknownLocationFacts(),
        queries: [],
        searchCalls: 0,
        readCalls: 0,
        assessmentFailures: 0,
        stopReason: 'not-run',
      }),
    ),
  };
});

function result(
  content: LanguageModelV3GenerateResult['content'],
): LanguageModelV3GenerateResult {
  return {
    content,
    finishReason: {
      unified: content[0]?.type === 'tool-call' ? 'tool-calls' : 'stop',
      raw: undefined,
    },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}
function call(
  toolName: string,
  input: object,
  toolCallId = 'call',
): LanguageModelV3GenerateResult {
  return result([
    { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) },
  ]);
}
const searchStep = call('search', { query: 'Acme company' });
const readStep = call('readPage', { url: 'https://acme.com/' });
const doneStep = result([{ type: 'text', text: 'Research complete' }]);
const reportStep = (report: unknown) =>
  result([{ type: 'text', text: JSON.stringify(toLlmReport(report)) }]);

describe('Company intelligence agent (real SDK loop, scripted model)', () => {
  let logger: jest.SpyInstance;
  let debugLogger: jest.SpyInstance;
  beforeAll(() => {
    debugLogger = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterAll(() => {
    logger.mockRestore();
    debugLogger.mockRestore();
  });

  function setup(
    steps = [searchStep, readStep, doneStep, reportStep(reportDraftFixture)],
  ) {
    const model = new MockLanguageModelV3({ doGenerate: steps });
    const providers = { model: jest.fn().mockReturnValue(model) };
    const tavily = {
      searchWeb: jest.fn().mockResolvedValue([
        {
          title: 'Discovered title',
          url: 'https://acme.com/',
          content: 'Evidence',
        },
      ]),
    };
    const firecrawl = {
      readPage: jest.fn().mockResolvedValue({ content: 'Read page evidence' }),
    };
    const repository = {
      findFreshCache: jest
        .fn<
          ReturnType<CompanyRepository['findFreshCache']>,
          Parameters<CompanyRepository['findFreshCache']>
        >()
        .mockResolvedValue({ company: null, roles: null }),
      findReport: jest.fn().mockResolvedValue(null),
      persistReport: jest
        .fn()
        .mockImplementation((request: unknown, content: unknown) =>
          Promise.resolve(content),
        ),
    };
    const config = new ConfigService({
      TAVILY_API_KEY: 'test',
      FIRECRAWL_API_KEY: 'test',
    });
    const candidateProfiles = new CandidateProfileService();
    const service = new CompanyIntelligenceService(
      providers as unknown as LlmProviders,
      tavily as unknown as TavilyService,
      firecrawl as unknown as FirecrawlService,
      repository as unknown as CompanyRepository,
      config,
      candidateProfiles,
    );
    return {
      service,
      model,
      providers,
      tavily,
      firecrawl,
      repository,
      candidateProfiles,
    };
  }
  const request = { companyName: 'Acme', provider: 'deepseek' as const };

  it.each(['QUICK', 'DEEP'] as const)(
    'uses an internal Flash override for %s company-only research without a role scan',
    async (mode) => {
      const output = toLlmReport(reportDraftFixture) as Record<string, unknown>;
      delete output.relevantRoles;
      delete output.roleDiscoverySummary;
      const context = setup([
        searchStep,
        readStep,
        doneStep,
        result([{ type: 'text', text: JSON.stringify(output) }]),
      ]);
      const report = await context.service.research(request, mode, {
        modelName: 'deepseek-flash',
        companyOnly: true,
      });
      expect(context.providers.model).toHaveBeenCalledWith(
        'deepseek',
        'deepseek-flash',
      );
      expect(report.relevantRoles).toEqual([]);
      expect(context.repository.persistReport).toHaveBeenCalledWith(
        request,
        expect.any(Object),
        expect.any(Date),
        mode,
        'not-configured',
        expect.objectContaining({
          scope: 'company',
          metadata: expect.objectContaining({
            roles: 'not-requested',
            rolesRefreshedAt: null,
          }),
        }),
      );
      const synthesis = JSON.stringify(
        context.model.doGenerateCalls.at(-1)?.prompt,
      );
      expect(synthesis).toContain('COMPANY INFORMATION ONLY');
      if (mode === 'QUICK') {
        expect(synthesis).toContain('Do not mine reviews');
        expect(report.interviewInsights).toBeNull();
      } else {
        expect(synthesis).toContain('FULL investigation');
        expect(report.interviewInsights?.limitations.join(' ')).toContain(
          'Glassdoor',
        );
      }
    },
  );

  it('keeps QUICK budgets materially below FULL including follow-ups and office work', () => {
    const quick = RESEARCH_LIMITS.QUICK;
    const full = RESEARCH_LIMITS.DEEP;
    expect(quick.timeoutMs).toBeLessThan(full.timeoutMs / 2);
    expect(quick.reportTokens).toBeLessThan(full.reportTokens / 2);
    expect(
      quick.searches +
        locationResearch.LOCATION_LIMITS.QUICK.searches +
        locationResearch.LOCATION_LIMITS.QUICK.followUpSearches,
    ).toBeLessThan(
      full.searches +
        followUpResearch.FOLLOW_UP_LIMITS.publicSignalSearches +
        followUpResearch.FOLLOW_UP_LIMITS.leadSearches,
    );
    expect(
      quick.scrapes + locationResearch.LOCATION_LIMITS.QUICK.reads,
    ).toBeLessThan(full.scrapes);
  });

  it('searches, reads, synthesizes, validates and persists with server metadata', async () => {
    const context = setup();
    const report = await context.service.research(request);
    expect(context.providers.model).toHaveBeenCalledWith('deepseek');
    expect(context.model.doGenerateCalls).toHaveLength(4);
    expect(context.firecrawl.readPage).toHaveBeenCalledWith(
      'https://acme.com/',
      new Set(['https://acme.com/']),
      expect.any(AbortSignal),
    );
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        sources: [
          { ...reportDraftFixture.sources[0], title: 'Discovered title' },
        ],
      }),
      expect.any(Date),
      'DEEP',
      'not-configured',
      expect.objectContaining({ scope: 'full' }),
    );
    expect(report.redFlags).toEqual([]);
    expect(report).toMatchObject({
      companySummary: reportDraftFixture.companySummary,
    });
  });

  it('runs the bounded follow-up phase through the shared tools, never reads login-walled posts and cites public signals', async () => {
    const actual = jest.requireActual<typeof import('./research-follow-up')>(
      './research-follow-up',
    );
    const linkedInUrl =
      'https://www.linkedin.com/posts/acme-cto_engineering-activity-1';
    const meetupUrl = 'https://www.meetup.com/tel-aviv-backend/events/123';
    const draft = {
      ...reportDraftFixture,
      publicSignals: [
        {
          title: 'ציפייה ל-impact מהיר',
          observation:
            'פוסטים של ה-CTO חוזרים על ציפייה ל-impact כבר מהשבוע הראשון.',
          interpretation:
            'ייתכן שמדובר בסביבה עם אוטונומיה גבוהה וזמן קליטה קצר.',
          candidateImplication: null,
          confidence: 'high' as const,
          signalType: 'yellow' as const,
          sourceKind: 'leadership' as const,
          corroborated: true,
          sourceUrls: [linkedInUrl, meetupUrl],
        },
      ],
      overallAssessment: {
        summary: 'פעילות קהילה וגיוס מעידות על ארגון פיתוח פעיל בישראל.',
        findings: [
          {
            statement: 'החברה מארחת מיטאפים של Backend במשרד.',
            status: 'verified' as const,
            sourceUrls: [meetupUrl],
          },
        ],
      },
    };
    const planLeads = jest.fn().mockResolvedValue({
      leads: [
        {
          kind: 'technology',
          anchor: 'Kafka',
          query: 'Kafka platform team Israel',
          reason: 'Kafka הוזכר בהרצאה במיטאפ',
        },
      ],
    });
    jest
      .mocked(followUpResearch.investigateFollowUps)
      .mockImplementationOnce((input) =>
        actual.investigateFollowUps({ ...input, planLeads }),
      );
    const context = setup([searchStep, readStep, doneStep, reportStep(draft)]);
    context.tavily.searchWeb.mockImplementation((query: string) =>
      Promise.resolve(
        /LinkedIn/.test(query)
          ? [
              {
                title: 'CTO post',
                url: linkedInUrl,
                content: 'We expect impact from day one',
              },
            ]
          : /meetup/.test(query)
            ? [
                {
                  title: 'Backend meetup at Acme',
                  url: meetupUrl,
                  content: 'Hosted at the Acme office',
                },
              ]
            : [
                {
                  title: 'Discovered title',
                  url: 'https://acme.com/',
                  content: 'Evidence',
                },
              ],
      ),
    );
    const report = await context.service.research(request);
    const queries = (context.tavily.searchWeb.mock.calls as string[][]).map(
      (searchCall) => searchCall[0],
    );
    expect(queries).toEqual(
      expect.arrayContaining([
        ...actual.publicSignalQueries('Acme'),
        'Acme Kafka platform team Israel',
      ]),
    );
    expect(planLeads).toHaveBeenCalledTimes(1);
    expect(context.firecrawl.readPage).not.toHaveBeenCalledWith(
      linkedInUrl,
      expect.anything(),
      expect.anything(),
    );
    expect(report.publicSignals).toHaveLength(1);
    expect(report.overallAssessment?.findings).toHaveLength(1);
    expect(report.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: linkedInUrl, sourceType: 'social' }),
        expect.objectContaining({ url: meetupUrl, sourceType: 'event' }),
      ]),
    );
  });

  it('runs targeted office searches through the shared tools and projects grounded third-party floor evidence', async () => {
    const actual = jest.requireActual<typeof import('./location-intelligence')>(
      './location-intelligence',
    );
    const sourceUrl = 'https://acme.com/';
    const designUrl = 'https://design.example.com/acme-office';
    const fact = (value: string, url = sourceUrl) => ({
      value,
      status: 'VERIFIED' as const,
      sourceUrls: [url],
      credibility: 'high' as const,
      rationale: 'פרסום ישיר',
      conflicting: false,
      officeScope: 'israel' as const,
    });
    const facts = {
      ...actual.unknownLocationFacts(),
      city: fact('הרצליה'),
      address: fact('הדוגמה 8'),
      building: fact('Example Tower'),
      buildingFloors: { ...fact('12'), value: 12 },
      workModel: {
        ...fact('בישראל: 3 ימים במשרד'),
        officeScope: 'israel' as const,
      },
    };
    const updated = { ...facts, companyFloors: fact('7–9', designUrl) };
    const assess = jest
      .fn()
      .mockResolvedValueOnce(facts)
      .mockResolvedValue(updated);
    jest
      .mocked(locationResearch.investigateLocation)
      .mockImplementationOnce((input) =>
        actual.investigateLocation({ ...input, assess }),
      );
    const context = setup();
    context.tavily.searchWeb
      .mockResolvedValueOnce([
        { title: 'Acme', url: sourceUrl, content: 'Company evidence' },
      ])
      .mockResolvedValue([
        {
          title: 'Acme office design',
          url: designUrl,
          content: 'Company floors 7–9 at Example Tower',
        },
      ]);
    const report = await context.service.research(request, 'QUICK');
    expect(context.tavily.searchWeb).toHaveBeenCalledTimes(3);
    expect(
      (context.tavily.searchWeb.mock.calls as unknown[][])[2][0],
    ).toContain('floor');
    expect(context.firecrawl.readPage).toHaveBeenLastCalledWith(
      designUrl,
      new Set([sourceUrl, designUrl]),
      expect.any(AbortSignal),
    );
    expect(report.location).toMatchObject({
      buildingFloors: 12,
      companyFloors: '7–9',
      floor: '7–9',
    });
    expect(report.quickBrief?.workModel).toBe('בישראל: 3 ימים במשרד');
    expect(report.researchQuality?.officeEvidenceLevel).toBe('strong');
    expect(report.sources).toContainEqual({
      title: 'Acme office design',
      url: designUrl,
      sourceType: 'other',
    });
    expect(report.redFlags).toEqual([]);
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.any(Object),
      expect.any(Date),
      'QUICK',
      'not-configured',
      expect.objectContaining({
        locationIntelligence: expect.objectContaining({
          searchCalls: 1,
        }) as unknown,
      }),
    );
  });

  it('can recover from empty general search results through a targeted office search without weakening final evidence checks', async () => {
    const actual = jest.requireActual<typeof import('./location-intelligence')>(
      './location-intelligence',
    );
    const fact = (value: string) => ({
      value,
      status: 'VERIFIED' as const,
      sourceUrls: ['https://acme.com/'],
      credibility: 'high' as const,
      rationale: 'ראיה ישירה',
      conflicting: false,
      officeScope: 'israel' as const,
    });
    const facts = {
      ...actual.unknownLocationFacts(),
      city: fact('הרצליה'),
      address: fact('הדוגמה 8'),
      building: fact('Example Tower'),
      companyFloors: fact('7–9'),
      buildingFloors: { ...fact('12'), value: 12 },
      workModel: { ...fact('היברידי בישראל'), officeScope: 'israel' as const },
    };
    jest
      .mocked(locationResearch.investigateLocation)
      .mockImplementationOnce((input) =>
        actual.investigateLocation({
          ...input,
          assess: () => Promise.resolve(facts),
        }),
      );
    const context = setup([
      ...Array.from(
        { length: RESEARCH_LIMITS.QUICK.searches },
        () => searchStep,
      ),
      doneStep,
      reportStep(reportDraftFixture),
    ]);
    context.tavily.searchWeb
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          title: 'Discovered company office',
          url: 'https://acme.com/',
          content: 'Company office information',
        },
      ]);
    const report = await context.service.research(request, 'QUICK');
    expect(context.tavily.searchWeb).toHaveBeenCalledTimes(
      RESEARCH_LIMITS.QUICK.searches + 1,
    );
    expect(report.location?.city).toBe('הרצליה');
    expect(report.sources[0].url).toBe('https://acme.com/');
  });

  it('uses remaining general budget for explicit missing roles and local R&D without extra LLM planning calls', async () => {
    const context = setup();
    const roleUrl = 'https://acme.com/jobs/backend';
    context.tavily.searchWeb
      .mockResolvedValueOnce([
        {
          title: 'Company',
          url: 'https://acme.com/',
          content: 'Company overview',
        },
        {
          title: 'Generic article',
          url: 'https://acme.com/article',
          content: 'General information',
        },
      ])
      .mockResolvedValue([
        {
          title: 'Backend Developer',
          url: roleUrl,
          content: 'Backend engineering job in Israel',
        },
      ]);
    await context.service.research(
      { ...request, role: 'Backend Developer' },
      'QUICK',
    );
    const queries = (context.tavily.searchWeb.mock.calls as unknown[][]).map(
      (call) => String(call[0]),
    );
    expect(
      queries.some(
        (query) =>
          query.includes('Backend Developer') && query.includes('careers'),
      ),
    ).toBe(true);
    expect(queries.some((query) => query.includes('Israel R&D'))).toBe(true);
    expect(queries).toHaveLength(RESEARCH_LIMITS.QUICK.searches);
    expect(context.model.doGenerateCalls).toHaveLength(4);
    expect((context.firecrawl.readPage.mock.calls as unknown[][])[1][0]).toBe(
      roleUrl,
    );
  });

  it('returns grounded contradiction notes and citations as limitations without manufacturing red flags', async () => {
    const facts = locationResearch.unknownLocationFacts();
    const propertyUrl = 'https://property.example.com/acme';
    const rationale =
      'פרויקט המשרדים תואר כפרוס על 5 קומות, אך הבניין תואר כבן 4 קומות; התפוסה לא הוכרעה.';
    facts.companyFloors = {
      ...facts.companyFloors,
      sourceUrls: [propertyUrl],
      rationale,
      conflicting: true,
      credibility: 'high',
      officeScope: 'israel',
    };
    jest.mocked(locationResearch.investigateLocation).mockResolvedValueOnce({
      facts,
      queries: [],
      searchCalls: 1,
      readCalls: 0,
      assessmentFailures: 0,
      stopReason: 'budget',
    });
    const context = setup();
    context.tavily.searchWeb.mockResolvedValue([
      {
        title: 'Company',
        url: 'https://acme.com/',
        content: 'Company evidence',
      },
      {
        title: 'Property article',
        url: propertyUrl,
        content: 'Building and office project information',
      },
    ]);
    const report = await context.service.research(request, 'QUICK');
    expect(report.location?.companyFloors).toBeNull();
    expect(report.location?.verificationNote).toContain('סותר');
    expect(report.researchQuality?.limitations).toContain(rationale);
    expect(report.redFlags).toEqual([]);
    expect(report.quickBrief?.redFlags).toEqual([]);
    expect(report.sources).toContainEqual({
      title: 'Property article',
      url: propertyUrl,
      sourceType: 'other',
    });
  });

  it('uses a role-only synthesis schema and preserves cached company facts during a real SDK loop', async () => {
    const llmOutput = toLlmReport(reportDraftFixture) as Record<
      string,
      unknown
    >;
    const roleOutput = {
      relevantRoles: [],
      roleDiscoverySummary: 'No relevant posting found within budget.',
      sources: llmOutput.sources,
    };
    const context = setup([
      searchStep,
      readStep,
      doneStep,
      result([{ type: 'text', text: JSON.stringify(roleOutput) }]),
    ]);
    context.repository.findFreshCache.mockResolvedValue({
      company: {
        content: companySection(reportFixture),
        refreshedAt: new Date('2026-10-24T00:00:00Z'),
        mode: 'DEEP',
        reportId: 'cached-company',
      },
      roles: null,
    });
    const report = await context.service.research(request, 'QUICK');
    expect(report.companySummary).toBe(reportFixture.companySummary);
    expect(report.website).toBe(reportFixture.website);
    expect(report.roleDiscoverySummary).toContain('לא צוין תפקיד מבוקש');
    const synthesis = context.model.doGenerateCalls[3];
    expect(synthesis.responseFormat?.type).toBe('json');
    expect(JSON.stringify(synthesis.responseFormat)).not.toContain(
      'companySummary',
    );
    expect(JSON.stringify(synthesis.prompt)).toContain('RELEVANT ROLES ONLY');
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.any(Object),
      expect.any(Date),
      'QUICK',
      'not-configured',
      expect.objectContaining({ scope: 'roles' }),
    );
  });

  it('keeps cached company information when a successful role search finds no useful evidence', async () => {
    const context = setup([
      ...Array.from(
        { length: RESEARCH_LIMITS.QUICK.searches },
        () => searchStep,
      ),
      doneStep,
    ]);
    context.tavily.searchWeb.mockResolvedValue([]);
    context.repository.findFreshCache.mockResolvedValue({
      company: {
        content: companySection(reportFixture),
        refreshedAt: new Date('2026-10-24T00:00:00Z'),
        mode: 'DEEP',
        reportId: 'cached-company',
      },
      roles: null,
    });
    const report = await context.service.research(request, 'QUICK');
    expect(report.companySummary).toBe(reportFixture.companySummary);
    expect(report.relevantRoles).toEqual([]);
    expect(report.roleDiscoverySummary).toContain(
      'לא נמצאו ראיות שימושיות למשרות',
    );
    expect(context.firecrawl.readPage).not.toHaveBeenCalled();
    expect(context.model.doGenerateCalls).toHaveLength(
      RESEARCH_LIMITS.QUICK.searches + 1,
    );
    expect(report.sources).toEqual(reportFixture.sources);
  });

  it('uses a company-only synthesis schema and preserves cached roles during a real SDK loop', async () => {
    const output = toLlmReport(reportDraftFixture) as Record<string, unknown>;
    delete output.relevantRoles;
    delete output.roleDiscoverySummary;
    const context = setup([
      searchStep,
      readStep,
      doneStep,
      result([{ type: 'text', text: JSON.stringify(output) }]),
    ]);
    context.repository.findFreshCache.mockResolvedValue({
      company: null,
      roles: {
        content: roleSection({
          ...reportFixture,
          roleDiscoverySummary: 'Cached role results',
        }),
        refreshedAt: new Date('2026-10-24T00:00:00Z'),
        mode: 'DEEP',
        reportId: 'cached-roles',
      },
    });
    const report = await context.service.research(request, 'DEEP');
    expect(report.roleDiscoverySummary).toBe('Cached role results');
    expect(
      JSON.stringify(context.model.doGenerateCalls[3].responseFormat),
    ).not.toContain('relevantRoles');
    expect(JSON.stringify(context.model.doGenerateCalls[0].prompt)).toContain(
      'COMPANY INFORMATION ONLY',
    );
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'forces %s search then a model-selected page read before restoring flexible selection',
    async (mode) => {
      const selectedUrl = 'https://acme.com/engineering';
      const output = {
        ...reportDraftFixture,
        sources: [
          {
            title: 'Engineering',
            url: selectedUrl,
            sourceType: 'company-site',
          },
        ],
      };
      const context = setup([
        searchStep,
        call('readPage', { url: selectedUrl }),
        ...(mode === 'DEEP'
          ? [call('readPage', { url: 'https://acme.com/about' })]
          : []),
        doneStep,
        reportStep(output),
      ]);
      context.tavily.searchWeb.mockResolvedValue([
        {
          title: 'About',
          url: 'https://acme.com/about',
          content: 'Company overview',
        },
        {
          title: 'Engineering',
          url: selectedUrl,
          content: 'Engineering overview',
        },
      ]);
      await context.service.research(request, mode);
      expect(context.model.doGenerateCalls[0].toolChoice).toEqual({
        type: 'required',
      });
      expect(context.model.doGenerateCalls[1].toolChoice).toEqual({
        type: 'required',
      });
      expect(
        context.model.doGenerateCalls[mode === 'DEEP' ? 3 : 2].toolChoice,
      ).toEqual({
        type: 'auto',
      });
      expect(
        context.model.doGenerateCalls[mode === 'DEEP' ? 3 : 2].tools?.map(
          (tool) => tool.name,
        ),
      ).toEqual(mode === 'DEEP' ? ['search'] : ['search', 'readPage']);
      expect(context.firecrawl.readPage).toHaveBeenCalledWith(
        selectedUrl,
        new Set(['https://acme.com/about', selectedUrl]),
        expect.any(AbortSignal),
      );
    },
  );

  it.each(['QUICK', 'DEEP'] as const)(
    'forces another %s search after empty discovery, then forces the first page read',
    async (mode) => {
      const context = setup([
        searchStep,
        searchStep,
        readStep,
        doneStep,
        reportStep(reportDraftFixture),
      ]);
      context.tavily.searchWeb.mockResolvedValueOnce([]);
      await context.service.research(request, mode);
      expect(
        context.model.doGenerateCalls
          .slice(0, 4)
          .map((step) => step.toolChoice),
      ).toEqual([
        { type: 'tool', toolName: 'search' },
        { type: 'tool', toolName: 'search' },
        { type: 'tool', toolName: 'readPage' },
        { type: 'auto' },
      ]);
      expect(context.tavily.searchWeb).toHaveBeenCalledTimes(3);
      expect(context.firecrawl.readPage).toHaveBeenCalledTimes(1);
    },
  );

  it('does not force or execute search after the search budget is exhausted with no URLs', async () => {
    const context = setup([
      ...Array.from(
        { length: RESEARCH_LIMITS.QUICK.searches },
        () => searchStep,
      ),
      doneStep,
    ]);
    context.tavily.searchWeb.mockResolvedValue([]);
    await expect(
      context.service.research(request, 'QUICK'),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
    expect(context.tavily.searchWeb).toHaveBeenCalledTimes(
      RESEARCH_LIMITS.QUICK.searches,
    );
    expect(
      context.model.doGenerateCalls[RESEARCH_LIMITS.QUICK.searches].toolChoice,
    ).toEqual({
      type: 'auto',
    });
    expect(
      context.model.doGenerateCalls[RESEARCH_LIMITS.QUICK.searches].tools?.map(
        (tool) => tool.name,
      ),
    ).not.toContain('search');
    expect(context.firecrawl.readPage).not.toHaveBeenCalled();
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'persists a valid %s report with no official website evidence',
    async (mode) => {
      const output = {
        ...reportDraftFixture,
        sources: [{ ...reportDraftFixture.sources[0], sourceType: 'news' }],
      };
      const context = setup([
        searchStep,
        readStep,
        doneStep,
        reportStep(output),
      ]);
      const report = await context.service.research(request, mode);
      expect(report.website).toBeNull();
      expect(context.repository.persistReport).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ website: null }),
        expect.any(Date),
        mode,
        'not-configured',
        expect.objectContaining({ scope: 'full' }),
      );
    },
  );

  it.each([
    {
      ...reportDraftFixture,
      sources: [
        { ...reportDraftFixture.sources[0], url: 'https://invented.com/' },
      ],
    },
    { ...reportDraftFixture, website: 'https://invented.com/' },
    { ...reportDraftFixture, sources: [] },
    { ...reportDraftFixture, companySummary: '' },
    { ...reportDraftFixture, companySummary: 'See https://invented.com/' },
    { ...reportDraftFixture, relevantRoles: [{ title: 'Invented role' }] },
  ])('does not persist invalid output or invented evidence', async (report) => {
    const context = setup([searchStep, readStep, doneStep, reportStep(report)]);
    await expect(context.service.research(request)).rejects.toBeInstanceOf(
      ResearchError,
    );
    expect(context.repository.persistReport).not.toHaveBeenCalled();
  });

  it('rejects an undiscovered scrape URL before the adapter is called', async () => {
    const context = setup([
      searchStep,
      call('readPage', { url: 'https://invented.com/' }),
    ]);
    await expect(context.service.research(request)).rejects.toMatchObject({
      code: 'EVIDENCE_INVALID',
    });
    expect(context.firecrawl.readPage).not.toHaveBeenCalled();
  });

  it('uses the smaller QUICK budget, passes the profile and persists mode', async () => {
    const context = setup();
    await context.service.research(request, 'QUICK');
    expect(context.model.doGenerateCalls[0].maxOutputTokens).toBe(
      RESEARCH_LIMITS.QUICK.stepTokens,
    );
    expect(context.model.doGenerateCalls.at(-1)?.maxOutputTokens).toBe(
      RESEARCH_LIMITS.QUICK.reportTokens,
    );
    expect(JSON.stringify(context.model.doGenerateCalls[0].prompt)).toContain(
      'not-configured',
    );
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ relevantRoles: [] }),
      expect.any(Date),
      'QUICK',
      'not-configured',
      expect.objectContaining({ scope: 'full' }),
    );
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'enforces %s search budgets even for parallel model tool calls',
    async (mode) => {
      const manySearches = result(
        Array.from({ length: 10 }, (_, index) => ({
          type: 'tool-call' as const,
          toolCallId: `call-${index}`,
          toolName: 'search',
          input: JSON.stringify({ query: 'Acme' }),
        })),
      );
      const context = setup([
        manySearches,
        readStep,
        doneStep,
        reportStep(reportDraftFixture),
      ]);
      await context.service.research(request, mode);
      expect(context.tavily.searchWeb).toHaveBeenCalledTimes(
        RESEARCH_LIMITS[mode].searches,
      );
    },
  );

  it.each(['QUICK', 'DEEP'] as const)(
    'enforces the %s scrape budget for multiple tool calls in one step',
    async (mode) => {
      const manyReads = result(
        Array.from({ length: 10 }, (_, index) => ({
          type: 'tool-call' as const,
          toolCallId: `read-${index}`,
          toolName: 'readPage',
          input: JSON.stringify({ url: `https://acme.com/${index || ''}` }),
        })),
      );
      const context = setup([
        searchStep,
        manyReads,
        doneStep,
        reportStep(reportDraftFixture),
      ]);
      context.tavily.searchWeb.mockResolvedValue(
        Array.from({ length: 10 }, (_, index) => ({
          title: 'Acme',
          url: `https://acme.com/${index || ''}`,
          content: 'Evidence',
        })),
      );
      await context.service.research(request, mode);
      expect(context.firecrawl.readPage).toHaveBeenCalledTimes(
        RESEARCH_LIMITS[mode].scrapes,
      );
    },
  );

  it('classifies malformed structured output and LLM provider failures', async () => {
    const malformed = setup([
      searchStep,
      readStep,
      doneStep,
      result([{ type: 'text', text: 'invalid JSON' }]),
    ]);
    await expect(malformed.service.research(request)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_INVALID',
    });
    expect(malformed.repository.persistReport).not.toHaveBeenCalled();
    const providerFailure = setup();
    providerFailure.model.doGenerate = () =>
      Promise.reject(new Error('secret provider body'));
    await expect(
      providerFailure.service.research(request),
    ).rejects.toMatchObject({ code: 'LLM_FAILURE' });
    expect(providerFailure.repository.persistReport).not.toHaveBeenCalled();
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'bounds the %s research loop then synthesizes once',
    async (mode) => {
      const context = setup([
        searchStep,
        ...Array.from(
          { length: RESEARCH_LIMITS[mode].steps - 1 },
          () => readStep,
        ),
        reportStep(reportDraftFixture),
      ]);
      await context.service.research(request, mode);
      expect(context.model.doGenerateCalls).toHaveLength(
        RESEARCH_LIMITS[mode].steps + 1,
      );
      expect(context.firecrawl.readPage).toHaveBeenCalledTimes(1);
    },
  );

  it('evaluates multiple role matches in the single synthesis call using the supplied structured profile', async () => {
    const roles = [
      'Senior Backend Engineer',
      'Backend Infrastructure Engineer',
    ].map((title, index) => ({
      title,
      url: `https://acme.com/job/${index}`,
      location: null,
      workModel: null,
      requirements: ['Java'],
      matchScore: 80,
      matchSummary: 'Synthetic transferable experience assessment.',
      matchedSkills: ['Java'],
      gaps: [],
    }));
    const output = {
      ...reportDraftFixture,
      relevantRoles: roles,
      sources: [
        ...reportDraftFixture.sources,
        ...roles.map((role) => ({
          title: role.title,
          url: role.url,
          sourceType: 'job-posting',
        })),
      ],
    };
    const context = setup([
      searchStep,
      readStep,
      call('readPage', { url: roles[0].url }),
      doneStep,
      reportStep(output),
    ]);
    jest.spyOn(context.candidateProfiles, 'getProfile').mockReturnValue({
      ...candidateProfile,
      status: 'configured',
      programmingLanguages: ['Java'],
    });
    context.tavily.searchWeb.mockResolvedValue([
      { title: 'Acme', url: 'https://acme.com/', content: 'Company' },
      ...roles.map((role) => ({
        title: role.title,
        url: role.url,
        content: role.title + ' Java',
      })),
    ]);
    const report = await context.service.research(request, 'DEEP');
    expect(report.relevantRoles).toHaveLength(2);
    expect(report.relevantRoles[0]).toMatchObject({
      matchScore: 80,
      evidenceLevel: 'page-read',
    });
    expect(context.model.doGenerateCalls).toHaveLength(5);
    expect(
      JSON.stringify(context.model.doGenerateCalls.at(-1)?.prompt),
    ).toContain('programmingLanguages');
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ relevantRoles: report.relevantRoles }),
      expect.any(Date),
      'DEEP',
      'configured',
      expect.objectContaining({ scope: 'full' }),
    );
  });

  it('persists a QUICK company report containing a partially supported snippet-only role', async () => {
    const firstUrl = 'https://acme.com/jobs/backend';
    const secondUrl = 'https://acme.com/jobs/infrastructure';
    const roles = [
      {
        title: 'Unverified principal title',
        url: firstUrl,
        location: 'London',
        workModel: 'Remote',
        requirements: ['Java', 'Ten years of Rust'],
        matchScore: 75,
        matchSummary: 'Provisional backend fit assessment.',
        matchedSkills: ['Java'],
        gaps: ['Specific framework experience needs confirmation.'],
      },
      {
        title: 'Backend Infrastructure Engineer',
        url: secondUrl,
        location: 'Tel Aviv',
        workModel: 'Hybrid',
        requirements: ['Java'],
        matchScore: 80,
        matchSummary: 'Synthetic infrastructure fit assessment.',
        matchedSkills: ['Java'],
        gaps: [],
      },
    ];
    const output = {
      ...reportDraftFixture,
      relevantRoles: roles,
      sources: [
        ...reportDraftFixture.sources,
        ...roles.map((role) => ({
          title: role.title,
          url: role.url,
          sourceType: 'job-posting',
        })),
      ],
    };
    const groundedOutput = llmCompanyReportSchema.parse(toLlmReport(output));
    groundedOutput.relevantRoles[0].location.supported = false;
    groundedOutput.relevantRoles[0].workModel.supported = false;
    groundedOutput.relevantRoles[0].requirements[1].supported = false;
    const context = setup([
      searchStep,
      readStep,
      doneStep,
      result([{ type: 'text', text: JSON.stringify(groundedOutput) }]),
    ]);
    jest.spyOn(context.candidateProfiles, 'getProfile').mockReturnValue({
      ...candidateProfile,
      status: 'configured',
      programmingLanguages: ['Java'],
    });
    context.tavily.searchWeb.mockResolvedValue([
      { title: 'Acme', url: 'https://acme.com/', content: 'Company overview' },
      {
        title: 'Senior Backend Engineer',
        url: firstUrl,
        content: 'Senior Backend Engineer. Java.',
      },
      {
        title: roles[1].title,
        url: secondUrl,
        content: 'Backend Infrastructure Engineer. Tel Aviv. Hybrid. Java.',
      },
    ]);
    context.firecrawl.readPage.mockImplementation((url: unknown) =>
      url === firstUrl
        ? Promise.reject(
            new ResearchError('FIRECRAWL_FAILURE', 'Posting could not be read'),
          )
        : Promise.resolve({ content: 'Read page evidence' }),
    );
    const report = await context.service.research(request, 'QUICK');
    expect(report.relevantRoles).toHaveLength(2);
    expect(report.relevantRoles[0]).toMatchObject({
      title: 'Senior Backend Engineer',
      url: firstUrl,
      location: null,
      workModel: null,
      requirements: ['Java'],
      matchScore: 75,
      matchSummary: roles[0].matchSummary,
      gaps: roles[0].gaps,
      evidenceLevel: 'search-snippet',
    });
    expect(report.relevantRoles[0].evidenceSummary).toContain(
      'פרטים שלא אומתו הושמטו',
    );
    expect(report.relevantRoles[1]).toMatchObject(roles[1]);
    expect(context.repository.persistReport).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ relevantRoles: report.relevantRoles }),
      expect.any(Date),
      'QUICK',
      'configured',
      expect.objectContaining({ scope: 'full' }),
    );
  });

  it('rejects invalid candidate configuration before external calls without exposing its values', async () => {
    const context = setup();
    jest
      .spyOn(context.candidateProfiles, 'getProfile')
      .mockImplementation(() => {
        throw new Error('private profile value');
      });
    await expect(
      context.service.research(request, 'QUICK'),
    ).rejects.toMatchObject({ code: 'CANDIDATE_PROFILE_INVALID' });
    expect(context.providers.model).not.toHaveBeenCalled();
    expect(context.tavily.searchWeb).not.toHaveBeenCalled();
    expect(context.repository.persistReport).not.toHaveBeenCalled();
  });

  it('fails only without usable evidence and logs diagnostics without adding them to the public error', async () => {
    const context = setup([
      ...Array.from(
        { length: RESEARCH_LIMITS.QUICK.searches },
        () => searchStep,
      ),
      doneStep,
    ]);
    context.tavily.searchWeb.mockResolvedValue([]);
    const failure: unknown = await context.service
      .research(request, 'QUICK')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ResearchError);
    if (!(failure instanceof ResearchError))
      throw new Error('Expected a research error');
    expect(failure.getResponse()).toEqual({
      code: 'EVIDENCE_INVALID',
      message: 'Research did not collect usable source evidence',
    });
    expect(
      context.model.doGenerateCalls[RESEARCH_LIMITS.QUICK.searches].toolChoice,
    ).toEqual({
      type: 'auto',
    });
    expect(logger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchCalls: RESEARCH_LIMITS.QUICK.searches,
        scrapeCalls: 0,
        discoveredSize: 0,
        pagesSize: 0,
      }),
    );
    expect(context.repository.persistReport).not.toHaveBeenCalled();
  });

  it('hard-fails complete Tavily failure when no usable evidence exists', async () => {
    const context = setup([
      ...Array.from(
        { length: RESEARCH_LIMITS.QUICK.searches },
        () => searchStep,
      ),
      doneStep,
    ]);
    context.tavily.searchWeb.mockRejectedValue(
      new ResearchError('TAVILY_FAILURE', 'Search failed'),
    );
    await expect(
      context.service.research(request, 'QUICK'),
    ).rejects.toMatchObject({ code: 'TAVILY_FAILURE' });
    expect(logger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchCalls: RESEARCH_LIMITS.QUICK.searches,
        scrapeCalls: 0,
        discoveredSize: 0,
        pagesSize: 0,
      }),
    );
    expect(context.repository.persistReport).not.toHaveBeenCalled();
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'persists a limited %s report when Firecrawl fails but snippets are usable',
    async (mode) => {
      const context = setup();
      context.firecrawl.readPage.mockRejectedValue(
        new ResearchError('FIRECRAWL_FAILURE', 'Page unavailable'),
      );
      const report = await context.service.research(request, mode);
      expect(report.researchQuality).toMatchObject({
        evidenceLevel: 'limited',
        sourcesDiscovered: 1,
        pagesRead: 0,
      });
      expect(report.researchQuality?.limitations.join(' ')).toContain(
        'לא נקראו עמודים',
      );
      expect(context.repository.persistReport).toHaveBeenCalled();
      expect(context.firecrawl.readPage).toHaveBeenCalledTimes(1);
    },
  );

  it('continues after one unreadable page and reads another source in DEEP', async () => {
    const otherUrl = 'https://acme.com/about';
    const output = {
      ...reportDraftFixture,
      sources: [
        ...reportDraftFixture.sources,
        { title: 'About', url: otherUrl, sourceType: 'company-site' },
      ],
    };
    const context = setup([
      searchStep,
      readStep,
      call('readPage', { url: otherUrl }),
      doneStep,
      reportStep(output),
    ]);
    context.tavily.searchWeb.mockResolvedValue([
      { title: 'Acme', url: 'https://acme.com/', content: 'Useful snippet' },
      { title: 'About', url: otherUrl, content: 'Company description' },
    ]);
    context.firecrawl.readPage
      .mockRejectedValueOnce(new ResearchError('FIRECRAWL_FAILURE', '403'))
      .mockResolvedValueOnce({ content: 'Read company overview' });
    const report = await context.service.research(request, 'DEEP');
    expect(report.researchQuality).toMatchObject({
      evidenceLevel: 'partial',
      pagesRead: 1,
      sourcesDiscovered: 2,
    });
    expect(report.researchQuality?.limitations.join(' ')).toContain('לא נקראו');
    expect(context.firecrawl.readPage).toHaveBeenCalledTimes(2);
  });

  it('records a safe resolved URL as metadata and cites only the original discovered identity', async () => {
    const context = setup();
    context.firecrawl.readPage.mockResolvedValue({
      content: 'Public redirected page',
      resolvedUrl: 'https://www.acme.com/about',
    });
    const report = await context.service.research(request, 'QUICK');
    expect(report.sources[0].url).toBe('https://acme.com/');
    expect(report.researchQuality?.sourcesDiscovered).toBe(1);
    expect(
      JSON.stringify(context.model.doGenerateCalls.at(-1)?.prompt),
    ).toContain('resolvedUrl');
    const inventedCitation = {
      ...reportDraftFixture,
      sources: [
        { ...reportDraftFixture.sources[0], url: 'https://www.acme.com/about' },
      ],
    };
    const invalid = setup([
      searchStep,
      readStep,
      doneStep,
      reportStep(inventedCitation),
    ]);
    invalid.firecrawl.readPage.mockResolvedValue({
      content: 'Redirected page',
      resolvedUrl: 'https://www.acme.com/about',
    });
    await expect(
      invalid.service.research(request, 'QUICK'),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
  });

  it('keeps unsafe page-read failures fatal even when snippets exist', async () => {
    const context = setup();
    context.firecrawl.readPage.mockRejectedValue(
      new ResearchError('EVIDENCE_INVALID', 'Unsafe redirect target'),
    );
    await expect(
      context.service.research(request, 'QUICK'),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
    expect(context.repository.persistReport).not.toHaveBeenCalled();
  });

  it('tolerates a later Tavily failure after useful evidence has been collected', async () => {
    const context = setup([
      searchStep,
      readStep,
      searchStep,
      doneStep,
      reportStep(reportDraftFixture),
    ]);
    context.tavily.searchWeb
      .mockResolvedValueOnce([
        {
          title: 'Acme',
          url: 'https://acme.com/',
          content: 'Useful company snippet',
        },
      ])
      .mockRejectedValueOnce(
        new ResearchError('TAVILY_FAILURE', 'Later focused search failed'),
      );
    const report = await context.service.research(request, 'QUICK');
    expect(report.researchQuality?.limitations).toContain(
      'חלק מהחיפושים הממוקדים נכשלו.',
    );
    expect(context.repository.persistReport).toHaveBeenCalled();
  });

  it('retains the overall deadline but treats an individual read timeout as partial evidence', async () => {
    const context = setup();
    context.firecrawl.readPage.mockRejectedValue(
      new ResearchError('TIMEOUT', 'Page timeout'),
    );
    const report = await context.service.research(request, 'QUICK');
    expect(report.researchQuality).toMatchObject({
      evidenceLevel: 'limited',
      pagesRead: 0,
    });
    expect(report.relevantRoles).toEqual([]);
  });

  it('preserves useful snippets when a repeated search result contains no new content', async () => {
    const context = setup([
      searchStep,
      readStep,
      searchStep,
      doneStep,
      reportStep(reportDraftFixture),
    ]);
    context.tavily.searchWeb
      .mockResolvedValueOnce([
        {
          title: 'Acme',
          url: 'https://acme.com/',
          content: 'Useful company evidence',
        },
      ])
      .mockResolvedValueOnce([
        { title: 'Acme', url: 'https://acme.com/', content: '' },
      ]);
    context.firecrawl.readPage.mockRejectedValue(
      new ResearchError('FIRECRAWL_FAILURE', 'Page unavailable'),
    );
    const report = await context.service.research(request, 'QUICK');
    expect(report.researchQuality).toMatchObject({
      evidenceLevel: 'limited',
      sourcesDiscovered: 1,
      pagesRead: 0,
    });
    expect(context.firecrawl.readPage).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(context.model.doGenerateCalls.at(-1)?.prompt),
    ).toContain('Useful company evidence');
  });

  it('classifies database failures without exposing their messages', async () => {
    const context = setup();
    context.repository.persistReport.mockRejectedValue(
      new Error('secret database detail'),
    );
    await expect(context.service.research(request)).rejects.toMatchObject({
      code: 'DATABASE_FAILURE',
    });
  });

  it('cuts off slow general QUICK research while preserving office and synthesis time', async () => {
    jest.useFakeTimers();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(
          () =>
            controller.abort(
              new DOMException('Research window exhausted', 'TimeoutError'),
            ),
          milliseconds,
        );
        return controller.signal;
      });
    try {
      const context = setup([
        searchStep,
        readStep,
        reportStep(reportDraftFixture),
      ]);
      context.firecrawl.readPage.mockImplementation(
        (_url: string, _urls: Set<string>, signal: AbortSignal) =>
          new Promise((_, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new ResearchError('TIMEOUT', 'Read timed out')),
              { once: true },
            ),
          ),
      );
      const completed = expect(
        context.service.research(request, 'QUICK'),
      ).resolves.toMatchObject({
        companySummary: reportDraftFixture.companySummary,
      });
      const generalWindow =
        RESEARCH_LIMITS.QUICK.timeoutMs -
        locationResearch.LOCATION_LIMITS.QUICK.phaseMs -
        locationResearch.LOCATION_LIMITS.QUICK.synthesisReserveMs;
      await jest.advanceTimersByTimeAsync(generalWindow + 1);
      await completed;
      expect(context.repository.persistReport).toHaveBeenCalled();
      expect(context.tavily.searchWeb).toHaveBeenCalledTimes(1);
      const saved = context.repository.persistReport.mock.calls as unknown[][];
      expect(saved[0][1]).toMatchObject({
        researchQuality: {
          limitations: expect.arrayContaining([
            'המחקר הכללי קוצר כדי להשאיר זמן לבדיקת פרטי המשרד.',
          ]) as unknown,
        },
      });
    } finally {
      timeout.mockRestore();
      jest.useRealTimers();
    }
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'cancels %s research at its deadline and does not persist',
    async (mode) => {
      jest.useFakeTimers();
      try {
        const context = setup();
        context.tavily.searchWeb.mockImplementation(
          (_query: string, signal: AbortSignal) =>
            new Promise((_, reject) =>
              signal.addEventListener(
                'abort',
                () => reject(new ResearchError('TIMEOUT', 'Timed out')),
                { once: true },
              ),
            ),
        );
        const pending = expect(
          context.service.research(request, mode),
        ).rejects.toMatchObject({ code: 'TIMEOUT' });
        await jest.advanceTimersByTimeAsync(
          RESEARCH_LIMITS[mode].timeoutMs + 1,
        );
        await pending;
        expect(context.repository.persistReport).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    },
  );
});
