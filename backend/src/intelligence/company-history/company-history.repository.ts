import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Company } from '../company-intelligence/company.entity';
import { CompanyReportEntity } from '../company-intelligence/company-report.entity';
import { ResearchCacheEntity } from '../company-intelligence/research-cache.entity';
import type { PersistedCompanyReportContent } from '../company-intelligence/company-report.schema';
import { JobMatchCacheEntity } from '../job-matching/job-match-cache.entity';

export interface CompanyHistoryRow {
  companyId: string;
  companyName: string;
  website: string | null;
  researchedAt: Date;
  manuallyUpdatedAt: Date | null;
  whatTheyDo: string | null;
  city: string | null;
  evidenceLevel: string | null;
  researchOrigin?: string | null;
}

export interface LatestReportReference {
  reportId: string;
  companyName: string;
  researchedAt: Date;
  manuallyUpdatedAt: Date | null;
}

export interface ManualReportChanges {
  quickBrief: NonNullable<PersistedCompanyReportContent['quickBrief']>;
  location: NonNullable<PersistedCompanyReportContent['location']>;
}

const LATEST_REPORT_PER_COMPANY_SQL = `
  SELECT * FROM (
    SELECT DISTINCT ON (report."companyId")
      report."companyId" AS "companyId",
      report."companyName" AS "companyName",
      COALESCE(company.website, report.website) AS website,
      report."researchedAt" AS "researchedAt",
      company."manuallyUpdatedAt" AS "manuallyUpdatedAt",
      COALESCE(report."quickBrief"->>'whatTheyDo', report."companySummary") AS "whatTheyDo",
      report.location->>'city' AS city,
      report."researchQuality"->>'evidenceLevel' AS "evidenceLevel",
      report."researchQuality"->>'origin' AS "researchOrigin"
    FROM company_reports report
    INNER JOIN companies company ON company.id = report."companyId"
    ORDER BY report."companyId", report."researchedAt" DESC, report.id DESC
  ) latest
  ORDER BY latest."researchedAt" DESC, latest."companyId" ASC`;

@Injectable()
export class CompanyHistoryRepository {
  constructor(@InjectDataSource('intelligence') private readonly dataSource: DataSource) {}

  async listLatestReports(): Promise<CompanyHistoryRow[]> {
    return this.dataSource.query<CompanyHistoryRow[]>(
      LATEST_REPORT_PER_COMPANY_SQL,
    );
  }

  async findLatestReportReference(
    companyId: string,
  ): Promise<LatestReportReference | null> {
    const company = await this.dataSource
      .getRepository(Company)
      .findOneBy({ id: companyId });
    if (!company) return null;
    const report = await this.dataSource
      .getRepository(CompanyReportEntity)
      .findOne({
        select: { id: true, companyName: true, researchedAt: true },
        where: { companyId },
        order: { researchedAt: 'DESC', id: 'DESC' },
      });
    if (!report) return null;
    return {
      reportId: report.id,
      companyName: report.companyName,
      researchedAt: report.researchedAt,
      manuallyUpdatedAt: company.manuallyUpdatedAt,
    };
  }

  async findCompanyIdByNormalizedName(
    normalizedName: string,
  ): Promise<string | null> {
    const company = await this.dataSource
      .getRepository(Company)
      .findOneBy({ normalizedName });
    return company ? company.id : null;
  }

  async applyManualUpdate(
    companyId: string,
    reportId: string,
    changes: ManualReportChanges,
    manuallyUpdatedAt: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(CompanyReportEntity)
        .update(
          { id: reportId, companyId },
          { quickBrief: changes.quickBrief, location: changes.location },
        );
      await manager
        .getRepository(Company)
        .update({ id: companyId }, { manuallyUpdatedAt });
      await manager
        .getRepository(ResearchCacheEntity)
        .delete({ companyId, section: 'company' });
    });
  }

  async deleteCompany(companyId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const company = await manager
        .getRepository(Company)
        .findOneBy({ id: companyId });
      if (!company) return false;
      await manager
        .getRepository(JobMatchCacheEntity)
        .delete({ companyKey: company.normalizedName });
      await manager.getRepository(ResearchCacheEntity).delete({ companyId });
      await manager.getRepository(CompanyReportEntity).delete({ companyId });
      await manager.getRepository(Company).delete({ id: companyId });
      return true;
    });
  }
}
