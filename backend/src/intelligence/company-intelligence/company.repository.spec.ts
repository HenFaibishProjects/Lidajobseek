import { unknownLocationFacts } from './location-intelligence';
import type { LocationIntelligence } from './location-intelligence';
import { DataSource, EntityManager } from 'typeorm';
import { CompanyRepository } from './company.repository';
import { Company } from './company.entity';
import { ResearchCacheEntity } from './research-cache.entity';
import { cacheContext, companySection, roleSection } from './research-cache';
import { candidateProfile } from '../candidate-profile/candidate-profile';
import { CompanyReportEntity } from './company-report.entity';
import {
  reportFixture,
  persistedRoleFixture,
} from '../../test/company-report.fixture';

const companyId = '5e7aa3dc-0f47-4fb0-a084-51e7bc527411';
const reportId = '931d32d4-9772-4b08-a281-a99034f47462';

describe('Transactional report persistence', () => {
  function setup() {
    const companies = {
      upsert: jest.fn().mockResolvedValue(undefined),
      findOneByOrFail: jest.fn().mockResolvedValue({ id: companyId }),
    };
    const reports = {
      create: jest.fn().mockImplementation((value: unknown) => value),
      save: jest
        .fn()
        .mockImplementation((value: object) =>
          Promise.resolve({ id: reportId, ...value }),
        ),
    };
    const cache = { upsert: jest.fn().mockResolvedValue(undefined) };
    const manager = {
      getRepository: jest
        .fn()
        .mockImplementation((entity: unknown) =>
          entity === Company
            ? companies
            : entity === ResearchCacheEntity
              ? cache
              : reports,
        ),
    };
    const transaction = jest
      .fn()
      .mockImplementation(
        (work: (manager: EntityManager) => Promise<unknown>) =>
          work(manager as unknown as EntityManager),
      );
    const repository = new CompanyRepository({
      transaction,
    } as unknown as DataSource);
    return { repository, transaction, companies, reports, manager, cache };
  }

  it('upserts a normalized company and appends a structured report in one transaction', async () => {
    const context = setup();
    const researchedAt = new Date('2026-10-23T12:00:00Z');
    const report = await context.repository.persistReport(
      { companyName: 'ACME   Inc', provider: 'openai' },
      reportFixture,
      researchedAt,
      'QUICK',
      'not-configured',
    );
    expect(context.transaction).toHaveBeenCalledTimes(1);
    expect(context.companies.upsert).toHaveBeenCalledWith(
      {
        name: 'ACME   Inc',
        normalizedName: 'acme inc',
        website: reportFixture.website,
      },
      ['normalizedName'],
    );
    expect(context.manager.getRepository).toHaveBeenCalledWith(
      CompanyReportEntity,
    );
    expect(context.reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        companyName: 'ACME   Inc',
        role: null,
        provider: 'openai',
        sources: reportFixture.sources,
        mode: 'QUICK',
        candidateProfileStatus: 'not-configured',
        relevantRoles: [],
      }),
    );
    expect(report).toMatchObject({
      id: reportId,
      companyId,
      researchedAt: researchedAt.toISOString(),
    });
    expect(report).not.toHaveProperty('company');
  });

  it('preserves existing website when a later report has no verified website', async () => {
    const context = setup();
    await context.repository.persistReport(
      { companyName: 'Acme', provider: 'deepseek', role: 'Backend' },
      { ...reportFixture, website: null },
      new Date(),
      'DEEP',
      'not-configured',
    );
    expect(context.companies.upsert).toHaveBeenCalledWith(
      { name: 'Acme', normalizedName: 'acme' },
      ['normalizedName'],
    );
    expect(context.reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Backend',
        provider: 'deepseek',
        website: null,
      }),
    );
  });

  it('persists role arrays as structured data with server-selected mode and profile status', async () => {
    const context = setup();
    const quality = {
      evidenceLevel: 'limited' as const,
      sourcesDiscovered: 2,
      pagesRead: 0,
      limitations: ['Search evidence only.'],
    };
    const report = await context.repository.persistReport(
      { companyName: 'Acme', provider: 'openai' },
      {
        ...reportFixture,
        relevantRoles: [persistedRoleFixture],
        researchQuality: quality,
      },
      new Date(),
      'DEEP',
      'configured',
    );
    expect(context.reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        relevantRoles: [persistedRoleFixture],
        mode: 'DEEP',
        candidateProfileStatus: 'configured',
        researchQuality: quality,
      }),
    );
    expect(report.researchQuality).toEqual(quality);
    expect(report.relevantRoles[0]).toMatchObject({
      title: persistedRoleFixture.title,
      evidenceLevel: 'search-snippet',
    });
  });

  it('appends a snapshot and updates both mode-specific cache sections atomically', async () => {
    const context = setup();
    const researchedAt = new Date('2026-10-24T12:00:00Z');
    const metadata = {
      company: 'refreshed' as const,
      roles: 'refreshed' as const,
      companyRefreshedAt: researchedAt.toISOString(),
      rolesRefreshedAt: researchedAt.toISOString(),
    };
    const keys = cacheContext('Backend', candidateProfile);
    const report = await context.repository.persistReport(
      { companyName: ' Acme  Inc ', role: 'Backend', provider: 'openai' },
      reportFixture,
      researchedAt,
      'DEEP',
      'not-configured',
      { context: keys, scope: 'full', metadata, freshContent: reportFixture },
    );
    const savedInputs = context.reports.save.mock.calls as unknown[][];
    expect(savedInputs[0][0]).not.toHaveProperty('id');
    expect(context.cache.upsert).toHaveBeenCalledTimes(2);
    expect(context.cache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        section: 'company',
        roleIntentKey: '',
        profileFingerprint: '',
        mode: 'DEEP',
        reportId,
        content: companySection(reportFixture),
      }),
      expect.any(Array),
    );
    expect(context.cache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'roles',
        ...keys,
        content: roleSection(reportFixture),
      }),
      expect.any(Array),
    );
    expect(report.cache).toEqual(metadata);
  });

  it('updates only the refreshed role section and leaves company freshness and history untouched', async () => {
    const context = setup();
    const researchedAt = new Date('2026-10-24T12:00:00Z');
    const fresh = {
      ...reportFixture,
      roleDiscoverySummary: 'New roles',
      sources: [
        {
          title: 'Job',
          url: 'https://acme.com/jobs/1',
          sourceType: 'job-posting' as const,
        },
      ],
    };
    await context.repository.persistReport(
      { companyName: 'Acme', provider: 'openai' },
      reportFixture,
      researchedAt,
      'QUICK',
      'not-configured',
      {
        context: cacheContext(undefined, candidateProfile),
        scope: 'roles',
        metadata: {
          company: 'hit',
          roles: 'refreshed',
          companyRefreshedAt: '2026-10-10T12:00:00.000Z',
          rolesRefreshedAt: researchedAt.toISOString(),
        },
        freshContent: fresh,
      },
    );
    expect(context.cache.upsert).toHaveBeenCalledTimes(1);
    expect(context.cache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'roles',
        refreshedAt: researchedAt,
        content: roleSection(fresh),
      }),
      expect.any(Array),
    );
    expect(context.reports.save).toHaveBeenCalledTimes(1);
  });

  it('propagates a cache write failure through the same report transaction', async () => {
    const context = setup();
    context.cache.upsert.mockRejectedValue(new Error('cache write failed'));
    await expect(
      context.repository.persistReport(
        { companyName: 'Acme', provider: 'openai' },
        reportFixture,
        new Date('2026-10-24'),
        'QUICK',
        'not-configured',
        {
          context: cacheContext(undefined, candidateProfile),
          scope: 'full',
          metadata: {
            company: 'refreshed',
            roles: 'refreshed',
            companyRefreshedAt: '2026-10-24T00:00:00.000Z',
            rolesRefreshedAt: '2026-10-24T00:00:00.000Z',
          },
        },
      ),
    ).rejects.toThrow('cache write failed');
  });

  it('stores original research evidence privately in report history and section cache', async () => {
    const context = setup();
    const date = new Date('2026-10-24T12:00:00Z');
    const evidence = [
      {
        title: 'Original English source title',
        url: 'https://acme.com/about',
        content: 'Original English snippet',
        pageContent: 'Original page text',
        readStatus: 'read' as const,
      },
    ];
    const locationIntelligence: LocationIntelligence = {
      facts: unknownLocationFacts(),
      queries: [{ query: 'Acme Israel office floor', target: 'companyFloors' }],
      searchCalls: 1,
      readCalls: 0,
      assessmentFailures: 0,
      stopReason: 'budget',
    };
    const report = await context.repository.persistReport(
      { companyName: 'Acme', provider: 'openai' },
      reportFixture,
      date,
      'DEEP',
      'not-configured',
      {
        context: cacheContext(undefined, candidateProfile),
        scope: 'full',
        metadata: {
          company: 'refreshed',
          roles: 'refreshed',
          companyRefreshedAt: date.toISOString(),
          rolesRefreshedAt: date.toISOString(),
        },
        freshEvidence: evidence,
        locationIntelligence,
        researchEvidence: {
          company: evidence,
          roles: evidence,
          locationIntelligence,
        },
      },
    );
    expect(context.reports.save).toHaveBeenCalledWith(
      expect.objectContaining({
        researchEvidence: {
          company: evidence,
          roles: evidence,
          locationIntelligence,
        },
      }),
    );
    expect(context.cache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          evidenceSources: evidence,
          locationIntelligence,
        }) as unknown,
      }),
      expect.any(Array),
    );
    expect(report).not.toHaveProperty('researchEvidence');
    expect(report).not.toHaveProperty('evidenceSources');
    expect(report).not.toHaveProperty('locationIntelligence');
    expect(report.reportLanguage).toBe('he-IL');
  });

  it('propagates report insertion failure to the transaction boundary', async () => {
    const context = setup();
    context.reports.save.mockRejectedValue(new Error('insert failed'));
    await expect(
      context.repository.persistReport(
        { companyName: 'Acme', provider: 'openai' },
        reportFixture,
        new Date(),
        'DEEP',
        'not-configured',
      ),
    ).rejects.toThrow('insert failed');
  });
});
