import { RecruiterEmailDecisionService } from './agent/recruiter-email-decision.service';
import { RecruiterEmailCheapClassifierService } from './classifier/recruiter-email-cheap-classifier.service';
import { RecruiterEmailAnalyzerService } from './agent/recruiter-email-analyzer.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RecruiterAgentModule } from './recruiter-agent.module';
import { RecruiterAgentActionService } from './agent/recruiter-agent-action.service';
import { RecruiterEmailPipelineService } from './agent/recruiter-email-pipeline.service';
import { GmailClientService } from './gmail/gmail-client.service';

jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: () => ({ module: class TestScheduleModule {} }) },
  Interval: () => () => {},
}));

@Global()
@Module({
  providers: [
    {
      provide: getDataSourceToken('intelligence'),
      useValue: {
        entityMetadatas: [],
        options: { type: 'postgres' },
        getRepository: () => ({}),
      },
    },
  ],
  exports: [getDataSourceToken('intelligence')],
})
class TestDatabaseModule {}

describe('Recruiter action module integration', () => {
  it('resolves the pipeline and action executor through the existing research and job matching modules', async () => {
    const network = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network call'));
    try {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          TestDatabaseModule,
          RecruiterAgentModule,
        ],
      })
        .overrideProvider(GmailClientService)
        .useValue({})
        .compile();
      try {
        expect(module.get(RecruiterAgentActionService)).toBeInstanceOf(
          RecruiterAgentActionService,
        );
        expect(module.get(RecruiterEmailPipelineService)).toBeInstanceOf(
          RecruiterEmailPipelineService,
        );
        expect(module.get(RecruiterEmailDecisionService)).toBeInstanceOf(
          RecruiterEmailDecisionService,
        );
        expect(() =>
          module.get(RecruiterEmailCheapClassifierService),
        ).toThrow();
        expect(() => module.get(RecruiterEmailAnalyzerService)).toThrow();
        expect(network).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    } finally {
      network.mockRestore();
    }
  });
});
