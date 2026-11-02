import { ResearchCacheEntity } from './research-cache.entity';
import { Module } from '@nestjs/common';
import { CandidateProfileService } from '../candidate-profile/candidate-profile';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './company.entity';
import { CompanyReportEntity } from './company-report.entity';
import { CompanyRepository } from './company.repository';
import { CompanyIntelligenceController } from './company-intelligence.controller';
import { CompanyIntelligenceService } from './company-intelligence.service';
import { LlmProviders } from './llm-providers';
import { TavilyService } from './tavily.service';
import { FirecrawlService } from './firecrawl.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyReportEntity,
      ResearchCacheEntity,
    ], 'intelligence'),
  ],
  controllers: [CompanyIntelligenceController],
  exports: [CompanyIntelligenceService],
  providers: [
    CompanyIntelligenceService,
    CompanyRepository,
    LlmProviders,
    CandidateProfileService,
    TavilyService,
    FirecrawlService,
  ],
})
export class CompanyIntelligenceModule {}
