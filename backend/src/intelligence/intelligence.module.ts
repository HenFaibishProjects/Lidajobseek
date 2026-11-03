import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyHistoryModule } from './company-history/company-history.module';
import { CompanyIntelligenceModule } from './company-intelligence/company-intelligence.module';
import { buildIntelligenceDataSourceOptions } from './database/intelligence-database-options';
import { IntelligenceSecurityModule } from './guards/intelligence-security.module';
import { JobMatchingModule } from './job-matching/job-matching.module';
import { RecruiterAgentModule } from './recruiter-agent/recruiter-agent.module';

const INTELLIGENCE_CONNECTION = 'intelligence';

@Module({
  imports: [
    IntelligenceSecurityModule,
    TypeOrmModule.forRootAsync({
      name: INTELLIGENCE_CONNECTION,
      inject: [ConfigService],
      useFactory: buildIntelligenceDataSourceOptions,
    }),
    CompanyIntelligenceModule,
    JobMatchingModule,
    CompanyHistoryModule,
    RecruiterAgentModule,
  ],
})
export class IntelligenceModule {}
