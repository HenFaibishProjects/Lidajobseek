import { ConfigService } from '@nestjs/config';
import { CompanyIntelligence1792700000000 } from './company-intelligence.migration';
import { ResearchModesRoles1792800000000 } from './research-modes-roles.migration';
import { ResearchQuality1792826000000 } from './research-quality.migration';
import { ResearchCache1792856000000 } from './research-cache.migration';
import { HebrewPresentation1792864000000 } from './hebrew-presentation.migration';
import { JobMatchCache1792900000000 } from './job-match-cache.migration';
import { CompanyManualUpdate1793000000000 } from './company-manual-update.migration';
import { PublicIntelligence1793100000000 } from './public-intelligence.migration';
import { CompanyResearchInsights1793600000000 } from './company-research-insights.migration';
import { CandidateProfiles1793800000000 } from './candidate-profiles.migration';
import { assertIntelligenceDatabaseIsolation } from './intelligence-database-safety';
import { EmailProcessingAudit1793200000000 } from '../recruiter-agent/database/email-processing-audit.migration';
import { RecruiterLlmStages1793300000000 } from '../recruiter-agent/database/recruiter-llm-stages.migration';
import { RecruiterProcessingState1793400000000 } from '../recruiter-agent/database/recruiter-processing-state.migration';
import { RecruiterAgentActions1793500000000 } from '../recruiter-agent/database/recruiter-agent-actions.migration';
import { RecruiterResearchHandoffs1793700000000 } from '../recruiter-agent/database/recruiter-research-handoffs.migration';

const SAFE_POSTGRES_SCHEMA = /^[a-z_][a-z0-9_]*$/;

function isEnabled(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value === true || value === 'true';
}

export function getIntelligenceSchema(config: ConfigService): string {
  const schema =
    config.get<string>('INTELLIGENCE_DB_SCHEMA')?.trim() || 'public';
  if (!SAFE_POSTGRES_SCHEMA.test(schema)) {
    throw new Error(
      'INTELLIGENCE_DB_SCHEMA must be a lowercase PostgreSQL identifier using only letters, numbers and underscores.',
    );
  }
  return schema;
}

export function buildIntelligenceDataSourceOptions(config: ConfigService) {
  assertIntelligenceDatabaseIsolation(config);
  const schema = getIntelligenceSchema(config);

  return {
    type: 'postgres' as const,
    host: config.getOrThrow<string>('INTELLIGENCE_DB_HOST'),
    port: Number(
      config.get<number | string>('INTELLIGENCE_DB_PORT') ?? 5432,
    ),
    username: config.getOrThrow<string>('INTELLIGENCE_DB_USERNAME'),
    password: config.getOrThrow<string>('INTELLIGENCE_DB_PASSWORD'),
    database: config.getOrThrow<string>('INTELLIGENCE_DB_DATABASE'),
    schema,
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
      CandidateProfiles1793800000000,
    ],
    uuidExtension: 'pgcrypto' as const,
    installExtensions: false,
    connectTimeoutMS: 10000,
    extra: {
      // Raw migration SQL must resolve to the same schema as TypeORM entities.
      // Do not include public as a fallback: a missing custom schema should fail
      // startup instead of silently creating Intelligence tables in public.
      options: `-c search_path=${schema}`,
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
      query_timeout: 12000,
      lock_timeout: 5000,
      idle_in_transaction_session_timeout: 15000,
    },
  };
}
