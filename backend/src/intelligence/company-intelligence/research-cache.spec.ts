import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, FindOperator } from 'typeorm';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { CompanyRepository } from './company.repository';
import { Company } from './company.entity';
import { ResearchCacheEntity } from './research-cache.entity';
import { LlmProviders } from './llm-providers';
import { TavilyService } from './tavily.service';
import { FirecrawlService } from './firecrawl.service';
import {
  candidateProfile,
  CandidateProfileService,
} from '../candidate-profile/candidate-profile';
import type { CompanyReport } from './company-report.schema';
import type { CompanyResearchRequest } from './company-research-request.schema';
import type { ResearchMode } from './research-mode';
import {
  cacheContext,
  companySection,
  roleSection,
  COMPANY_CACHE_TTL_MS,
  ROLE_CACHE_TTL_MS,
} from './research-cache';
import type { ResearchRunResult, ResearchScope } from './research-cache';
import { reportFixture } from '../../test/company-report.fixture';

const now = new Date('2026-10-24T12:00:00.000Z');
const companyId = '5e7aa3dc-0f47-4fb0-a084-51e7bc527411';
const reportId = '931d32d4-9772-4b08-a281-a99034f47462';
const request: CompanyResearchRequest = {
  companyName: '  ACME   Inc ',
  provider: 'openai',
  role: 'Backend Developer',
};
const original = {
  ...reportFixture,
  id: reportId,
  companyId,
  companyName: 'Acme Inc',
  provider: 'openai',
  role: request.role!,
  mode: 'DEEP',
  candidateProfileStatus: 'not-configured',
  researchedAt: now.toISOString(),
  cache: null,
} satisfies CompanyReport;

