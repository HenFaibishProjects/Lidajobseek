import { ConfigService } from '@nestjs/config';
import { MockLanguageModelV3 } from 'ai/test';
import { generateText } from 'ai';
import { LlmProviders } from '../company-intelligence/llm-providers';
import { EmailProcessingAuditService } from './audit/email-processing-audit.service';
import { RecruiterEmailCheapClassifierService } from './classifier/recruiter-email-cheap-classifier.service';
import { RecruiterEmailAnalyzerService } from './agent/recruiter-email-analyzer.service';
import { environmentSchema } from '../config/environment';

const email = {
  id: '1',
  from: 'a@b.com',
  subject: 'Hello',
  body: 'Untrusted email',
  receivedAt: new Date(),
};
const cheap = {
  isRelevant: true,
  confidence: 0.9,
  emailType: 'INTERVIEW_INVITATION' as const,
  companyName: null,
  roleTitle: null,
  reason: 'Invitation',
};
const analysis = {
  companyName: null,
  roleTitle: null,
  recruiterName: null,
  eventType: 'INTERVIEW_INVITATION',
  stage: null,
  summary: 'An invitation',
  actionRequired: true,
  requestedAction: 'Confirm',
  interview: null,
  companyResearchNeeded: false,
  researchDepth: 'NONE' as const,
  researchReason: 'No research needed',
  nextAction: 'DRAFT_REPLY',
};
function modelFor(output: unknown) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify(output) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

describe('Recruiter structured model output', () => {
  it('validates the cheap response through the real AI SDK', async () => {
    const providers = {
      recruiterModel: jest.fn().mockReturnValue(modelFor(cheap)),
    };
    const service = new RecruiterEmailCheapClassifierService(
      providers as unknown as LlmProviders,
      {} as EmailProcessingAuditService,
    );
    await expect(service.classify(email)).resolves.toEqual(cheap);
    expect(providers.recruiterModel).toHaveBeenCalledWith(
      'CHEAP',
      expect.any(Function),
    );
  });
  it('rejects invalid confidence instead of escalating malformed classification', async () => {
    const providers = {
      recruiterModel: () => modelFor({ ...cheap, confidence: 2 }),
    };
    const service = new RecruiterEmailCheapClassifierService(
      providers as unknown as LlmProviders,
      {} as EmailProcessingAuditService,
    );
    await expect(service.classify(email)).rejects.toThrow();
  });
  it('validates the expensive analysis and rejects unknown actions', async () => {
    const validModel = modelFor(analysis);
    const providers = {
      recruiterModel: jest
        .fn()
        .mockReturnValueOnce(validModel)
        .mockReturnValueOnce(
          modelFor({ ...analysis, nextAction: 'SEND_EMAIL' }),
        ),
    };
    const service = new RecruiterEmailAnalyzerService(
      providers as unknown as LlmProviders,
      {} as EmailProcessingAuditService,
    );
    await expect(service.analyze(email, cheap, null)).resolves.toEqual(
      analysis,
    );
    expect(validModel.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(validModel.doGenerateCalls[0].prompt)).toContain(
      'Research costs money',
    );
    expect(JSON.stringify(validModel.doGenerateCalls[0].prompt)).toContain(
      'pure cancellation without replacement/next step',
    );
    await expect(service.analyze(email, cheap, null)).rejects.toThrow();
  });
});

