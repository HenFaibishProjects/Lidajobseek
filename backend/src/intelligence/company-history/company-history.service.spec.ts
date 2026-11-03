import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Company } from '../company-intelligence/company.entity';
import { CompanyReportEntity } from '../company-intelligence/company-report.entity';
import { CompanyRepository } from '../company-intelligence/company.repository';
import { ResearchCacheEntity } from '../company-intelligence/research-cache.entity';
import { cacheContext } from '../company-intelligence/research-cache';
import { candidateProfile } from '../candidate-profile/candidate-profile';
import { FirecrawlService } from '../company-intelligence/firecrawl.service';
import { LlmProviders } from '../company-intelligence/llm-providers';
import { TavilyService } from '../company-intelligence/tavily.service';
import { JobMatchCacheEntity } from '../job-matching/job-match-cache.entity';
import { CompanyHistoryModule } from './company-history.module';
import { CompanyHistoryRepository } from './company-history.repository';
import { manualQuickUpdateSchema } from './company-history.schema';
import type { ManualQuickUpdate } from './company-history.schema';
import { CompanyHistoryService } from './company-history.service';
import { reportFixture } from '../../test/company-report.fixture';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

class InMemoryRepository {
  constructor(readonly rows: Row[]) {}

  findOneBy(where: Row) {
    return Promise.resolve(
      this.rows.find((row) => matches(row, where)) ?? null,
    );
  }

  findOne(options: { where: Row; order?: Record<string, 'ASC' | 'DESC'> }) {
    const found = this.rows.filter((row) => matches(row, options.where));
    if (options.order?.researchedAt === 'DESC')
      found.sort(
        (first, second) =>
          (second.researchedAt as Date).getTime() -
          (first.researchedAt as Date).getTime(),
      );
    return Promise.resolve(found[0] ?? null);
  }

  update(where: Row, changes: Row) {
    for (const row of this.rows.filter((candidate) =>
      matches(candidate, where),
    ))
      Object.assign(row, changes);
    return Promise.resolve({ affected: 1 });
  }

  delete(where: Row) {
    const remaining = this.rows.filter((row) => !matches(row, where));
    const affected = this.rows.length - remaining.length;
    this.rows.splice(0, this.rows.length, ...remaining);
    return Promise.resolve({ affected });
  }
}

const companyId = '5e7aa3dc-0f47-4fb0-a084-51e7bc527411';
const olderReportId = '11111111-1111-4111-8111-111111111111';
const latestReportId = '931d32d4-9772-4b08-a281-a99034f47462';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const olderResearchAt = new Date('2026-10-20T10:00:00Z');
const latestResearchAt = new Date('2026-10-24T10:00:00Z');

function reportRow(id: string, researchedAt: Date, whatTheyDo: string): Row {
  return {
    ...reportFixture,
    quickBrief: { ...reportFixture.quickBrief, whatTheyDo },
    id,
    companyId,
    companyName: 'Varonis',
    role: null,
    provider: 'openai',
    mode: 'QUICK',
    candidateProfileStatus: 'not-configured',
    cache: null,
    researchEvidence: { company: [], roles: [] },
    researchedAt,
  };
}

