import {
  locationAssessmentSchema,
  locationFactsSchema,
} from './location-intelligence';
import { llmJobMatchSchema } from '../job-matching/job-match.schema';
import { followUpPlanSchema } from './research-follow-up';
import { Logger } from '@nestjs/common';
import { APICallError, asSchema, generateText, Output, tool } from 'ai';
import { logResearchFailure, ResearchError } from './research-error';
import { environmentSchema } from '../config/environment';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { z } from 'zod';
import { TavilyService } from './tavily.service';
import { FirecrawlService, MAX_PAGE_CHARACTERS } from './firecrawl.service';
import { isAllowedResearchUrl, isPublicAddress } from './research-url';
import { MAX_RESPONSE_BYTES } from './research-http';
import { LlmProviders } from './llm-providers';
import {
  llmCompanyReportSchema,
  llmCompanyOnlySchema,
  llmRolesOnlySchema,
  companyReportContentSchema,
  validateReportEvidence,
} from './company-report.schema';
import {
  reportFixture,
  reportDraftFixture,
} from '../../test/company-report.fixture';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
const mockedLookup = jest.mocked(lookup);
const config = new ConfigService({
  TAVILY_API_KEY: 'test-tavily',
  FIRECRAWL_API_KEY: 'test-firecrawl',
  OPENAI_API_KEY: 'test-openai',
  OPENAI_MODEL: 'configured-openai',
  DEEPSEEK_API_KEY: 'test-deepseek',
  DEEPSEEK_MODEL: 'configured-deepseek',
});
const signal = () => new AbortController().signal;

