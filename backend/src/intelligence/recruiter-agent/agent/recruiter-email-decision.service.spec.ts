import { ConfigService } from '@nestjs/config';
import { MockLanguageModelV3 } from 'ai/test';
import { LlmProviders } from '../../company-intelligence/llm-providers';
import { environmentSchema } from '../../config/environment';
import { EmailProcessingAuditService } from '../audit/email-processing-audit.service';
import { RecruiterEmailDecisionService } from './recruiter-email-decision.service';
import { recruiterEmailDecisionSchema } from '../recruiter-email-decision.schema';

const environment = {
  INTELLIGENCE_DB_HOST: 'test',
  INTELLIGENCE_DB_PORT: 5432,
  INTELLIGENCE_DB_USERNAME: 'test',
  INTELLIGENCE_DB_PASSWORD: 'test',
  INTELLIGENCE_DB_DATABASE: 'test',
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-secret',
  GOOGLE_REFRESH_TOKEN: 'synthetic-refresh',
};
const email = {
  id: 'synthetic',
  from: 'a@example.com',
  subject: 'Interview',
  body: 'Choose a slot',
  receivedAt: new Date(),
};
const decision = {
  isRelevant: true,
  confidence: 0.9,
  companyName: 'Acme',
  roleTitle: null,
  recruiterName: null,
  eventType: 'INTERVIEW_INVITATION',
  stage: null,
  summary: 'Invitation',
  actionRequired: true,
  requestedAction: 'Choose slot',
  interview: null,
  researchDepth: 'FULL',
  researchReason: 'Interview',
  companyResearchNeeded: true,
  nextAction: 'RESEARCH_COMPANY',
};
function modelFor(result: unknown) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}
describe('Single recruiter structured decision', () => {
  afterEach(() => jest.restoreAllMocks());
  it('makes exactly one generation without tools or a second legacy model', async () => {
    const model = modelFor(decision);
    const providers = {
      recruiterDecisionModel: jest.fn().mockReturnValue(model),
      recruiterModel: jest.fn(),
    };
    const service = new RecruiterEmailDecisionService(
      providers as unknown as LlmProviders,
      {} as EmailProcessingAuditService,
    );
    expect(await service.decide(email, 1)).toEqual(decision);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(providers.recruiterModel).not.toHaveBeenCalled();
    expect(model.doGenerateCalls[0].tools ?? []).toHaveLength(0);
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain('NEVER expensive API research');
    expect(prompt).toContain('final rejection');
  });
  it('rejects invalid output without automatic generation retries', async () => {
    const model = modelFor({ ...decision, researchDepth: 'DEEP' });
    const service = new RecruiterEmailDecisionService(
      { recruiterDecisionModel: () => model } as unknown as LlmProviders,
      {} as EmailProcessingAuditService,
    );
    await expect(service.decide(email)).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it('defaults recruiterDecisionModel to OpenAI gpt-6-luna without sending a request', () => {
    const providers = new LlmProviders(
      new ConfigService({
        OPENAI_API_KEY: 'synthetic-key',
        OPENAI_MODEL: 'different-general-model',
      }),
    );
    const model = providers.recruiterDecisionModel(jest.fn()) as {
      provider: string;
      modelId: string;
    };
    expect(model.provider).toBe('openai.responses');
    expect(model.modelId).toBe('gpt-6-luna');
  });
  it.each([
    ['openai', 'custom-openai-decision', 'openai.responses'],
    ['deepseek', 'custom-deepseek-decision', 'deepseek.chat'],
  ])(
    'honors explicit %s environment provider/model overrides',
    (provider, modelName, modelProvider) => {
      const config = environmentSchema.parse({
        ...environment,
        RECRUITER_DECISION_PROVIDER: provider,
        RECRUITER_DECISION_MODEL: modelName,
      });
      const providers = new LlmProviders(
        new ConfigService({
          ...config,
          OPENAI_API_KEY: 'synthetic-key',
          DEEPSEEK_API_KEY: 'synthetic-key',
        }),
      );
      const model = providers.recruiterDecisionModel(jest.fn()) as {
        provider: string;
        modelId: string;
      };
      expect(model.provider).toBe(modelProvider);
      expect(model.modelId).toBe(modelName);
      expect(config.RECRUITER_RESEARCH_PROVIDER).toBe('deepseek');
      expect(config.RECRUITER_RESEARCH_MODEL).toBe('deepseek-flash');
    },
  );
  it('sends one OpenAI gpt-6-luna structured decision request and preserves auditing', async () => {
    const network = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'response-mock',
          created_at: 1,
          model: 'gpt-6-luna',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'message-mock',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify(decision),
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const audit = {
      markSentToDecisionLlm: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RecruiterEmailDecisionService(
      new LlmProviders(new ConfigService({ OPENAI_API_KEY: 'synthetic-key' })),
      audit as unknown as EmailProcessingAuditService,
    );
    await expect(service.decide(email, 2)).resolves.toEqual(decision);
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toBe(
      'https://api.openai.com/v1/responses',
    );
    const request = JSON.parse(String(network.mock.calls[0][1]?.body));
    expect(request.model).toBe('gpt-6-luna');
    expect(request.text.format.type).toBe('json_schema');
    expect(request.max_output_tokens).toBe(2000);
    expect(request.thinking).toBeUndefined();
    expect(audit.markSentToDecisionLlm).toHaveBeenCalledWith(email.id, 2);
  });
  it('honors an explicit DeepSeek decision override and audits one HTTP request', async () => {
    const network = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'mock',
          created: 1,
          model: 'deepseek-flash',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(decision),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const audit = {
      markSentToDecisionLlm: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RecruiterEmailDecisionService(
      new LlmProviders(
        new ConfigService({
          ...environmentSchema.parse({
            ...environment,
            RECRUITER_DECISION_PROVIDER: 'deepseek',
            RECRUITER_DECISION_MODEL: 'deepseek-flash',
          }),
          DEEPSEEK_API_KEY: 'synthetic-key',
        }),
      ),
      audit as unknown as EmailProcessingAuditService,
    );
    await expect(service.decide(email, 2)).resolves.toEqual(decision);
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toContain('api.deepseek.com');
    expect(JSON.parse(String(network.mock.calls[0][1]?.body)).model).toBe(
      'deepseek-flash',
    );
    expect(JSON.parse(String(network.mock.calls[0][1]?.body)).thinking).toEqual(
      { type: 'disabled' },
    );
    expect(audit.markSentToDecisionLlm).toHaveBeenCalledWith(email.id, 2);
  });
  it('rejects inconsistent routing and unknown company research', () => {
    for (const invalid of [
      { ...decision, companyName: null },
      { ...decision, isRelevant: false },
      { ...decision, researchDepth: 'NONE' },
      { ...decision, nextAction: 'DRAFT_REPLY' },
    ])
      expect(recruiterEmailDecisionSchema.safeParse(invalid).success).toBe(
        false,
      );
  });
  it('validates the decision and SMTP defaults without requiring configured SMTP', () => {
    const config = environmentSchema.parse(environment);
    expect(config.RECRUITER_DECISION_PROVIDER).toBe('openai');
    expect(config.RECRUITER_DECISION_MODEL).toBe('gpt-6-luna');
    expect(config.RECRUITER_RESEARCH_PROVIDER).toBe('deepseek');
    expect(config.RECRUITER_RESEARCH_MODEL).toBe('deepseek-flash');
    expect(
      environmentSchema.parse({
        ...environment,
        RECRUITER_DECISION_MODEL: '  ',
      }).RECRUITER_DECISION_MODEL,
    ).toBe('gpt-6-luna');
    expect(config.SMTP_SECURE).toBe(false);
  });
});