describe('Recruiter provider configuration and actual request auditing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends reasoning effort none and the 600-token cap for the OpenAI cheap gate', async () => {
    const network = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{"error":{"message":"unavailable"}}', { status: 503 }),
      );
    const providers = new LlmProviders(
      new ConfigService({
        RECRUITER_CHEAP_PROVIDER: 'openai',
        RECRUITER_CHEAP_MODEL: 'gpt-6-luna',
        OPENAI_API_KEY: 'test-key',
      }),
    );
    const audit = {
      markSentToCheapLlm: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RecruiterEmailCheapClassifierService(
      providers,
      audit as unknown as EmailProcessingAuditService,
    );
    await expect(service.classify(email)).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(network.mock.calls[0][1]?.body));
    expect(request.model).toBe('gpt-6-luna');
    expect(request.reasoning).toMatchObject({ effort: 'none' });
    expect(request.max_output_tokens).toBe(600);
    // Assert the documented policy sent to the provider, not model accuracy.
    const prompt = JSON.stringify(request.input);
    expect(prompt).toContain(
      'Clear final application rejection with no requested action or alternative opportunity: isRelevant=false',
    );
    expect(prompt).toContain('emailType may remain HIRING_PROCESS_UPDATE');
    expect(prompt).toContain(
      'Pass an alternative role, continued company interest,',
    );
    expect(prompt).toContain(
      'or a meaningful request needing attention, even when the message also rejects an application.',
    );
    expect(prompt).toContain(
      'Interview cancellations, rescheduling, and other interview updates remain relevant.',
    );
    expect(prompt).toContain(
      'pass ambiguous hiring/recruiter/interview emails through.',
    );
    expect(prompt).toContain(
      'application receipts with no action or company interest.',
    );
  });

  it('counts failed real HTTP attempts, using the selected stage/provider/model', async () => {
    const network = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{"error":{"message":"unavailable"}}', { status: 503 }),
      );
    const sent = jest.fn().mockResolvedValue(undefined);
    const providers = new LlmProviders(
      new ConfigService({
        RECRUITER_CHEAP_PROVIDER: 'deepseek',
        RECRUITER_CHEAP_MODEL: 'configured-cheap-model',
        DEEPSEEK_API_KEY: 'test-key',
      }),
    );
    const model = providers.recruiterModel('CHEAP', sent);
    expect(sent).not.toHaveBeenCalled();
    await expect(
      generateText({ model, prompt: 'hello', maxRetries: 0 }),
    ).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(network.mock.calls[0][1]?.body)).model).toBe(
      'configured-cheap-model',
    );
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('does not mark a request when model/key configuration is missing', () => {
    const sent = jest.fn();
    const providers = new LlmProviders(
      new ConfigService({ RECRUITER_CHEAP_MODEL: 'test-model' }),
    );
    expect(() => providers.recruiterModel('CHEAP', sent)).toThrow();
    expect(sent).not.toHaveBeenCalled();
  });

  it('rejects empty model configuration before any request', () => {
    const sent = jest.fn();
    const providers = new LlmProviders(
      new ConfigService({
        RECRUITER_CHEAP_MODEL: ' ',
        OPENAI_API_KEY: 'test-key',
      }),
    );
    expect(() => providers.recruiterModel('CHEAP', sent)).toThrow(
      'RECRUITER_CHEAP_MODEL is not configured',
    );
    expect(sent).not.toHaveBeenCalled();
  });

  it('validates provider choices and permits unset stage models until first use', () => {
    const db = {
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_USERNAME: 'test',
      DB_PASSWORD: 'test',
      DB_DATABASE: 'test',
    };
    expect(
      environmentSchema.parse({ ...db, RECRUITER_CHEAP_MODEL: '' })
        .RECRUITER_CHEAP_MODEL,
    ).toBe('gpt-6-luna');
    expect(
      environmentSchema.safeParse({
        ...db,
        RECRUITER_CHEAP_PROVIDER: 'unsupported',
      }).success,
    ).toBe(false);
  });
  it('resolves both selected default models and allows explicit overrides', () => {
    const db = {
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_USERNAME: 'test',
      DB_PASSWORD: 'test',
      DB_DATABASE: 'test',
    };
    const defaults = environmentSchema.parse(db);
    const providers = new LlmProviders(
      new ConfigService({ ...defaults, OPENAI_API_KEY: 'test-key' }),
    );
    expect(providers.recruiterModel('CHEAP', jest.fn()).modelId).toBe(
      'gpt-6-luna',
    );
    expect(providers.recruiterModel('ANALYSIS', jest.fn()).modelId).toBe(
      'gpt-6.1-terra',
    );
    const config = environmentSchema.parse({
      ...db,
      RECRUITER_CHEAP_MODEL: 'custom-cheap',
      RECRUITER_ANALYSIS_MODEL: 'custom-analysis',
    });
    const overrides = new LlmProviders(
      new ConfigService({ ...config, OPENAI_API_KEY: 'test-key' }),
    );
    expect(overrides.recruiterModel('CHEAP', jest.fn()).modelId).toBe(
      'custom-cheap',
    );
    expect(overrides.recruiterModel('ANALYSIS', jest.fn()).modelId).toBe(
      'custom-analysis',
    );
  });
});