describe('Provider selection and research adapters', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    mockedLookup.mockReset();
    mockedLookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
    ] as never);
  });
  afterEach(() => fetchMock.mockRestore());

  it('selects configured model IDs and only requires the selected provider key', () => {
    const providers = new LlmProviders(config);
    expect(providers.model('openai')).toMatchObject({
      modelId: 'configured-openai',
      provider: 'openai.responses',
    });
    expect(providers.model('deepseek')).toMatchObject({
      modelId: 'configured-deepseek',
      provider: 'deepseek.chat',
    });
    const missing = new LlmProviders(
      new ConfigService({ OPENAI_MODEL: 'configured-openai' }),
    );
    expect(() => missing.model('openai')).toThrow(
      'OPENAI_API_KEY is not configured',
    );
  });

  it('defaults OpenAI to gpt-6.1-sol, retains environment overrides, and leaves DeepSeek unchanged', () => {
    const base = {
      DB_HOST: 'database.example.com',
      DB_PORT: 5432,
      DB_USERNAME: 'test',
      DB_PASSWORD: 'test',
      DB_DATABASE: 'test',
      OPENAI_API_KEY: 'test',
      DEEPSEEK_API_KEY: 'test',
    };
    const defaults = environmentSchema.parse(base);
    expect(defaults.OPENAI_MODEL).toBe('gpt-6.1-sol');
    const providers = new LlmProviders(new ConfigService(defaults));
    expect(providers.model('openai')).toMatchObject({ modelId: 'gpt-6.1-sol' });
    expect(providers.model('deepseek')).toMatchObject({
      modelId: 'deepseek-chat',
    });
    const overrides = environmentSchema.parse({
      ...base,
      OPENAI_MODEL: 'configured-openai',
      DEEPSEEK_MODEL: 'configured-deepseek',
    });
    expect(
      new LlmProviders(new ConfigService(overrides)).model('openai'),
    ).toMatchObject({ modelId: 'configured-openai' });
    expect(
      new LlmProviders(new ConfigService(overrides)).model('deepseek'),
    ).toMatchObject({ modelId: 'configured-deepseek' });
  });

  it.each([
    ['openai', 'https://api.openai.com/v1/responses'],
    ['deepseek', 'https://api.deepseek.com/chat/completions'],
  ] as const)(
    'uses the expected %s endpoint with structured output and tools',
    async (provider, endpoint) => {
      fetchMock.mockResolvedValue(
        Response.json(
          {
            error: {
              message: 'Synthetic unsupported parameter',
              type: 'invalid_request_error',
              code: 'unsupported_parameter',
              param: 'temperature',
            },
          },
          { status: 400 },
        ),
      );
      await expect(
        generateText({
          model: new LlmProviders(config).model(provider),
          prompt: 'Synthetic private research request',
          tools: {
            search: tool({
              inputSchema: z.object({ query: z.string() }),
              execute: () => ({ results: [] }),
            }),
          },
          output: Output.object({ schema: z.object({ summary: z.string() }) }),
          maxRetries: 0,
        }),
      ).rejects.toMatchObject({ name: 'AI_APICallError', statusCode: 400 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(endpoint);
      const body = JSON.parse(init!.body as string) as Record<string, unknown>;
      if (provider === 'openai') {
        expect(body).toMatchObject({
          model: 'configured-openai',
          text: { format: { type: 'json_schema' } },
          tools: [
            expect.objectContaining({ type: 'function', name: 'search' }),
          ],
        });
        expect(body).toHaveProperty('input');
        expect(body).not.toHaveProperty('messages');
      } else {
        expect(body).toMatchObject({
          model: 'configured-deepseek',
          response_format: { type: 'json_object' },
          tools: [expect.objectContaining({ type: 'function' })],
        });
        expect(body).toHaveProperty('messages');
        expect(body).not.toHaveProperty('input');
      }
    },
  );

  it('logs allowlisted provider 400 details without credentials, prompts or response extras', () => {
    const logger = new Logger('Provider diagnostic test');
    const log = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const secret = 'synthetic-provider-secret';
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = secret;
    try {
      const cause = new APICallError({
        message: 'Synthetic API failure',
        url: 'https://api.openai.com/v1/responses',
        statusCode: 400,
        requestBodyValues: {
          input: 'Synthetic private prompt',
          metadata: { profile: 'Synthetic private candidate profile' },
        },
        responseHeaders: { authorization: 'Bearer synthetic-header-secret' },
        responseBody: JSON.stringify({
          error: {
            code: 'invalid_json_schema',
            type: 'invalid_request_error',
            param: 'text.format.schema',
            message: `Invalid schema: 'additionalProperties' is required. ${secret} sk-test-sensitive Authorization: Bearer synthetic-echo-secret; Synthetic private prompt; Synthetic private candidate profile; "arbitrary quoted secret"`,
            request: { apiKey: secret, prompt: 'Do not log extra fields' },
          },
          request: 'Do not log the response envelope',
        }),
      });
      const failure = new ResearchError(
        'LLM_FAILURE',
        'LLM synthesis failed',
        502,
        cause,
      );
      logResearchFailure(logger, failure, {
        provider: 'openai',
        stage: 'synthesis',
        mode: 'QUICK',
        searchCalls: 3,
        scrapeCalls: 2,
        discoveredSize: 5,
        pagesSize: 2,
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          causeName: 'AI_APICallError',
          providerStatus: 400,
          providerErrorCode: 'invalid_json_schema',
          providerErrorType: 'invalid_request_error',
          providerErrorParameter: 'text.format.schema',
        }),
      );
      expect(log.mock.calls[0][0]).toHaveProperty(
        'providerErrorMessage',
        expect.stringContaining("'additionalProperties' is required"),
      );
      const logged = JSON.stringify(log.mock.calls);
      for (const forbidden of [
        secret,
        'sk-test-sensitive',
        'synthetic-header-secret',
        'synthetic-echo-secret',
        'Synthetic private prompt',
        'Synthetic private candidate profile',
        'arbitrary quoted secret',
        'Do not log',
      ])
        expect(logged).not.toContain(forbidden);
      expect(failure.getResponse()).toEqual({
        code: 'LLM_FAILURE',
        message: 'LLM synthesis failed',
      });
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      log.mockRestore();
    }
  });

  it('bounds malformed provider responses and sanitizes the SDK message fallback', () => {
    const logger = new Logger('Provider diagnostic test');
    const log = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      const cause = new APICallError({
        message: `unsupported_parameter: temperature. Bearer synthetic-secret ${'x'.repeat(2000)}`,
        url: 'https://api.openai.com/v1/responses',
        statusCode: 400,
        requestBodyValues: {},
        responseBody: '<html>private response</html>',
      });
      logResearchFailure(
        logger,
        new ResearchError('LLM_FAILURE', 'LLM synthesis failed', 502, cause),
        {
          provider: 'openai',
          stage: 'synthesis',
          searchCalls: 1,
          scrapeCalls: 1,
          discoveredSize: 1,
          pagesSize: 1,
        },
      );
      const details = log.mock.calls[0][0] as { providerErrorMessage: string };
      expect(details.providerErrorMessage).toContain(
        'unsupported_parameter: temperature',
      );
      expect(details.providerErrorMessage.length).toBeLessThanOrEqual(1000);
      expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-secret');
      expect(JSON.stringify(log.mock.calls)).not.toContain('private response');
    } finally {
      log.mockRestore();
    }
  });

  it('uses Tavily as general research and filters unsafe results', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        results: [
          {
            title: 'Acme engineering',
            url: 'https://acme.com/',
            content: 'x'.repeat(4000),
          },
          { title: 'Private', url: 'http://127.0.0.1/' },
          { title: 'Invalid' },
        ],
      }),
    );
    const results = await new TavilyService(config).searchWeb(
      'Acme engineering',
      signal(),
    );
    expect(results).toHaveLength(1);
    expect(results[0].content).toHaveLength(3000);
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init!.body as string)).toEqual({
      query: 'Acme engineering',
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    });
  });

  it('reads only discovered public pages and bounds content', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        data: {
          markdown: 'x'.repeat(MAX_PAGE_CHARACTERS + 100),
          metadata: { url: 'https://acme.com/' },
        },
      }),
    );
    const content = await new FirecrawlService(config).readPage(
      'https://acme.com/',
      new Set(['https://acme.com/']),
      signal(),
    );
    expect(content.content).toHaveLength(MAX_PAGE_CHARACTERS);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]!.body as string),
    ).toMatchObject({
      url: 'https://acme.com/',
      formats: ['markdown'],
      maxAge: 0,
      skipTlsVerification: false,
    });
  });

  it('rejects undiscovered pages before any outbound request', async () => {
    await expect(
      new FirecrawlService(config).readPage(
        'https://acme.com/',
        new Set(),
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects public names resolving to private addresses', async () => {
    mockedLookup.mockResolvedValue([
      { address: '10.0.0.1', family: 4 },
    ] as never);
    await expect(
      new FirecrawlService(config).readPage(
        'https://acme.com/',
        new Set(['https://acme.com/']),
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects HTTP error pages as ordinary page-reading failures', async () => {
    for (const metadata of [{ statusCode: 403 }, { error: 'blocked' }]) {
      fetchMock.mockResolvedValue(
        Response.json({
          success: true,
          data: { markdown: 'content', metadata },
        }),
      );
      await expect(
        new FirecrawlService(config).readPage(
          'https://acme.com/',
          new Set(['https://acme.com/']),
          signal(),
        ),
      ).rejects.toBeDefined();
    }
  });

  it.each([
    'https://acme.com/about/',
    'https://www.acme.com/about',
    'https://boards.greenhouse.io/acme/jobs/123',
  ])(
    'accepts safe public redirect %s while retaining the original request identity',
    async (resolvedUrl) => {
      fetchMock.mockResolvedValue(
        Response.json({
          success: true,
          data: { markdown: 'Public page', metadata: { url: resolvedUrl } },
        }),
      );
      const discovered = new Set(['http://acme.com/about']);
      await expect(
        new FirecrawlService(config).readPage(
          'http://acme.com/about',
          discovered,
          signal(),
        ),
      ).resolves.toEqual({ content: 'Public page', resolvedUrl });
      expect(discovered).toEqual(new Set(['http://acme.com/about']));
    },
  );

  it.each([
    'http://127.0.0.1/',
    'http://service.internal/',
    'https://user:password@acme.com/',
    'file:///etc/passwd',
  ])('hard-fails unsafe redirect target %s', async (resolvedUrl) => {
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        data: { markdown: 'content', metadata: { url: resolvedUrl } },
      }),
    );
    await expect(
      new FirecrawlService(config).readPage(
        'https://acme.com/',
        new Set(['https://acme.com/']),
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
  });

  it('hard-fails a public-looking redirected hostname resolving to a private address', async () => {
    mockedLookup
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never);
    fetchMock.mockResolvedValue(
      Response.json({
        success: true,
        data: {
          markdown: 'content',
          metadata: { url: 'https://private.acme.com/' },
        },
      }),
    );
    await expect(
      new FirecrawlService(config).readPage(
        'https://acme.com/',
        new Set(['https://acme.com/']),
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' });
  });

  it.each([
    new Response('secret response', { status: 401 }),
    new Response('x'.repeat(MAX_RESPONSE_BYTES + 1)),
    Response.json({ unexpected: true }),
  ])(
    'rejects failed, oversized or invalid responses without exposing bodies',
    async (response) => {
      fetchMock.mockResolvedValue(response);
      const pending = new TavilyService(config).searchWeb('Acme', signal());
      await expect(pending).rejects.toMatchObject({ code: 'TAVILY_FAILURE' });
      await expect(pending).rejects.not.toThrow('secret response');
    },
  );

  it('does not issue HTTP calls for an aborted research run', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new TavilyService(config).searchWeb('Acme', controller.signal),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('URL safety and output schemas', () => {
  it.each([
    'ftp://acme.com/',
    'https://user:pass@acme.com/',
    'http://localhost/',
    'http://service.internal/',
    'http://127.1/',
    'http://[::1]/',
    'http://10.0.0.1/',
    'https://acme.com:444/',
    'http://metadata.google.internal/',
  ])('rejects unsafe URL %s', (url) =>
    expect(isAllowedResearchUrl(url)).toBe(false),
  );
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.100.100.200',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('rejects non-public DNS address %s', (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
  it('keeps LLM JSON schema free of unsupported URL/date formats', () => {
    expect(
      JSON.stringify(z.toJSONSchema(llmCompanyReportSchema)),
    ).not.toContain('"format"');
    expect(
      companyReportContentSchema.safeParse({
        ...reportFixture,
        website: 'not a URL',
      }).success,
    ).toBe(false);
  });
  it('replaces invented titles using discovered evidence and rejects duplicate URLs', () => {
    const discovered = new Map([
      [
        'https://acme.com/',
        {
          title: 'Verified title',
          url: 'https://acme.com/',
          content: 'Evidence',
        },
      ],
    ]);
    expect(
      validateReportEvidence(reportDraftFixture, discovered).sources[0].title,
    ).toBe('Verified title');
    expect(() =>
      validateReportEvidence(
        {
          ...reportDraftFixture,
          sources: [
            ...reportDraftFixture.sources,
            ...reportDraftFixture.sources,
          ],
        },
        discovered,
      ),
    ).toThrow('duplicate source');
  });
});

describe('OpenAI strict structured-output schemas', () => {
  function verifyRequiredProperties(node: unknown, path = '$'): void {
    if (Array.isArray(node)) {
      node.forEach((value, index) =>
        verifyRequiredProperties(value, `${path}[${index}]`),
      );
      return;
    }
    if (!node || typeof node !== 'object') return;
    const schema = node as Record<string, unknown>;
    if (schema.type === 'object' || schema.properties) {
      const properties = z
        .record(z.string(), z.unknown())
        .parse(schema.properties ?? {});
      const required = z.array(z.string()).parse(schema.required);
      expect({ path, required: [...required].sort() }).toEqual({
        path,
        required: Object.keys(properties).sort(),
      });
      expect(schema.additionalProperties).toBe(false);
    }
    expect(schema).not.toHaveProperty('default');
    for (const [key, value] of Object.entries(schema)) {
      if (key === 'properties' || key === '$defs' || key === 'definitions') {
        for (const [name, child] of Object.entries(
          value as Record<string, unknown>,
        ))
          verifyRequiredProperties(child, `${path}.${key}.${name}`);
      } else {
        verifyRequiredProperties(value, `${path}.${key}`);
      }
    }
  }

  it.each([
    ['full synthesis', llmCompanyReportSchema],
    ['company-only synthesis', llmCompanyOnlySchema],
    ['roles-only synthesis', llmRolesOnlySchema],
    ['location assessment', locationFactsSchema],
    ['location assessment with address variants', locationAssessmentSchema],
    ['job matching assessment', llmJobMatchSchema],
    ['follow-up research planner', followUpPlanSchema],
  ] as const)(
    '%s requires every object property in the SDK JSON Schema',
    async (_name, schema) => {
      verifyRequiredProperties(await asSchema<unknown>(schema).jsonSchema);
    },
  );
});