function createStore() {
  const tables = new Map<unknown, InMemoryRepository>([
    [
      Company,
      new InMemoryRepository([
        {
          id: companyId,
          name: 'Varonis',
          normalizedName: 'varonis',
          website: 'https://www.varonis.com',
          manuallyUpdatedAt: null,
        },
      ]),
    ],
    [
      CompanyReportEntity,
      new InMemoryRepository([
        reportRow(olderReportId, olderResearchAt, 'Varonis older summary.'),
        reportRow(
          latestReportId,
          latestResearchAt,
          'Varonis מפתחת Data Security.',
        ),
      ]),
    ],
    [
      ResearchCacheEntity,
      new InMemoryRepository([
        { companyId, section: 'company', reportId: latestReportId },
        { companyId, section: 'roles', reportId: latestReportId },
        { companyId: otherCompanyId, section: 'company', reportId: 'other' },
      ]),
    ],
    [
      JobMatchCacheEntity,
      new InMemoryRepository([
        { companyKey: 'varonis', profileFingerprint: 'a' },
        { companyKey: 'jfrog', profileFingerprint: 'a' },
      ]),
    ],
  ]);
  const manager = { getRepository: (entity: unknown) => tables.get(entity) };
  const transaction = jest.fn(
    (work: (transactionManager: typeof manager) => Promise<unknown>) =>
      work(manager),
  );
  const query = jest.fn();
  const dataSource = {
    ...manager,
    transaction,
    query,
  } as unknown as DataSource;
  const historyRepository = new CompanyHistoryRepository(dataSource);
  const companyRepository = new CompanyRepository(dataSource);
  const service = new CompanyHistoryService(
    historyRepository,
    companyRepository,
  );
  return {
    service,
    companyRepository,
    transaction,
    query,
    rows: (entity: unknown) => tables.get(entity)!.rows,
  };
}

const validUpdate: ManualQuickUpdate = manualQuickUpdateSchema.parse({
  whatTheyDo: 'Varonis מפתחת פלטפורמת Data Security לארגונים.',
  workModel: 'היברידי, 3 ימים במשרד',
  greenFlags: ['חברה מובילה וחדשנית'],
  redFlags: [],
  employees: {
    israel: { count: 600, approximate: true },
    israelEngineering: { min: 200, max: 300, approximate: true },
    global: null,
    verificationNote: '',
  },
  location: {
    city: 'הרצליה',
    address: 'אריה שנקר 5',
    building: 'Gav-Yam Building 1',
    floor: null,
    buildingFloors: 18,
    companyFloors: '7–9',
    campus: '',
    verificationNote: null,
  },
});

describe('Company history list', () => {
  it('selects one latest report per company, newest first, from PostgreSQL only', async () => {
    const context = createStore();
    context.query.mockResolvedValue([
      {
        companyId,
        companyName: 'Varonis',
        website: 'https://www.varonis.com',
        researchedAt: latestResearchAt,
        manuallyUpdatedAt: null,
        whatTheyDo: '  Varonis מפתחת Data Security.  ',
        city: 'הרצליה',
        evidenceLevel: 'partial',
      },
      {
        companyId: otherCompanyId,
        companyName: 'JFrog',
        website: null,
        researchedAt: olderResearchAt,
        manuallyUpdatedAt: latestResearchAt,
        whatTheyDo: null,
        city: null,
        evidenceLevel: 'unexpected',
      },
    ]);
    const history = await context.service.listHistory();
    const sql = String((context.query.mock.calls as unknown[][])[0][0]);
    expect(sql).toContain('DISTINCT ON (report."companyId")');
    expect(sql).toContain(
      'ORDER BY report."companyId", report."researchedAt" DESC, report.id DESC',
    );
    expect(sql).toContain('ORDER BY latest."researchedAt" DESC');
    expect(sql).not.toContain('researchEvidence');
    expect(history.map((item) => item.companyName)).toEqual([
      'Varonis',
      'JFrog',
    ]);
    expect(history[0]).toEqual({
      companyId,
      companyName: 'Varonis',
      website: 'https://www.varonis.com',
      researchedAt: latestResearchAt.toISOString(),
      manuallyUpdatedAt: null,
      whatTheyDo: 'Varonis מפתחת Data Security.',
      city: 'הרצליה',
      evidenceLevel: 'partial',
    });
    expect(history[1]).toMatchObject({
      manuallyUpdatedAt: latestResearchAt.toISOString(),
      evidenceLevel: null,
    });
  });

  it('is wired without any external research provider', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CompanyHistoryModule,
    ) as unknown[];
    for (const externalProvider of [
      TavilyService,
      FirecrawlService,
      LlmProviders,
    ])
      expect(providers).not.toContain(externalProvider);
  });
});

