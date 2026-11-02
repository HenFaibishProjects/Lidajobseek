import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../company-intelligence/company.entity';
import { CompanyReportEntity } from '../company-intelligence/company-report.entity';
import { CompanyRepository } from '../company-intelligence/company.repository';
import { ResearchCacheEntity } from '../company-intelligence/research-cache.entity';
import { JobMatchCacheEntity } from '../job-matching/job-match-cache.entity';
import { CompanyHistoryController } from './company-history.controller';
import { CompanyHistoryRepository } from './company-history.repository';
import { CompanyHistoryService } from './company-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyReportEntity,
      ResearchCacheEntity,
      JobMatchCacheEntity,
    ], 'intelligence'),
  ],
  controllers: [CompanyHistoryController],
  providers: [
    CompanyHistoryService,
    CompanyHistoryRepository,
    CompanyRepository,
  ],
})
export class CompanyHistoryModule {}
