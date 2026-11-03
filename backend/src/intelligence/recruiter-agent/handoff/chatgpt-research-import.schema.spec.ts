import {
  chatGptResearchImportSchema,
  parseChatGptResearchImport,
} from './chatgpt-research-import.schema';

describe('chatGptResearchImportSchema', () => {
  it('strips harmless extra ChatGPT fields instead of rejecting the import', () => {
    const parsed = chatGptResearchImportSchema.parse({
      companyName: 'WalkMe',
      leadershipSummary: 'extra top-level field',
      location: {
        city: 'Tel Aviv',
        country: 'Israel',
      },
      employees: {
        global: { count: 1100, approximate: true, source: 'LinkedIn' },
      },
      sources: [
        {
          title: 'WalkMe',
          url: 'https://www.walkme.com/',
          sourceType: 'official-site',
          extra: 'ignored',
        },
      ],
    });

    expect(parsed.companyName).toBe('WalkMe');
    expect(parsed.location.city).toBe('Tel Aviv');
    expect(parsed.sources[0].sourceType).toBe('other');
    expect(parsed).not.toHaveProperty('leadershipSummary');
    expect(parsed.location).not.toHaveProperty('country');
  });

  it('downgrades uncited findings to UNKNOWN instead of rejecting the import', () => {
    const parsed = parseChatGptResearchImport(
      JSON.stringify({
        companyName: 'WalkMe',
        interviewInsights: {
          summary: 'Interview notes',
          stages: [
            {
              statement: 'Technical interview',
              status: 'DIRECT_REPORT',
              sourceUrls: [],
              reportedAt: null,
              context: null,
            },
          ],
          reportedTopics: [],
          candidateExperiences: [],
          limitations: [],
        },
        sources: [],
      }),
    );

    expect(parsed.interviewInsights?.stages[0].status).toBe('UNKNOWN');
    expect(parsed.interviewInsights?.stages[0].sourceUrls).toEqual([]);
    expect(parsed.interviewInsights?.limitations).toContain(
      'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
    );
  });

  it('drops finding URLs that are missing from sources and preserves supported citations', () => {
    const parsed = parseChatGptResearchImport(
      JSON.stringify({
        companyName: 'WalkMe',
        workplaceSignals: {
          summary: null,
          positiveSignals: [
            {
              statement: 'Supported signal',
              status: 'FACT',
              sourceUrls: [
                'https://www.walkme.com/',
                'https://example.com/not-in-sources',
              ],
              reportedAt: null,
              context: null,
            },
          ],
          negativeSignals: [],
          mixedSignals: [],
          limitations: [],
        },
        sources: [
          {
            title: 'WalkMe',
            url: 'https://www.walkme.com/',
            sourceType: 'company-site',
          },
        ],
      }),
    );

    expect(parsed.workplaceSignals?.positiveSignals[0]).toMatchObject({
      status: 'FACT',
      sourceUrls: ['https://www.walkme.com/'],
    });
  });

  it('adds a limitation independently to interview and workplace sections', () => {
    const parsed = parseChatGptResearchImport(
      JSON.stringify({
        companyName: 'WalkMe',
        interviewInsights: {
          summary: null,
          stages: [
            {
              statement: 'Interview signal',
              status: 'FACT',
              sourceUrls: [],
              reportedAt: null,
              context: null,
            },
          ],
          reportedTopics: [],
          candidateExperiences: [],
          limitations: [],
        },
        workplaceSignals: {
          summary: null,
          positiveSignals: [
            {
              statement: 'Workplace signal',
              status: 'DIRECT_REPORT',
              sourceUrls: [],
              reportedAt: null,
              context: null,
            },
          ],
          negativeSignals: [],
          mixedSignals: [],
          limitations: [],
        },
        sources: [],
      }),
    );

    expect(parsed.interviewInsights?.limitations).toContain(
      'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
    );
    expect(parsed.workplaceSignals?.limitations).toContain(
      'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
    );
    expect(parsed.interviewInsights?.stages[0].status).toBe('UNKNOWN');
    expect(parsed.workplaceSignals?.positiveSignals[0].status).toBe('UNKNOWN');
  });

  it('still rejects invalid supported fields', () => {
    expect(() =>
      parseChatGptResearchImport(
        JSON.stringify({
          companyName: 'WalkMe',
          employees: {
            global: { count: -1, approximate: true },
          },
        }),
      ),
    ).toThrow();
  });
});