describe('Company history detail', () => {
  it('returns the latest report as the unified company research presentation without private evidence', async () => {
    const context = createStore();
    const detail = await context.service.getDetail(companyId);
    expect(detail.researchedAt).toBe(latestResearchAt.toISOString());
    expect(detail.manuallyUpdatedAt).toBeNull();
    expect(detail.report.whatTheyDo).toBe('Varonis מפתחת Data Security.');
    expect(JSON.stringify(detail)).not.toContain('researchEvidence');
    expect(detail.report).toHaveProperty('details.productSummary');
    expect(detail.report).not.toHaveProperty('quickBrief');
    expect(detail.report.sources).toEqual([
      { title: 'Acme', url: 'https://acme.com/', sourceType: 'company-site' },
    ]);
  });

  it('returns 404 for an unknown company', async () => {
    const context = createStore();
    await expect(
      context.service.getDetail('33333333-3333-4333-8333-333333333333'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Company history lookup', () => {
  it.each(['Varonis', 'varonis', ' VARONIS ', 'VaRoNiS'])(
    'finds the saved company for %p using normalizeLookup',
    async (companyName) => {
      const context = createStore();
      await expect(context.service.lookup(companyName)).resolves.toEqual({
        exists: true,
        companyId,
        companyName: 'Varonis',
      });
    },
  );

  it('collapses internal whitespace and case using the research normalization', async () => {
    const context = createStore();
    context.rows(Company)[0].normalizedName = 'varonis security';
    await expect(
      context.service.lookup('  VaRoNiS \t SECURITY  '),
    ).resolves.toMatchObject({
      exists: true,
      companyId,
    });
  });

  it('reports a missing company as exists=false', async () => {
    const context = createStore();
    await expect(context.service.lookup('WalkMe')).resolves.toEqual({
      exists: false,
    });
  });
});

describe('DB-only history reads', () => {
  it('never invokes research providers when listing, looking up or opening a saved company', async () => {
    const context = createStore();
    context.query.mockResolvedValue([]);
    const search = jest.spyOn(TavilyService.prototype, 'searchWeb');
    const read = jest.spyOn(FirecrawlService.prototype, 'readPage');
    const model = jest.spyOn(LlmProviders.prototype, 'model');
    try {
      await context.service.listHistory();
      await context.service.lookup('VARONIS');
      await context.service.getDetail(companyId);
      expect(search).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(model).not.toHaveBeenCalled();
    } finally {
      search.mockRestore();
      read.mockRestore();
      model.mockRestore();
    }
  });

  it('bounds the compact history summary even for legacy reports', async () => {
    const context = createStore();
    context.query.mockResolvedValue([
      {
        companyId,
        companyName: 'Varonis',
        website: null,
        researchedAt: latestResearchAt,
        manuallyUpdatedAt: null,
        whatTheyDo: 'x'.repeat(6000),
        city: null,
        evidenceLevel: null,
      },
    ]);
    const rows = await context.service.listHistory();
    expect(rows[0].whatTheyDo?.length).toBeLessThanOrEqual(420);
  });
});

describe('Manual QUICK edits', () => {
  it('persists the edit, invalidates the company research cache and keeps researchedAt', async () => {
    const context = createStore();
    const detail = await context.service.updateManually(companyId, validUpdate);
    expect(context.transaction).toHaveBeenCalledTimes(1);
    const latest = context
      .rows(CompanyReportEntity)
      .find((row) => row.id === latestReportId)!;
    expect(latest.quickBrief).toMatchObject({
      whatTheyDo: validUpdate.whatTheyDo,
      greenFlags: ['חברה מובילה וחדשנית'],
    });
    expect(latest.location).toMatchObject({ buildingFloors: 18, campus: null });
    expect(latest.researchedAt).toBe(latestResearchAt);
    const older = context
      .rows(CompanyReportEntity)
      .find((row) => row.id === olderReportId)!;
    expect(older.quickBrief).toMatchObject({
      whatTheyDo: 'Varonis older summary.',
    });
    expect(
      context
        .rows(ResearchCacheEntity)
        .filter((row) => row.companyId === companyId)
        .map((row) => row.section),
    ).toEqual(['roles']);
    expect(context.rows(ResearchCacheEntity)).toContainEqual(
      expect.objectContaining({ companyId: otherCompanyId }),
    );
    expect(detail.researchedAt).toBe(latestResearchAt.toISOString());
    expect(detail.manuallyUpdatedAt).not.toBeNull();
  });

  it('shows the manual changes when the saved report is reopened', async () => {
    const context = createStore();
    await context.service.updateManually(companyId, validUpdate);
    const reopened = await context.service.getDetail(companyId);
    expect(reopened.report).toMatchObject({
      whatTheyDo: validUpdate.whatTheyDo,
      workModel: 'היברידי, 3 ימים במשרד',
      greenFlags: ['חברה מובילה וחדשנית'],
      employees: { israel: { count: 600, approximate: true } },
      location: {
        city: 'הרצליה',
        building: 'Gav-Yam Building 1',
        buildingFloors: 18,
        companyFloors: '7–9',
      },
    });
  });

  it('rejects unknown fields and invalid values', () => {
    for (const invalid of [
      { ...validUpdate, companySummary: 'not editable here' },
      { ...validUpdate, greenFlags: ['a', 'b', 'c', 'd'] },
      { ...validUpdate, redFlags: ['x'.repeat(81)] },
      { ...validUpdate, whatTheyDo: '' },
      {
        ...validUpdate,
        employees: {
          ...validUpdate.employees,
          israel: { min: 300, max: 200, approximate: true },
        },
      },
      {
        ...validUpdate,
        location: { ...validUpdate.location, buildingFloors: 0 },
      },
      {
        ...validUpdate,
        location: { ...validUpdate.location, researchEvidence: [] },
      },
    ])
      expect(manualQuickUpdateSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('Company deletion', () => {
  it('removes the company, its reports, research cache and job match cache so research starts fresh', async () => {
    const context = createStore();
    await context.service.deleteCompany(companyId);
    expect(context.transaction).toHaveBeenCalledTimes(1);
    expect(context.rows(Company)).toEqual([]);
    expect(context.rows(CompanyReportEntity)).toEqual([]);
    expect(context.rows(ResearchCacheEntity)).toEqual([
      expect.objectContaining({ companyId: otherCompanyId }),
    ]);
    expect(context.rows(JobMatchCacheEntity)).toEqual([
      expect.objectContaining({ companyKey: 'jfrog' }),
    ]);
    await expect(context.service.lookup('VARONIS')).resolves.toEqual({
      exists: false,
    });
    await expect(
      context.companyRepository.findFreshCache(
        'Varonis',
        cacheContext(undefined, candidateProfile),
        'QUICK',
        new Date(),
      ),
    ).resolves.toEqual({ company: null, roles: null });
  });

  it('returns 404 when the company does not exist', async () => {
    const context = createStore();
    await expect(
      context.service.deleteCompany('33333333-3333-4333-8333-333333333333'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Explicit refresh', () => {
  it('shows a newer research report as the current history detail, superseding a manual edit', async () => {
    const context = createStore();
    await context.service.updateManually(companyId, validUpdate);
    const refreshedAt = new Date(Date.now() + 60000);
    context
      .rows(CompanyReportEntity)
      .push(
        reportRow(
          '44444444-4444-4444-8444-444444444444',
          refreshedAt,
          'Varonis refreshed summary.',
        ),
      );
    const detail = await context.service.getDetail(companyId);
    expect(detail.researchedAt).toBe(refreshedAt.toISOString());
    expect(detail.report.whatTheyDo).toBe('Varonis refreshed summary.');
    expect(detail.manuallyUpdatedAt).toBeNull();
  });
});
