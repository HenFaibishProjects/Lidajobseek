import { InjectDataSource } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { Company } from '../../company-intelligence/company.entity';
import { CompanyReportEntity } from '../../company-intelligence/company-report.entity';
import { ResearchCacheEntity } from '../../company-intelligence/research-cache.entity';
import { normalizeLookup } from '../../company-intelligence/research-cache';
import type { PersistedCompanyReportContent } from '../../company-intelligence/company-report.schema';
import { ResearchHandoffEntity } from './research-handoff.entity';
import { ResearchHandoffStatus } from './research-handoff.types';
import {
  parseChatGptResearchImport,
  UNKNOWN_IMPORTED_SUMMARY,
} from './chatgpt-research-import.schema';
import type { ChatGptResearchImport } from './chatgpt-research-import.schema';

const IMPORT_ORIGIN = 'manual-chatgpt-handoff' as const;
const importMetadataSchema = z.object({
  origin: z.literal(IMPORT_ORIGIN),
  reportId: z.uuid(),
  companyId: z.uuid(),
  importedAt: z.iso.datetime(),
});
const MANUAL_RESEARCH_LIMITATION =
  'ייבוא ידני מ־ChatGPT Plus. המקורות והטענות לא אומתו באמצעות Tavily/Firecrawl באפליקציה.';

@Injectable()
export class ResearchHandoffImportService {
  constructor(@InjectDataSource('intelligence') private readonly dataSource: DataSource) {}

  async importResearch(id: string, content: string) {
    const research = parseChatGptResearchImport(content);
    return this.dataSource.transaction(async (manager) => {
      const handoffs = manager.getRepository(ResearchHandoffEntity);
      const handoff = await handoffs.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!handoff) throw new NotFoundException('Research handoff not found.');
      if (handoff.status === ResearchHandoffStatus.CANCELLED)
        throw new ConflictException(
          'Cancelled handoffs cannot import research.',
        );
      if (
        normalizeLookup(research.companyName) !==
        normalizeLookup(handoff.companyName)
      )
        throw new BadRequestException(
          'Imported companyName must match the handoff company.',
        );
      const previous = importMetadataSchema.safeParse(
        handoff.deepResearchResult,
      );
      if (previous.success)
        return { ...previous.data, handoffId: id, reused: true };
      const companies = manager.getRepository(Company);
      const normalizedName = normalizeLookup(handoff.companyName);
      await companies.upsert({ name: handoff.companyName, normalizedName }, [
        'normalizedName',
      ]);
      const company = await companies.findOneByOrFail({ normalizedName });
      const importedAt = new Date();
      const reports = manager.getRepository(CompanyReportEntity);
      const report = await reports.save(
        reports.create({
          ...importedReportContent(research, company.website),
          companyId: company.id,
          companyName: company.name,
          role: research.roleTitle ?? handoff.roleTitle,
          provider: 'openai',
          mode: 'DEEP',
          candidateProfileStatus: 'not-configured',
          researchedAt: importedAt,
          researchEvidence: null,
          cache: null,
        }),
      );
      await companies.update(company.id, { manuallyUpdatedAt: importedAt });
      await manager
        .getRepository(ResearchCacheEntity)
        .delete({ companyId: company.id, section: 'company' });
      const metadata = {
        origin: IMPORT_ORIGIN,
        reportId: report.id,
        companyId: company.id,
        importedAt: importedAt.toISOString(),
      };
      await handoffs.update(id, {
        status: ResearchHandoffStatus.COMPLETED,
        completedAt: importedAt,
        deepResearchResult: { ...metadata, research },
      });
      return { ...metadata, handoffId: id, reused: false };
    });
  }
}

function importedReportContent(
  research: ChatGptResearchImport,
  website: string | null,
): PersistedCompanyReportContent {
  const unknownSummary = UNKNOWN_IMPORTED_SUMMARY;
  return {
    website,
    companySummary:
      research.companySummary ?? research.whatTheyDo ?? unknownSummary,
    productSummary: research.productSummary ?? unknownSummary,
    businessModel: research.businessModel,
    companySizeSummary: null,
    officeLocationSummary:
      [
        research.location.city,
        research.location.address,
        research.location.building,
      ]
        .filter(Boolean)
        .join(', ') || null,
    workModelSummary: research.workModel,
    engineeringSummary: research.engineeringSummary,
    technologySummary: research.technologySummary,
    stabilitySummary: research.stabilitySummary,
    employeeSentimentSummary: research.employeeSentimentSummary,
    quickBrief: {
      whatTheyDo:
        research.whatTheyDo ?? research.companySummary ?? unknownSummary,
      workModel: research.workModel,
      employees: { ...research.employees, verificationNote: null },
      greenFlags: research.greenFlags,
      redFlags: research.redFlags,
    },
    location: { ...research.location, verificationNote: null },
    recentImportantEvents: [],
    greenFlags: research.greenFlags,
    redFlags: research.redFlags,
    questionsToAskRecruiter: research.questionsToAskRecruiter,
    roleDiscoverySummary: null,
    relevantRoles: [],
    sources: research.sources,
    publicSignals: [],
    overallAssessment: null,
    interviewInsights: research.interviewInsights,
    workplaceSignals: research.workplaceSignals,
    reportLanguage: 'he-IL',
    researchQuality: {
      origin: 'chatgpt-import',
      evidenceLevel: 'limited',
      officeEvidenceLevel: 'limited',
      sourcesDiscovered: 0,
      pagesRead: 0,
      limitations: [MANUAL_RESEARCH_LIMITATION],
    },
  };
}
