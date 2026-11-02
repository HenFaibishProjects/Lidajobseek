import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActiveCandidateProfileService } from '../candidate-profile/active-candidate-profile.service';
import { CandidateProfileEntity } from '../candidate-profile/candidate-profile.entity';
import { CandidateProfileRepository } from '../candidate-profile/candidate-profile.repository';
import { FirecrawlService } from '../company-intelligence/firecrawl.service';
import { LlmProviders } from '../company-intelligence/llm-providers';
import { TavilyService } from '../company-intelligence/tavily.service';
import { JobMatchCacheEntity } from './job-match-cache.entity';
import { JobMatchCacheRepository } from './job-match-cache.repository';
import { JobMatchingController } from './job-matching.controller';
import { JobMatchingService } from './job-matching.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CandidateProfileEntity, JobMatchCacheEntity], 'intelligence'),
  ],
  controllers: [JobMatchingController],
  exports: [JobMatchingService],
  providers: [
    JobMatchingService,
    JobMatchCacheRepository,
    CandidateProfileRepository,
    ActiveCandidateProfileService,
    LlmProviders,
    TavilyService,
    FirecrawlService,
  ],
})
export class JobMatchingModule {}
