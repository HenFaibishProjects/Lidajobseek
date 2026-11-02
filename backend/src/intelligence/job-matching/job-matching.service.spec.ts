import { MockLanguageModelV3 } from 'ai/test';
import { ActiveCandidateProfileService } from '../candidate-profile/active-candidate-profile.service';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { FirecrawlService } from '../company-intelligence/firecrawl.service';
import { LlmProviders } from '../company-intelligence/llm-providers';
import { TavilyService } from '../company-intelligence/tavily.service';
import {
  JOB_MATCH_CACHE_TTL_MS,
  JobMatchCacheRepository,
  jobMatchCacheKey,
} from './job-match-cache.repository';
import type { JobMatchContent, LlmJobMatch } from './job-match.schema';
import { JobMatchingService } from './job-matching.service';
import { configuredProfileFixture } from '../../test/candidate-profile.fixture';

const backendUrl = 'https://jobs.lever.co/acme/backend-1';
const platformUrl = 'https://jobs.lever.co/acme/platform-2';
const salesUrl = 'https://jobs.lever.co/acme/sales-3';

function scriptedModel(output: LlmJobMatch) {
  return new MockLanguageModelV3({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      }),
  });
}

function assessment(jobId: string, title: string) {
  return {
    jobId,
    title,
    team: null,
    location: 'Herzliya',
    locationRegion: 'israel' as const,
    workModel: 'Hybrid',
    workArrangement: 'hybrid' as const,
    officeDaysPerWeek: 2,
    roleFit: 'core' as const,
    seniorityFit: 'match' as const,
    vacancyStatus: 'appears-open' as const,
    requirements: [
      {
        requirement: 'Java',
        importance: 'required' as const,
        relation: 'direct' as const,
        profileSkills: ['Java'],
        note: null,
      },
    ],
    matchSummary: 'התפקיד מתאים לניסיון Backend שלך.',
    concerns: [],
  };
}

