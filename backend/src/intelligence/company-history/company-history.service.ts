import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CompanyRepository } from '../company-intelligence/company.repository';
import {
  QUICK_PRESENTATION_LIMITS,
  toCompanyResearchReport,
} from '../company-intelligence/company-report.presentation';
import type { CompanyResearchReport } from '../company-intelligence/company-report.presentation';
import type { CompanyReport } from '../company-intelligence/company-report.schema';
import { normalizeLookup } from '../company-intelligence/research-cache';
import { ResearchError } from '../company-intelligence/research-error';
import { CompanyHistoryRepository } from './company-history.repository';
import type {
  CompanyHistoryRow,
  LatestReportReference,
} from './company-history.repository';
import type {
  CompanyHistoryDetail,
  CompanyHistoryItem,
  CompanyHistoryLookup,
  ManualQuickUpdate,
} from './company-history.schema';

const EVIDENCE_LEVELS = new Set(['strong', 'partial', 'limited']);
const CHATGPT_IMPORT_ORIGIN = 'chatgpt-import' as const;

@Injectable()
export class CompanyHistoryService {
  private readonly logger = new Logger(CompanyHistoryService.name);

  constructor(
    private readonly history: CompanyHistoryRepository,
    private readonly reports: CompanyRepository,
  ) {}

  async listHistory(): Promise<CompanyHistoryItem[]> {
    const rows = await this.withDatabaseErrors('list history', () =>
      this.history.listLatestReports(),
    );
    return rows.map(toHistoryItem);
  }

  async lookup(companyName: string): Promise<CompanyHistoryLookup> {
    const reference = await this.withDatabaseErrors(
      'look up company',
      async () => {
        const companyId = await this.history.findCompanyIdByNormalizedName(
          normalizeLookup(companyName),
        );
        if (companyId === null) return null;
        const latest = await this.history.findLatestReportReference(companyId);
        return latest ? { companyId, latest } : null;
      },
    );
    if (reference === null) return { exists: false };
    return {
      exists: true,
      companyId: reference.companyId,
      companyName: reference.latest.companyName,
    };
  }

  async getDetail(companyId: string): Promise<CompanyHistoryDetail> {
    const latest = await this.requireLatestReport(companyId);
    const report = await this.requireReport(latest.reportId);
    return toHistoryDetail(companyId, latest, report);
  }

  async updateManually(
    companyId: string,
    update: ManualQuickUpdate,
  ): Promise<CompanyHistoryDetail> {
    const latest = await this.requireLatestReport(companyId);
    const manuallyUpdatedAt = new Date();
    await this.withDatabaseErrors('save manual update', () =>
      this.history.applyManualUpdate(
        companyId,
        latest.reportId,
        {
          quickBrief: {
            whatTheyDo: update.whatTheyDo,
            workModel: update.workModel,
            greenFlags: update.greenFlags,
            redFlags: update.redFlags,
            employees: update.employees,
          },
          location: update.location,
        },
        manuallyUpdatedAt,
      ),
    );
    this.logger.log({ event: 'company-history-manual-update', companyId });
    return this.getDetail(companyId);
  }

  async deleteCompany(companyId: string): Promise<void> {
    const deleted = await this.withDatabaseErrors('delete company', () =>
      this.history.deleteCompany(companyId),
    );
    if (!deleted) throw companyNotFound();
    this.logger.log({ event: 'company-history-deleted', companyId });
  }

  private async requireLatestReport(
    companyId: string,
  ): Promise<LatestReportReference> {
    const latest = await this.withDatabaseErrors('read history', () =>
      this.history.findLatestReportReference(companyId),
    );
    if (latest === null) throw companyNotFound();
    return latest;
  }

  private async requireReport(reportId: string): Promise<CompanyReport> {
    const report = await this.withDatabaseErrors('read saved report', () =>
      this.reports.findReport(reportId),
    );
    if (report === null) throw companyNotFound();
    return report;
  }

  private async withDatabaseErrors<T>(
    operation: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error({
        event: 'company-history-database-failure',
        operation,
        causeName: error instanceof Error ? error.name : undefined,
      });
      throw new ResearchError(
        'DATABASE_FAILURE',
        `Company history could not ${operation}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error,
      );
    }
  }
}

function companyNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'COMPANY_NOT_FOUND',
    message: 'Company was not found in history',
  });
}

function manualUpdateTime(
  manuallyUpdatedAt: Date | null,
  researchedAt: Date,
): string | null {
  if (manuallyUpdatedAt === null) return null;
  if (manuallyUpdatedAt.getTime() <= researchedAt.getTime()) return null;
  return manuallyUpdatedAt.toISOString();
}

function toHistoryItem(row: CompanyHistoryRow): CompanyHistoryItem {
  const researchedAt = new Date(row.researchedAt);
  const manuallyUpdatedAt = row.manuallyUpdatedAt
    ? new Date(row.manuallyUpdatedAt)
    : null;
  return {
    companyId: row.companyId,
    companyName: row.companyName,
    website: row.website,
    researchedAt: researchedAt.toISOString(),
    manuallyUpdatedAt: manualUpdateTime(manuallyUpdatedAt, researchedAt),
    whatTheyDo:
      row.whatTheyDo?.trim().slice(0, QUICK_PRESENTATION_LIMITS.summary) ||
      null,
    city: row.city?.trim() || null,
    evidenceLevel:
      row.evidenceLevel && EVIDENCE_LEVELS.has(row.evidenceLevel)
        ? (row.evidenceLevel as CompanyHistoryItem['evidenceLevel'])
        : null,
    ...(row.researchOrigin === CHATGPT_IMPORT_ORIGIN
      ? { researchOrigin: CHATGPT_IMPORT_ORIGIN }
      : {}),
  };
}

function manualPresentation(
  report: CompanyReport,
  presentation: CompanyResearchReport,
): CompanyResearchReport {
  const brief = report.quickBrief;
  if (!brief) return presentation;
  return {
    ...presentation,
    whatTheyDo: brief.whatTheyDo,
    workModel: brief.workModel,
    greenFlags: brief.greenFlags,
    redFlags: brief.redFlags,
  };
}

function toHistoryDetail(
  companyId: string,
  latest: LatestReportReference,
  report: CompanyReport,
): CompanyHistoryDetail {
  const manuallyUpdatedAt = manualUpdateTime(
    latest.manuallyUpdatedAt,
    latest.researchedAt,
  );
  const presentation = toCompanyResearchReport(report);
  return {
    companyId,
    researchedAt: latest.researchedAt.toISOString(),
    manuallyUpdatedAt,
    report:
      manuallyUpdatedAt === null
        ? presentation
        : manualPresentation(report, presentation),
  };
}
