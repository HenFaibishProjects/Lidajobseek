import { ResearchHandoffImportService } from './handoff/research-handoff-import.service';
import { RecruiterEmailDecisionService } from './agent/recruiter-email-decision.service';
import { ResearchHandoffEntity } from './handoff/research-handoff.entity';
import { ResearchHandoffRepository } from './handoff/research-handoff.repository';
import { ResearchHandoffService } from './handoff/research-handoff.service';
import { ResearchHandoffController } from './handoff/research-handoff.controller';
import { NotificationEmailService } from './notification/notification-email.service';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LlmProviders } from '../company-intelligence/llm-providers';
import { CompanyRepository } from '../company-intelligence/company.repository';
import { CompanyHistoryRepository } from '../company-history/company-history.repository';
import { RecruiterEmailPipelineService } from './agent/recruiter-email-pipeline.service';
import { EmailProcessingAuditEntity } from './audit/email-processing-audit.entity';
import { EmailProcessingAuditService } from './audit/email-processing-audit.service';
import { GmailClientService } from './gmail/gmail-client.service';
import { GmailTriggerService } from './gmail/gmail-trigger.service';
import { CompanyIntelligenceModule } from '../company-intelligence/company-intelligence.module';
import { JobMatchingModule } from '../job-matching/job-matching.module';
import { RecruiterAgentActionEntity } from './action/recruiter-agent-action.entity';
import { RecruiterAgentActionRepository } from './action/recruiter-agent-action.repository';
import { RecruiterAgentActionService } from './agent/recruiter-agent-action.service';

@Module({
  controllers: [ResearchHandoffController],
  imports: [
    ScheduleModule.forRoot(),
    CompanyIntelligenceModule,
    JobMatchingModule,

    TypeOrmModule.forFeature([
      EmailProcessingAuditEntity,
      RecruiterAgentActionEntity,
      ResearchHandoffEntity,
    ], 'intelligence'),
  ],

  providers: [
    RecruiterEmailDecisionService,
    ResearchHandoffRepository,
    ResearchHandoffService,
    ResearchHandoffImportService,
    NotificationEmailService,
    GmailClientService,
    GmailTriggerService,
    EmailProcessingAuditService,
    LlmProviders,
    CompanyRepository,
    CompanyHistoryRepository,
    RecruiterEmailPipelineService,
    RecruiterAgentActionRepository,
    RecruiterAgentActionService,
  ],
})
export class RecruiterAgentModule {}
