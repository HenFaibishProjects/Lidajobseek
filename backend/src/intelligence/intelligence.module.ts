import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyHistoryModule } from './company-history/company-history.module';
import { CompanyIntelligenceModule } from './company-intelligence/company-intelligence.module';
import { CompanyIntelligence1792700000000 } from './database/company-intelligence.migration';
import { ResearchModesRoles1792800000000 } from './database/research-modes-roles.migration';
import { ResearchQuality1792826000000 } from './database/research-quality.migration';
import { ResearchCache1792856000000 } from './database/research-cache.migration';
import { HebrewPresentation1792864000000 } from './database/hebrew-presentation.migration';
import { JobMatchCache1792900000000 } from './database/job-match-cache.migration';
import { CompanyManualUpdate1793000000000 } from './database/company-manual-update.migration';
import { PublicIntelligence1793100000000 } from './database/public-intelligence.migration';
import { CompanyResearchInsights1793600000000 } from './database/company-research-insights.migration';
import { assertIntelligenceDatabaseIsolation } from './database/intelligence-database-safety';
import { IntelligenceSecurityModule } from './guards/intelligence-security.module';
import { JobMatchingModule } from './job-matching/job-matching.module';
import { RecruiterAgentActions1793500000000 } from './recruiter-agent/database/recruiter-agent-actions.migration';
import { EmailProcessingAudit1793200000000 } from './recruiter-agent/database/email-processing-audit.migration';
import { RecruiterLlmStages1793300000000 } from './recruiter-agent/database/recruiter-llm-stages.migration';
import { RecruiterProcessingState1793400000000 } from './recruiter-agent/database/recruiter-processing-state.migration';
import { RecruiterResearchHandoffs1793700000000 } from './recruiter-agent/database/recruiter-research-handoffs.migration';
import { RecruiterAgentModule } from './recruiter-agent/recruiter-agent.module';

const INTELLIGENCE_CONNECTION = 'intelligence';

function isEnabled(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === true || value === 'true';
}

@Module({
  imports: [
    IntelligenceSecurityModule,
    TypeOrmModule.forRootAsync({
      name: INTELLIGENCE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        assertIntelligenceDatabaseIsolation(config);

        return {
          type: 'postgres' as const,
          host: config.getOrThrow<string>('INTELLIGENCE_DB_HOST'),
          port: Number(
            config.get<number | string>('INTELLIGENCE_DB_PORT') ?? 5432,
          ),
          username: config.getOrThrow<string>('INTELLIGENCE_DB_USERNAME'),
          password: config.getOrThrow<string>('INTELLIGENCE_DB_PASSWORD'),
          database: config.getOrThrow<string>('INTELLIGENCE_DB_DATABASE'),
          schema:
            config.get<string>('INTELLIGENCE_DB_SCHEMA')?.trim() || 'public',
          ssl: isEnabled(config.get('INTELLIGENCE_DB_SSL'), true)
            ? { rejectUnauthorized: false }
            : false,
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: true,
          migrations: [
            CompanyIntelligence1792700000000,
            ResearchModesRoles1792800000000,
            ResearchQuality1792826000000,
            ResearchCache1792856000000,
            HebrewPresentation1792864000000,
            JobMatchCache1792900000000,
            CompanyManualUpdate1793000000000,
            PublicIntelligence1793100000000,
            EmailProcessingAudit1793200000000,
            RecruiterLlmStages1793300000000,
            RecruiterProcessingState1793400000000,
            RecruiterAgentActions1793500000000,
            CompanyResearchInsights1793600000000,
            RecruiterResearchHandoffs1793700000000,
          ],
          uuidExtension: 'pgcrypto',
          installExtensions: false,
          connectTimeoutMS: 10000,
          extra: {
            connectionTimeoutMillis: 10000,
            statement_timeout: 10000,
            query_timeout: 12000,
            lock_timeout: 5000,
            idle_in_transaction_session_timeout: 15000,
          },
        };
      },
    }),
    CompanyIntelligenceModule,
    JobMatchingModule,
    CompanyHistoryModule,
    RecruiterAgentModule,
  ],
})
export class IntelligenceModule {}