function setup(
  options: {
    profile?: CandidateProfile;
    output?: LlmJobMatch;
    cached?: { content: JobMatchContent; refreshedAt: Date } | null;
  } = {},
) {
  const profile = options.profile ?? configuredProfileFixture;
  const model = scriptedModel(
    options.output ?? {
      jobs: [
        assessment('job-1', 'Senior Backend Engineer'),
        assessment('job-404', 'Invented Staff Engineer'),
      ],
    },
  );
  const tavily = {
    searchWeb: jest.fn().mockResolvedValue([
      {
        title: 'Senior Backend Engineer - Acme',
        url: backendUrl,
        content: 'Herzliya, Israel. Java, Kubernetes.',
      },
      {
        title: 'Account Executive - Acme',
        url: salesUrl,
        content: 'Sales role',
      },
    ]),
  };
  const firecrawl = {
    readPage: jest
      .fn()
      .mockResolvedValue({ content: 'Senior Backend Engineer in Herzliya.' }),
  };
  const cache = {
    findFresh: jest.fn().mockResolvedValue(options.cached ?? null),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const profiles = { loadActiveProfile: jest.fn().mockResolvedValue(profile) };
  const providers = { model: jest.fn().mockReturnValue(model) };
  const service = new JobMatchingService(
    profiles as unknown as ActiveCandidateProfileService,
    cache as unknown as JobMatchCacheRepository,
    providers as unknown as LlmProviders,
    tavily as unknown as TavilyService,
    firecrawl as unknown as FirecrawlService,
  );
  return { service, tavily, firecrawl, cache, model, profiles };
}

const request = {
  companyName: 'Acme',
  provider: 'openai' as const,
  forceRefresh: false,
};

describe('Job matching workflow', () => {
  it('drops an assessment for an undiscovered job without failing the scan and skips irrelevant roles before reading', async () => {
    const context = setup();
    const result = await context.service.match(request);
    expect(result.relevantJobs).toHaveLength(1);
    expect(result.relevantJobs[0]).toMatchObject({
      title: 'Senior Backend Engineer',
      url: backendUrl,
      evidenceLevel: 'page-read',
      matchedSkills: ['Java'],
    });
    expect(result.jobsScanned).toBe(2);
    expect(context.firecrawl.readPage).toHaveBeenCalledTimes(1);
    expect(context.firecrawl.readPage).toHaveBeenCalledWith(
      backendUrl,
      expect.any(Set),
      expect.any(AbortSignal),
    );
    const prompt = JSON.stringify(context.model.doGenerateCalls[0].prompt);
    expect(prompt).not.toContain(salesUrl);
    expect(prompt).not.toContain('Account Executive');
    expect(result.cache.status).toBe('refreshed');
    expect(context.cache.save).toHaveBeenCalledTimes(1);
  });

  it('returns a successful empty result when no job matches', async () => {
    const context = setup({ output: { jobs: [] } });
    const result = await context.service.match(request);
    expect(result.relevantJobs).toEqual([]);
    expect(result.summary).toBe(
      'לא מצאתי כרגע משרות פתוחות שנראות מתאימות מספיק לפרופיל שלך.',
    );
  });

  it('skips the LLM entirely when discovery finds no engineering jobs', async () => {
    const context = setup();
    context.tavily.searchWeb.mockResolvedValue([]);
    const result = await context.service.match(request);
    expect(result.relevantJobs).toEqual([]);
    expect(context.model.doGenerateCalls).toHaveLength(0);
    expect(result.limitations).toContain(
      'לא אותרו עמודי משרות של החברה בחיפוש הנוכחי.',
    );
  });

  it('returns a fresh 7-day cache hit without searching', async () => {
    const refreshedAt = new Date(Date.now() - JOB_MATCH_CACHE_TTL_MS / 2);
    const content: JobMatchContent = {
      companyName: 'Acme',
      summary: 'נמצאה משרה אחת שעשויה להתאים לפרופיל שלך.',
      jobsScanned: 3,
      relevantJobs: [],
      limitations: [],
    };
    const context = setup({ cached: { content, refreshedAt } });
    const result = await context.service.match(request);
    expect(result.cache).toEqual({
      status: 'hit',
      refreshedAt: refreshedAt.toISOString(),
    });
    expect(context.tavily.searchWeb).not.toHaveBeenCalled();
    expect(context.cache.findFresh).toHaveBeenCalledWith(
      jobMatchCacheKey('Acme', configuredProfileFixture),
      expect.any(Date),
    );
  });

  it('bypasses the cache when forceRefresh is true', async () => {
    const context = setup({
      cached: {
        content: {
          companyName: 'Acme',
          summary: 'ישן',
          jobsScanned: 0,
          relevantJobs: [],
          limitations: [],
        },
        refreshedAt: new Date(),
      },
    });
    const result = await context.service.match({
      ...request,
      forceRefresh: true,
    });
    expect(context.cache.findFresh).not.toHaveBeenCalled();
    expect(context.tavily.searchWeb).toHaveBeenCalled();
    expect(result.cache.status).toBe('refreshed');
  });

  it('uses a different cache key when the candidate profile changes', () => {
    const original = jobMatchCacheKey('  ACME ', configuredProfileFixture);
    const changed = jobMatchCacheKey('acme', {
      ...configuredProfileFixture,
      cloud: ['GCP', 'AWS'],
    });
    expect(original.companyKey).toBe(changed.companyKey);
    expect(original.profileFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(changed.profileFingerprint).not.toBe(original.profileFingerprint);
  });

  it('fails with TAVILY_FAILURE and caches nothing when every search fails', async () => {
    const context = setup();
    context.tavily.searchWeb.mockRejectedValue(new Error('search down'));
    await expect(context.service.match(request)).rejects.toMatchObject({
      code: 'TAVILY_FAILURE',
    });
    expect(context.cache.save).not.toHaveBeenCalled();
  });

  it('keeps a second relevant job from a careers page link discovered in this scan', async () => {
    const context = setup({
      output: {
        jobs: [
          assessment('job-1', 'Senior Backend Engineer'),
          assessment('job-2', 'Platform Engineer'),
        ],
      },
    });
    context.tavily.searchWeb.mockResolvedValue([
      {
        title: 'Senior Backend Engineer - Acme',
        url: backendUrl,
        content: 'Herzliya, Israel',
      },
      { title: 'Acme Careers', url: 'https://acme.com/careers', content: '' },
    ]);
    context.firecrawl.readPage.mockImplementation((url: string) =>
      Promise.resolve({
        content:
          url === 'https://acme.com/careers'
            ? `[Platform Engineer, Tel Aviv](${platformUrl})`
            : 'Job page in Israel',
      }),
    );
    const result = await context.service.match(request);
    expect(result.relevantJobs.map((job) => job.url).sort()).toEqual(
      [backendUrl, platformUrl].sort(),
    );
  });
});
