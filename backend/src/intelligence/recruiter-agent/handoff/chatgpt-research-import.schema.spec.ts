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