describe('PostgreSQL research cache orchestration', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const context = cacheContext(request.role, candidateProfile);
    const entries = [
      {
        companyId,
        section: 'company',
        roleIntentKey: '',
        profileFingerprint: '',
        mode: 'DEEP',
        refreshedAt: new Date(now.getTime() - 14 * 86400000),
        reportId,
        content: companySection(reportFixture),
      },
      {
        companyId,
        section: 'roles',
        ...context,
        mode: 'DEEP',
        refreshedAt: new Date(now.getTime() - 2 * 86400000),
        reportId,
        content: roleSection(reportFixture),
      },
    ];
    const companies = {
      findOneBy: jest.fn().mockResolvedValue({ id: companyId }),
    };
    const cache = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          const entry = entries.find(
            (value) =>
              value.section === where.section &&
              value.roleIntentKey === where.roleIntentKey &&
              value.profileFingerprint === where.profileFingerprint &&
              (where.mode as FindOperator<string[]>).value.includes(value.mode),
          );
          return Promise.resolve(entry ?? null);
        }),
    };
    const getRepository = jest
      .fn()
      .mockImplementation((entity: unknown) =>
        entity === Company ? companies : cache,
      );
    const repository = new CompanyRepository({
      getRepository,
    } as unknown as DataSource);
    const persist = jest
      .spyOn(repository, 'persistReport')
      .mockImplementation((incoming, content, date, mode, status, update) =>
        Promise.resolve({
          ...content,
          ...original,
          ...content,
          id: reportId,
          companyName: incoming.companyName,
          role: incoming.role ?? null,
          provider: incoming.provider,
          mode,
          candidateProfileStatus: status,
          researchedAt: date.toISOString(),
          cache: update!.metadata,
        }),
      );
    const loadReport = jest
      .spyOn(repository, 'findReport')
      .mockResolvedValue(original);
    const providers = { model: jest.fn() };
    const tavily = { searchWeb: jest.fn() };
    const firecrawl = { readPage: jest.fn() };
    const profiles = new CandidateProfileService();
    const service = new CompanyIntelligenceService(
      providers as unknown as LlmProviders,
      tavily as unknown as TavilyService,
      firecrawl as unknown as FirecrawlService,
      repository,
      new ConfigService(),
      profiles,
    );
    const run = jest
      .spyOn(
        service as unknown as {
          runResearch(
            request: CompanyResearchRequest,
            mode: ResearchMode,
            profile: unknown,
            scope: ResearchScope,
          ): Promise<ResearchRunResult>;
        },
        'runResearch',
      )
      .mockResolvedValue({
        content: {
          ...reportFixture,
          companySummary: 'Fresh company facts',
          roleDiscoverySummary: 'Fresh role results',
        },
        evidence: [],
      });
    return {
      service,
      entries,
      run,
      persist,
      loadReport,
      companies,
      cache,
      providers,
      tavily,
      firecrawl,
      profiles,
      repository,
      getRepository,
    };
  }

  it('checks normalized DB identity first and serves a complete hit without any external quota or duplicate report', async () => {
    const context = setup();
    const report = await context.service.research(request, 'QUICK');
    expect(context.companies.findOneBy).toHaveBeenCalledWith({
      normalizedName: 'acme inc',
    });
    expect(context.getRepository).toHaveBeenCalledWith(ResearchCacheEntity);
    expect(context.run).not.toHaveBeenCalled();
    expect(context.providers.model).not.toHaveBeenCalled();
    expect(context.tavily.searchWeb).not.toHaveBeenCalled();
    expect(context.firecrawl.readPage).not.toHaveBeenCalled();
    expect(context.persist).not.toHaveBeenCalled();
    expect(report.cache).toMatchObject({
      company: 'hit',
      roles: 'hit',
      companyRefreshedAt: context.entries[0].refreshedAt.toISOString(),
    });
  });

  it('reuses a company cache hit without refreshing expired or missing job data', async () => {
    const context = setup();
    context.entries[1].refreshedAt = new Date(now.getTime() - 10 * 86400000);
    const report = await context.service.research(request, 'QUICK', {
      modelName: 'deepseek-flash',
      companyOnly: true,
    });
    expect(context.run).not.toHaveBeenCalled();
    expect(context.persist).not.toHaveBeenCalled();
    expect(report.cache).toMatchObject({
      company: 'hit',
      roles: 'not-requested',
      rolesRefreshedAt: null,
    });
    expect(report.relevantRoles).toEqual([]);
  });

  it('upgrades a QUICK company snapshot for FULL and writes only the company cache section', async () => {
    const context = setup();
    context.entries[0].mode = 'QUICK';
    const report = await context.service.research(
      { ...request, provider: 'deepseek', forceRefresh: false },
      'DEEP',
      { modelName: 'deepseek-flash', companyOnly: true },
    );
    expect(context.run).toHaveBeenCalledTimes(1);
    expect(context.run.mock.calls[0][3]).toBe('company');
    expect(context.persist).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ relevantRoles: [] }),
      now,
      'DEEP',
      expect.any(String),
      expect.objectContaining({ scope: 'company' }),
    );
    expect(report.cache?.company).toBe('refreshed');
  });

  it('upgrades historical DEEP cache data without the new FULL coverage once authorized', async () => {
    const context = setup();
    await context.service.research(request, 'DEEP', {
      companyOnly: true,
      modelName: 'deepseek-flash',
    });
    expect(context.run).toHaveBeenCalledTimes(1);
    expect(context.run.mock.calls[0][3]).toBe('company');
  });

  it('does not repeat FULL research for cached unknowns with recorded coverage limitations', async () => {
    const context = setup();
    context.entries[0].content = companySection({
      ...reportFixture,
      interviewInsights: {
        summary: null,
        stages: [],
        reportedTopics: [],
        candidateExperiences: [],
        limitations: ['לא נמצאו דיווחים ציבוריים.'],
      },
      workplaceSignals: {
        summary: null,
        positiveSignals: [],
        negativeSignals: [],
        mixedSignals: [],
        limitations: ['Glassdoor לא נקרא.'],
      },
    });
    await context.service.research(request, 'DEEP', {
      companyOnly: true,
      modelName: 'deepseek-flash',
    });
    expect(context.run).not.toHaveBeenCalled();
    expect(context.persist).not.toHaveBeenCalled();
  });

  it('refreshes only roles after one week while reusing two-week-old company information', async () => {
    const context = setup();
    context.entries[1].refreshedAt = new Date(now.getTime() - 10 * 86400000);
    const report = await context.service.research(request, 'QUICK');
    expect(context.run).toHaveBeenCalledWith(
      request,
      'QUICK',
      candidateProfile,
      'roles',
      expect.objectContaining({ companySummary: reportFixture.companySummary }),
      {},
    );
    expect(report.companySummary).toBe(reportFixture.companySummary);
    expect(report.roleDiscoverySummary).toBe('Fresh role results');
    expect(report.cache).toMatchObject({
      company: 'hit',
      roles: 'refreshed',
      rolesRefreshedAt: now.toISOString(),
    });
    expect(context.persist).toHaveBeenCalledTimes(1);
  });

  it('refreshes only company information at the eight-week boundary and retains fresh roles', async () => {
    const context = setup();
    context.entries[0].refreshedAt = new Date(
      now.getTime() - COMPANY_CACHE_TTL_MS,
    );
    const report = await context.service.research(request, 'DEEP');
    expect(context.run).toHaveBeenCalledWith(
      request,
      'DEEP',
      candidateProfile,
      'company',
      undefined,
      {},
    );
    expect(report.companySummary).toBe('Fresh company facts');
    expect(report.roleDiscoverySummary).toBe(
      reportFixture.roleDiscoverySummary,
    );
    expect(report.cache).toMatchObject({ company: 'refreshed', roles: 'hit' });
  });

  it('expires roles exactly at one week and accepts company one millisecond before expiry', async () => {
    const context = setup();
    context.entries[0].refreshedAt = new Date(
      now.getTime() - COMPANY_CACHE_TTL_MS + 1,
    );
    context.entries[1].refreshedAt = new Date(
      now.getTime() - ROLE_CACHE_TTL_MS,
    );
    await context.service.research(request, 'QUICK');
    expect(context.run.mock.calls[0][3]).toBe('roles');
  });

  it('does not let QUICK cache satisfy DEEP company or role research', async () => {
    const context = setup();
    context.entries.forEach((entry) => (entry.mode = 'QUICK'));
    const report = await context.service.research(request, 'DEEP');
    expect(context.run.mock.calls[0][3]).toBe('full');
    expect(report.cache).toMatchObject({
      company: 'refreshed',
      roles: 'refreshed',
    });
  });

  it('can refresh DEEP company detail without discarding a fresh DEEP role snapshot', async () => {
    const context = setup();
    context.entries[0].mode = 'QUICK';
    await context.service.research(request, 'DEEP');
    expect(context.run.mock.calls[0][3]).toBe('company');
  });

  it('misses roles for a changed intent but preserves the company hit', async () => {
    const context = setup();
    await context.service.research(
      { ...request, role: 'Data Engineer' },
      'QUICK',
    );
    expect(context.run.mock.calls[0][3]).toBe('roles');
  });

  it('normalizes role case/spacing and gives omitted role a consistent distinct profile-driven key', () => {
    expect(cacheContext('  BACKEND   Developer ', candidateProfile)).toEqual(
      cacheContext('Backend Developer', candidateProfile),
    );
    expect(cacheContext(undefined, candidateProfile).roleIntentKey).toBe(
      'profile-driven',
    );
    expect(
      cacheContext('profile-driven', candidateProfile).roleIntentKey,
    ).not.toBe('profile-driven');
  });

  it('misses roles after a candidate profile change', async () => {
    const context = setup();
    jest.spyOn(context.profiles, 'getProfile').mockReturnValue({
      ...candidateProfile,
      preferredRoles: ['Data Engineer'],
    });
    await context.service.research(request, 'QUICK');
    expect(context.run.mock.calls[0][3]).toBe('roles');
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'forceRefresh bypasses both caches and appends fresh %s history',
    async (mode) => {
      const context = setup();
      const forced = { ...request, forceRefresh: true };
      const report = await context.service.research(forced, mode);
      expect(context.run).toHaveBeenCalledWith(
        forced,
        mode,
        candidateProfile,
        'full',
        undefined,
        {},
      );
      expect(context.loadReport).not.toHaveBeenCalled();
      expect(context.persist).toHaveBeenCalledWith(
        forced,
        expect.any(Object),
        now,
        mode,
        candidateProfile.status,
        expect.objectContaining({ scope: 'full' }),
      );
      expect(report.cache).toMatchObject({
        company: 'refreshed',
        roles: 'refreshed',
      });
    },
  );

  it('combines independent cached snapshots without provider calls or extending their TTL', async () => {
    const context = setup();
    context.entries[1].reportId = 'separate-role-snapshot';
    const report = await context.service.research(request, 'QUICK');
    expect(context.run).not.toHaveBeenCalled();
    expect(context.persist).toHaveBeenCalledWith(
      request,
      expect.any(Object),
      now,
      'QUICK',
      candidateProfile.status,
      expect.objectContaining({ scope: 'none' }),
    );
    expect(report.cache!.rolesRefreshedAt).toBe(
      context.entries[1].refreshedAt.toISOString(),
    );
  });

  it('queries bounded mode/TTL/context indexes rather than loading history', async () => {
    const context = setup();
    await context.service.research(request, 'QUICK');
    const cacheQueries = context.cache.findOne.mock.calls as unknown[][];
    const query = cacheQueries[1][0] as {
      where: Record<string, unknown>;
      order: Record<string, string>;
    };
    expect(query.where).toMatchObject({
      section: 'roles',
      ...cacheContext(request.role, candidateProfile),
    });
    expect(query.order).toEqual({ refreshedAt: 'DESC' });
    const bounds = query.where.refreshedAt as FindOperator<Date[]>;
    expect(bounds).toBeInstanceOf(FindOperator);
    const modes = query.where.mode as FindOperator<string[]>;
    expect(modes.value).toEqual(['DEEP', 'QUICK']);
    expect(bounds.value).toEqual([
      new Date(now.getTime() - ROLE_CACHE_TTL_MS + 1),
      now,
    ]);
  });

  it('treats old English cache payloads without the Hebrew presentation fields as incompatible', async () => {
    const context = setup();
    context.cache.findOne.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        const original = context.entries.find(
          (entry) => entry.section === where.section,
        )!;
        const content: Record<string, unknown> = { ...original.content };
        delete content.reportLanguage;
        delete content.quickBrief;
        delete content.location;
        delete content.evidenceSources;
        return Promise.resolve({ ...original, content });
      },
    );
    const report = await context.service.research(request, 'QUICK');
    expect(context.run.mock.calls[0][3]).toBe('full');
    expect(report.cache).toMatchObject({
      company: 'refreshed',
      roles: 'refreshed',
    });
  });

  it('fails safely before consuming quota when the database cache is unavailable', async () => {
    const context = setup();
    context.companies.findOneBy.mockRejectedValue(
      new Error('private database error'),
    );
    await expect(context.service.research(request)).rejects.toMatchObject({
      code: 'DATABASE_FAILURE',
      message: 'Research cache could not be read',
    });
    expect(context.run).not.toHaveBeenCalled();
  });
});
