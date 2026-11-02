import { MockLanguageModelV3 } from 'ai/test';
import {
  FOLLOW_UP_LIMITS,
  investigateFollowUps,
  planFollowUpLeads,
  publicSignalQueries,
  selectFollowUpPage,
  validateFollowUpLeads,
} from './research-follow-up';
import type { FollowUpLead } from './research-follow-up';
import type { ResearchSource } from './tavily.service';

const linkedInUrl = 'https://www.linkedin.com/posts/acme-cto_post-1';
const meetupUrl = 'https://www.meetup.com/tlv-backend/events/1';
const blogUrl = 'https://engineering.acme.com/kafka-at-scale';

function lead(query: string, overrides: Partial<FollowUpLead> = {}) {
  return {
    kind: 'technology' as const,
    anchor: 'Kafka',
    query,
    reason: 'Kafka הוזכר בהרצאה',
    ...overrides,
  };
}

function setup(plan: unknown = { leads: [lead('Acme Kafka platform team')] }) {
  const discovered = new Map<string, ResearchSource>();
  const pages = new Map<string, string>();
  const resultsByQuery: Array<[RegExp, ResearchSource]> = [
    [
      /meetup/,
      {
        url: meetupUrl,
        title: 'Backend meetup at Acme',
        content: 'Acme office floor 12',
      },
    ],
    [
      /LinkedIn/,
      { url: linkedInUrl, title: 'CTO post', content: 'Impact from day one' },
    ],
    [
      /Kafka/,
      { url: blogUrl, title: 'Kafka at scale', content: 'Engineering blog' },
    ],
  ];
  const search = jest.fn((query: string) => {
    for (const [pattern, result] of resultsByQuery)
      if (pattern.test(query)) discovered.set(result.url, result);
    return Promise.resolve(undefined);
  });
  const readPage = jest.fn((url: string) => {
    pages.set(url, 'page');
    return Promise.resolve(undefined);
  });
  const planLeads = jest.fn().mockResolvedValue(plan);
  const onPlannerFailure = jest.fn();
  const input = {
    companyName: 'Acme',
    signal: new AbortController().signal,
    deadline: Date.now() + FOLLOW_UP_LIMITS.phaseMs,
    discovered,
    pages,
    previousQueries: ['Acme careers Israel'],
    search,
    readPage,
    planLeads,
    onPlannerFailure,
  };
  return { input, discovered, search, readPage, planLeads, onPlannerFailure };
}

describe('Iterative follow-up research', () => {
  it('runs public-signal searches, then follows the planned lead, within budget', async () => {
    const context = setup();
    const result = await investigateFollowUps(context.input);
    expect(result.queries).toEqual([
      ...publicSignalQueries('Acme'),
      'Acme Kafka platform team',
    ]);
    expect(result.searchCalls).toBeLessThanOrEqual(
      FOLLOW_UP_LIMITS.publicSignalSearches + FOLLOW_UP_LIMITS.leadSearches,
    );
    expect(result.readCalls).toBeLessThanOrEqual(FOLLOW_UP_LIMITS.reads);
    expect(context.planLeads).toHaveBeenCalledWith(
      expect.arrayContaining(['Acme careers Israel']),
      expect.any(AbortSignal),
    );
    expect(context.readPage).toHaveBeenCalledWith(
      meetupUrl,
      expect.any(AbortSignal),
    );
    expect(context.readPage).toHaveBeenCalledWith(
      blogUrl,
      expect.any(AbortSignal),
    );
  });

  it('uses login-walled social posts only through search snippets and never reads them', async () => {
    const context = setup({ leads: [] });
    await investigateFollowUps(context.input);
    expect(context.discovered.has(linkedInUrl)).toBe(true);
    expect(context.readPage).not.toHaveBeenCalledWith(
      linkedInUrl,
      expect.anything(),
    );
    expect(
      selectFollowUpPage(context.discovered, new Map(), new Set([linkedInUrl])),
    ).toBeNull();
  });

  it('continues without leads when the planner fails, and never fails the research', async () => {
    const context = setup();
    context.planLeads.mockRejectedValue(new Error('provider body'));
    const result = await investigateFollowUps(context.input);
    expect(result.plannerFailed).toBe(true);
    expect(context.onPlannerFailure).toHaveBeenCalledWith('llm-failure');
    expect(result.queries).toEqual(publicSignalQueries('Acme'));
    const invalid = setup({ leads: 'not a list' });
    expect((await investigateFollowUps(invalid.input)).plannerFailed).toBe(
      true,
    );
    expect(invalid.onPlannerFailure).toHaveBeenCalledWith('output-invalid');
  });

  it('stops at its reserved deadline', async () => {
    const context = setup();
    const result = await investigateFollowUps({
      ...context.input,
      deadline: Date.now() - 1,
    });
    expect(result.stopReason).toBe('time-reserved');
    expect(context.search).not.toHaveBeenCalled();
  });

  it('propagates an overall research abort', async () => {
    const context = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      investigateFollowUps({ ...context.input, signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('validates planned leads: no URLs, no repeats, company-anchored and bounded', () => {
    const leads = validateFollowUpLeads(
      {
        leads: [
          lead('Kafka platform team Israel'),
          lead('Acme careers Israel'),
          lead('https://acme.com/jobs'),
          lead('Acme office event', { anchor: 'https://acme.com' }),
          lead('ab'),
          lead('Acme VP R&D posts hiring', { kind: 'leadership' }),
          lead('Acme Herzliya office opening', { kind: 'office' }),
          lead('Acme hiring push Tel Aviv', { kind: 'hiring' }),
        ],
      },
      'Acme',
      ['Acme careers Israel'],
    );
    expect(leads.map((item) => item.query)).toEqual([
      'Acme Kafka platform team Israel',
      'Acme VP R&D posts hiring',
      'Acme Herzliya office opening',
    ]);
  });

  it('asks the planner with discovered evidence only, without URLs', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify({ leads: [] }) }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        }),
    });
    const discovered = new Map([
      [
        meetupUrl,
        {
          url: meetupUrl,
          title: 'Backend meetup',
          content: 'Kafka talk at Acme office',
        },
      ],
    ]);
    await planFollowUpLeads(
      model,
      'Acme',
      discovered,
      ['Acme careers Israel'],
      new AbortController().signal,
    );
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain('Kafka talk at Acme office');
    expect(prompt).toContain('Acme careers Israel');
    expect(prompt).not.toContain(meetupUrl);
  });
});
