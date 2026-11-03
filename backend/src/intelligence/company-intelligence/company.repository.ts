import { InjectDataSource } from '@nestjs/typeorm';
import type { LocationIntelligence } from './location-intelligence';
import type { ResearchMode } from './research-mode';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { Injectable } from '@nestjs/common';
import { Between, DataSource, In } from 'typeorm';
import { ResearchCacheEntity } from './research-cache.entity';
import {
  COMPANY_CACHE_TTL_MS,
  ROLE_CACHE_TTL_MS,
  isFreshCache,
  normalizeLookup,
  companyCacheContentSchema,
  roleCacheContentSchema,
  companySection,
  roleSection,
} from './research-cache';
import type {
  CacheContext,
  ResearchCache,
  ResearchScope,
  StoredResearchEvidence,
} from './research-cache';
import type { ResearchSource } from './tavily.service';
import type { CacheMetadata } from './company-report.schema';
import { Company } from './company.entity';
import { CompanyReportEntity } from './company-report.entity';
import { companyReportSchema } from './company-report.schema';
import type {
  CompanyReport,
  PersistedCompanyReportContent,
} from './company-report.schema';
import type { CompanyResearchRequest } from './company-research-request.schema';

@Injectable()
export class CompanyRepository {
  constructor(@InjectDataSource('intelligence') private readonly dataSource: DataSource) {}

  async findFreshCache(
    companyName: string,
    context: CacheContext,
    mode: ResearchMode,
    now: Date,
  ): Promise<ResearchCache> {
    const company = await this.dataSource
      .getRepository(Company)
      .findOneBy({ normalizedName: normalizeLookup(companyName) });
    if (!company) return { company: null, roles: null };
    const cache = this.dataSource.getRepository(ResearchCacheEntity);
    const modes = mode === 'DEEP' ? ['DEEP'] : ['DEEP', 'QUICK'];
    const common = { companyId: company.id, mode: In(modes) };
    const [companyEntry, roleEntry] = await Promise.all([
      cache.findOne({
        where: {
          ...common,
          section: 'company',
          roleIntentKey: '',
          profileFingerprint: '',
          refreshedAt: Between(
            new Date(now.getTime() - COMPANY_CACHE_TTL_MS + 1),
            now,
          ),
        },
        order: { refreshedAt: 'DESC' },
      }),
      cache.findOne({
        where: {
          ...common,
          section: 'roles',
          ...context,
          refreshedAt: Between(
            new Date(now.getTime() - ROLE_CACHE_TTL_MS + 1),
            now,
          ),
        },
        order: { refreshedAt: 'DESC' },
      }),
    ]);
    const companyContent = companyCacheContentSchema.safeParse(
      companyEntry?.content,
    );
    const roleContent = roleCacheContentSchema.safeParse(roleEntry?.content);
    return {
      company:
        companyEntry &&
        companyContent.success &&
        isFreshCache(
          companyEntry.refreshedAt,
          companyEntry.mode,
          mode,
          COMPANY_CACHE_TTL_MS,
          now,
        )
          ? { ...companyEntry, content: companyContent.data }
          : null,
      roles:
        roleEntry &&
        roleContent.success &&
        isFreshCache(
          roleEntry.refreshedAt,
          roleEntry.mode,
          mode,
          ROLE_CACHE_TTL_MS,
          now,
        )
          ? { ...roleEntry, content: roleContent.data }
          : null,
    };
  }

  async findReport(id: string): Promise<CompanyReport | null> {
    const saved = await this.dataSource
      .getRepository(CompanyReportEntity)
      .findOneBy({ id });
    if (!saved) return null;
    const {
      company: unusedRelation,
      researchEvidence: privateEvidence,
      ...report
    } = saved;
    void privateEvidence;
    void unusedRelation;
    return companyReportSchema.parse({
      ...report,
      researchedAt: saved.researchedAt.toISOString(),
    });
  }

  async persistReport(
    request: CompanyResearchRequest,
    content: PersistedCompanyReportContent,
    researchedAt: Date,
    mode: ResearchMode,
    candidateProfileStatus: CandidateProfile['status'],
    cacheUpdate?: {
      context: CacheContext;
      scope: ResearchScope | 'none';
      metadata: CacheMetadata;
      freshContent?: PersistedCompanyReportContent;
      freshEvidence?: ResearchSource[];
      locationIntelligence?: LocationIntelligence;
      researchEvidence?: StoredResearchEvidence;
    },
  ): Promise<CompanyReport> {
    return this.dataSource.transaction(async (manager) => {
      const companies = manager.getRepository(Company);
      const normalizedName = normalizeLookup(request.companyName);
      await companies.upsert(
        {
          name: request.companyName,
          normalizedName,
          ...(content.website ? { website: content.website } : {}),
        },
        ['normalizedName'],
      );
      const company = await companies.findOneByOrFail({ normalizedName });
      const reports = manager.getRepository(CompanyReportEntity);
      const saved = await reports.save(
        reports.create({
          ...content,
          researchEvidence: cacheUpdate?.researchEvidence ?? null,
          cache: cacheUpdate?.metadata ?? null,
          mode,
          candidateProfileStatus,
          companyId: company.id,
          companyName: request.companyName,
          role: request.role ?? null,
          provider: request.provider,
          researchedAt,
        }),
      );
      if (cacheUpdate) {
        const cache = manager.getRepository(ResearchCacheEntity);
        const sections =
          cacheUpdate.scope === 'full'
            ? (['company', 'roles'] as const)
            : cacheUpdate.scope === 'none'
              ? []
              : [cacheUpdate.scope];
        for (const section of sections) {
          await cache.upsert(
            {
              companyId: company.id,
              section,
              roleIntentKey:
                section === 'roles' ? cacheUpdate.context.roleIntentKey : '',
              profileFingerprint:
                section === 'roles'
                  ? cacheUpdate.context.profileFingerprint
                  : '',
              mode,
              refreshedAt: new Date(
                section === 'company'
                  ? cacheUpdate.metadata.companyRefreshedAt
                  : (cacheUpdate.metadata.rolesRefreshedAt ??
                      researchedAt.toISOString()),
              ),
              reportId: saved.id,
              content:
                section === 'company'
                  ? companySection(
                      cacheUpdate.freshContent ?? content,
                      cacheUpdate.freshEvidence,
                      cacheUpdate.locationIntelligence,
                    )
                  : roleSection(
                      cacheUpdate.freshContent ?? content,
                      cacheUpdate.freshEvidence,
                    ),
            },
            [
              'companyId',
              'section',
              'roleIntentKey',
              'profileFingerprint',
              'mode',
            ],
          );
        }
      }
      const {
        company: unusedRelation,
        researchEvidence: privateEvidence,
        ...report
      } = saved;
      void privateEvidence;
      void unusedRelation;
      return companyReportSchema.parse({
        ...report,
        researchedAt: saved.researchedAt.toISOString(),
      });
    });
  }
}
