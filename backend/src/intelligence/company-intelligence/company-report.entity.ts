import type { StoredResearchEvidence } from './research-cache';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from './company.entity';
import type { PersistedCompanyReportContent } from './company-report.schema';
import type { CacheMetadata } from './company-report.schema';
import type { ResearchMode } from './research-mode';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import type { LlmProvider } from './company-research-request.schema';

@Entity('company_reports')
export class CompanyReportEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index('IDX_report_company')
  @Column({ type: 'uuid' })
  companyId!: string;
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company!: Company;
  @Column({ type: 'varchar', length: 200 }) companyName!: string;
  @Column({ type: 'text', nullable: true }) website!: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) role!:
    string | null;
  @Column({ type: 'varchar', length: 20 }) provider!: LlmProvider;
  @Column({ type: 'varchar', length: 10, default: 'DEEP' }) mode!: ResearchMode;
  @Column({ type: 'varchar', length: 20, default: 'not-configured' })
  candidateProfileStatus!: CandidateProfile['status'];
  @Column({ type: 'jsonb', nullable: true }) quickBrief!:
    PersistedCompanyReportContent['quickBrief'] | null;
  @Column({ type: 'jsonb', nullable: true }) location!:
    PersistedCompanyReportContent['location'] | null;
  @Column({ type: 'varchar', length: 10, nullable: true })
  reportLanguage!: 'he-IL' | null;
  @Column({ type: 'jsonb', nullable: true })
  researchEvidence!: StoredResearchEvidence | null;
  @Column('text') companySummary!: string;
  @Column('text') productSummary!: string;
  @Column({ type: 'text', nullable: true }) businessModel!: string | null;
  @Column({ type: 'text', nullable: true }) companySizeSummary!: string | null;
  @Column({ type: 'text', nullable: true }) officeLocationSummary!:
    string | null;
  @Column({ type: 'text', nullable: true }) workModelSummary!: string | null;
  @Column({ type: 'text', nullable: true }) engineeringSummary!: string | null;
  @Column({ type: 'text', nullable: true }) technologySummary!: string | null;
  @Column({ type: 'text', nullable: true }) stabilitySummary!: string | null;
  @Column({ type: 'text', nullable: true }) employeeSentimentSummary!:
    string | null;
  @Column('jsonb') recentImportantEvents!: string[];
  @Column('jsonb') greenFlags!: string[];
  @Column('jsonb') redFlags!: string[];
  @Column('jsonb') questionsToAskRecruiter!: string[];
  @Column({ type: 'text', nullable: true }) roleDiscoverySummary!:
    string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  relevantRoles!: PersistedCompanyReportContent['relevantRoles'];
  @Column('jsonb') sources!: PersistedCompanyReportContent['sources'];
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  publicSignals!: PersistedCompanyReportContent['publicSignals'];
  @Column({ type: 'jsonb', nullable: true })
  overallAssessment!: PersistedCompanyReportContent['overallAssessment'];
  @Column({ type: 'jsonb', nullable: true })
  interviewInsights!: PersistedCompanyReportContent['interviewInsights'];
  @Column({ type: 'jsonb', nullable: true })
  workplaceSignals!: PersistedCompanyReportContent['workplaceSignals'];
  @Column({ type: 'jsonb', nullable: true })
  researchQuality!: PersistedCompanyReportContent['researchQuality'];
  @Column({ type: 'jsonb', nullable: true }) cache!: CacheMetadata | null;
  @Column('timestamptz') researchedAt!: Date;
}
