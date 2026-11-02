import { MockLanguageModelV3 } from 'ai/test';
import {
  LOCATION_LIMITS,
  assessLocation,
  cleanAddressSearchVariants,
  investigateLocation,
  locationAssessmentEvidence,
  locationPresentation,
  planLocationQueries,
  unknownLocationFacts,
  validateLocationFacts,
} from './location-intelligence';
import type { LocationFacts } from './location-intelligence';
import type { ResearchSource } from './tavily.service';
import { COMPANY_SYNTHESIS_PROMPT } from './company-intelligence.prompt';
import { validateReportEvidence } from './company-report.schema';
import { reportDraftFixture } from '../../test/company-report.fixture';

const officeUrl = 'https://company.example.com/about';
const towerUrl = 'https://property.example.com/towers/a';
const designUrl = 'https://architecture.example.com/project';
const source = (url: string, content = 'Office evidence'): ResearchSource => ({
  url,
  title: 'Source',
  content,
});
function fact(value: string, url = officeUrl): LocationFacts['city'] {
  return {
    value,
    status: 'VERIFIED',
    sourceUrls: [url],
    rationale: 'המקור מתאר את הפרט במפורש.',
    credibility: 'high',
    conflicting: false,
    officeScope: 'israel',
  };
}
function initialFacts(): LocationFacts {
  return {
    ...unknownLocationFacts(),
    city: fact('הרצליה'),
    address: fact('הדוגמה 8, הרצליה'),
    building: fact('Example Tower'),
    workModel: {
      ...fact('היברידי, מספר הימים לא אומת.'),
      officeScope: 'israel',
    },
  };
}
function setup(initial = initialFacts()) {
  const discovered = new Map([[officeUrl, source(officeUrl)]]);
  const pages = new Map<string, string>();
  const search = jest.fn().mockResolvedValue(undefined);
  const readPage = jest.fn().mockResolvedValue(undefined);
  const assess = jest
    .fn()
    .mockImplementation(() => Promise.resolve(structuredClone(initial)));
  const onAssessmentFailure = jest.fn();
  const onRejectedEvidence = jest.fn();
  const input = {
    companyName: 'ExampleCo',
    mode: 'QUICK' as const,
    signal: new AbortController().signal,
    researchDeadline: Date.now() + 90000,
    discovered,
    pages,
    search,
    readPage,
    assess,
    onAssessmentFailure,
    onRejectedEvidence,
  };
  return {
    input,
    discovered,
    pages,
    search,
    readPage,
    assess,
    onRejectedEvidence,
  };
}

describe('Bounded location intelligence', () => {
  it('uses the known address to investigate a missing building rather than stopping at unknown', async () => {
    const facts = initialFacts();
    facts.building = unknownLocationFacts().building;
    const context = setup(facts);
    const result = await investigateLocation(context.input);
    expect((context.search.mock.calls as unknown[][])[0][0]).toContain(
      'הדוגמה 8',
    );
    expect(result.queries[0].target).toBe('building');
    expect(result.searchCalls).toBeGreaterThan(0);
  });

  it('targets the company floor when a building is known, and generates both English and Hebrew variants', async () => {
    const context = setup();
    const result = await investigateLocation(context.input);
    expect(result.queries[0].target).toBe('companyFloors');
    expect(result.queries[0].query).toContain('Example Tower');
    expect(result.queries[0].query).toContain('floor');
    expect(result.queries.some((item) => /קומות|קומה/.test(item.query))).toBe(
      true,
    );
    const variants = planLocationQueries(
      'AnotherCo',
      initialFacts(),
      'companyFloors',
    );
    expect(variants[0]).toContain('AnotherCo');
    expect(variants[1]).toContain('קומה');
  });

  it('correlates a company address, a separate property source and a third-party office design source', async () => {
    const context = setup();
    context.search.mockImplementation(() => {
      context.discovered.set(
        towerUrl,
        source(towerUrl, 'Example Tower at the same address has 12 floors'),
      );
      context.discovered.set(
        designUrl,
        source(
          designUrl,
          'ExampleCo office design on floors 7–9, Example Tower',
        ),
      );
      return Promise.resolve(undefined);
    });
    const enriched = {
      ...initialFacts(),
      building: {
        ...fact('Example Tower'),
        status: 'INFERRED' as const,
        sourceUrls: [officeUrl, towerUrl],
      },
      buildingFloors: { ...fact('12', towerUrl), value: 12 },
      companyFloors: fact('7–9', designUrl),
    };
    context.assess
      .mockResolvedValueOnce(initialFacts())
      .mockResolvedValue(enriched);
    const result = await investigateLocation(context.input);
    expect(result.facts.buildingFloors.value).toBe(12);
    expect(result.facts.companyFloors).toMatchObject({
      value: '7–9',
      status: 'VERIFIED',
      credibility: 'high',
      sourceUrls: [designUrl],
    });
    expect(result.facts.building.sourceUrls).toEqual([officeUrl, towerUrl]);
    expect(context.readPage).toHaveBeenCalled();
    expect(locationPresentation(result)).toMatchObject({
      buildingFloors: 12,
      companyFloors: '7–9',
      floor: '7–9',
    });
    expect(locationPresentation(result).verificationNote).toContain('הערכה');
  });

  it.each(['QUICK', 'DEEP'] as const)(
    'stops within %s search/read limits and returns unknown floors safely',
    async (mode) => {
      const context = setup();
      const result = await investigateLocation({ ...context.input, mode });
      expect(result.searchCalls).toBeLessThanOrEqual(
        LOCATION_LIMITS[mode].searches + LOCATION_LIMITS[mode].followUpSearches,
      );
      expect(result.readCalls).toBeLessThanOrEqual(LOCATION_LIMITS[mode].reads);
      expect(context.assess.mock.calls.length).toBeLessThanOrEqual(
        result.searchCalls + 1,
      );
      expect(locationPresentation(result).companyFloors).toBeNull();
      expect(locationPresentation(result).verificationNote).toBe(
        'אימתתי את הכתובת ואת שם הבניין, אבל לא מצאתי מקור אמין למספר הקומות בבניין ולקומות שבהן החברה יושבת.',
      );
    },
  );

  it('uses bounded office follow-up searches when a new address/building anchor is discovered', async () => {
    const context = setup();
    let searchIndex = 0;
    context.search.mockImplementation(() => {
      const url = `https://property.example.com/result-${searchIndex++}`;
      context.discovered.set(url, source(url));
      return Promise.resolve(undefined);
    });
    const enriched = initialFacts();
    enriched.building = fact('New Tower');
    context.assess
      .mockResolvedValueOnce(initialFacts())
      .mockResolvedValue(enriched);
    const result = await investigateLocation(context.input);
    expect(result.searchCalls).toBe(
      LOCATION_LIMITS.QUICK.searches + LOCATION_LIMITS.QUICK.followUpSearches,
    );
    expect(
      result.queries
        .slice(LOCATION_LIMITS.QUICK.searches)
        .every((item) =>
          ['building', 'buildingFloors', 'companyFloors'].includes(item.target),
        ),
    ).toBe(true);
    expect(
      result.queries.some((item) => item.query.includes('New Tower')),
    ).toBe(true);
  });

  it('stops immediately when evidence is sufficient, without mandatory quota consumption', async () => {
    const facts = {
      ...initialFacts(),
      companyFloors: fact('7–9'),
      buildingFloors: { ...fact('12'), value: 12 },
    };
    const context = setup(facts);
    const result = await investigateLocation(context.input);
    expect(result.stopReason).toBe('complete');
    expect(context.search).not.toHaveBeenCalled();
  });

  it('does not use a global work model as Israeli evidence', () => {
    const facts = initialFacts();
    facts.workModel = { ...fact('Remote worldwide'), officeScope: 'global' };
    facts.city = { ...fact('New York'), officeScope: 'global' };
    const validated = validateLocationFacts(
      facts,
      new Map([[officeUrl, source(officeUrl)]]),
    );
    expect(validated.workModel.value).toBeNull();
    expect(validated.city.value).toBeNull();
    expect(validated.workModel.status).toBe('UNKNOWN');
    facts.workModel = {
      ...fact('בישראל: 3 ימים במשרד'),
      officeScope: 'israel',
    };
    expect(
      validateLocationFacts(facts, new Map([[officeUrl, source(officeUrl)]]))
        .workModel.value,
    ).toContain('בישראל');
  });

  it('rejects invented evidence URLs, drops impossible floor counts and keeps conflicts unknown', () => {
    const discovered = new Map([[officeUrl, source(officeUrl)]]);
    const facts = initialFacts();
    facts.buildingFloors = { ...fact('12'), value: -12 };
    facts.companyFloors = { ...fact('7–9'), conflicting: true };
    expect(validateLocationFacts(facts, discovered)).toMatchObject({
      buildingFloors: { value: null },
      companyFloors: { value: null, status: 'UNKNOWN' },
    });
    facts.buildingFloors = { ...fact('12'), value: 12 };
    facts.companyFloors = fact('15');
    expect(
      validateLocationFacts(facts, discovered).companyFloors,
    ).toMatchObject({ value: null, conflicting: true });
    facts.companyFloors = fact('7–9', 'https://invented.example/');
    expect(
      validateLocationFacts(facts, discovered).companyFloors,
    ).toMatchObject({ value: null, status: 'UNKNOWN', sourceUrls: [] });
  });

  it('reserves time for synthesis and describes an incomplete investigation honestly', async () => {
    const context = setup();
    const result = await investigateLocation({
      ...context.input,
      researchDeadline: Date.now() + 1000,
    });
    expect(result.stopReason).toBe('time-reserved');
    expect(context.search).not.toHaveBeenCalled();
    expect(locationPresentation(result).verificationNote).toContain(
      'לא הושלמה',
    );
  });

  it('stops between targeted operations when its reserved time is consumed', async () => {
    jest.useFakeTimers();
    try {
      const context = setup();
      context.search.mockImplementation(() => {
        jest.setSystemTime(Date.now() + LOCATION_LIMITS.QUICK.phaseMs + 1);
        return Promise.resolve(undefined);
      });
      const result = await investigateLocation(context.input);
      expect(result.stopReason).toBe('time-reserved');
      expect(result.searchCalls).toBe(1);
      expect(context.readPage).not.toHaveBeenCalled();
      expect(context.assess).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the last grounded state when an optional assessment fails and records the limitation', async () => {
    const context = setup();
    context.assess
      .mockResolvedValueOnce(initialFacts())
      .mockRejectedValue(new Error('private provider body'));
    const result = await investigateLocation(context.input);
    expect(result.facts.address.value).toBe('הדוגמה 8, הרצליה');
    expect(result.assessmentFailures).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('private provider body');
  });

  it('preserves contradictory and partial third-party floor observations in the note instead of failing or silently choosing', async () => {
    const context = setup();
    context.discovered.set(
      towerUrl,
      source(towerUrl, 'The building has four floors'),
    );
    context.discovered.set(
      designUrl,
      source(designUrl, 'The company office design project spans five floors'),
    );
    const facts = initialFacts();
    facts.buildingFloors = { ...fact('4', towerUrl), value: 4 };
    facts.companyFloors = {
      ...fact('5', designUrl),
      value: null,
      status: 'UNKNOWN',
      conflicting: true,
      sourceUrls: [towerUrl, designUrl],
      rationale:
        'פרויקט המשרדים תואר כפרוס על 5 קומות, אך הבניין תואר כבן 4 קומות; התפוסה הנוכחית לא הוכרעה.',
    };
    context.assess.mockResolvedValue(facts);
    const result = await investigateLocation(context.input);
    expect(result.facts.companyFloors.value).toBeNull();
    expect(result.facts.companyFloors.sourceUrls).toEqual([
      towerUrl,
      designUrl,
    ]);
    const note = locationPresentation(result).verificationNote;
    expect(note).toContain('מצאתי מידע סותר לגבי הקומות של החברה');
    expect(result.facts.companyFloors.rationale).toContain('5 קומות');
    expect(result.facts.companyFloors.rationale).toContain('4 קומות');
    expect(result.searchCalls).toBeLessThanOrEqual(
      LOCATION_LIMITS.QUICK.searches + LOCATION_LIMITS.QUICK.followUpSearches,
    );
    facts.companyFloors.conflicting = false;
    facts.companyFloors.rationale =
      'פרויקט המשרדים משתרע על 5 קומות, אך מספרי הקומות הנוכחיים לא ידועים.';
    context.assess.mockResolvedValue(facts);
    expect(
      locationPresentation(await investigateLocation(context.input))
        .verificationNote,
    ).toContain('מידע חלקי על קומות החברה');
  });

  it('plans distinct source-specific alternatives from discovered anchors without requiring another LLM call', () => {
    const queries = planLocationQueries(
      'ExampleCo',
      initialFacts(),
      'companyFloors',
    );
    expect(queries.some((query) => /office design/.test(query))).toBe(true);
    expect(queries.some((query) => /lease/.test(query))).toBe(true);
    expect(queries.some((query) => /אדריכלים/.test(query))).toBe(true);
    expect(queries.some((query) => /ניהול פרויקט/.test(query))).toBe(true);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((query) => query.length <= 500)).toBe(true);
    expect(
      planLocationQueries('ExampleCo', initialFacts(), 'buildingFloors').some(
        (query) => query.includes('property management'),
      ),
    ).toBe(true);
  });

  it('passes the cumulative evidence and previous anchors to the real SDK structured assessor', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...initialFacts(),
                addressSearchVariants: ['8 Hadugma St, Herzliya'],
              }),
            },
          ],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 10, text: 10, reasoning: 0 },
          },
          warnings: [],
        }),
    });
    const discovered = new Map([[officeUrl, source(officeUrl)]]);
    await assessLocation(
      model,
      'ExampleCo',
      'QUICK',
      discovered,
      unknownLocationFacts(),
      new AbortController().signal,
    );
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      'third-party',
    );
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      officeUrl,
    );
    expect(
      JSON.stringify(model.doGenerateCalls[0].responseFormat),
    ).not.toContain('"format":"uri"');
  });

  it('asks for natural Hebrew and evidence-backed job-seeker flags, while allowing no red flags', () => {
    expect(COMPANY_SYNTHESIS_PROMPT).toContain('another software engineer');
    expect(COMPANY_SYNTHESIS_PROMPT).toContain('not automatically a red flag');
    expect(COMPANY_SYNTHESIS_PROMPT).toContain('redFlags=[]');
    expect(COMPANY_SYNTHESIS_PROMPT).toContain(
      'not a list of worldwide offices',
    );
  });
});

describe('Address-anchored office investigation', () => {
  const hebrewAddress = 'אריה שנקר 5';
  const englishAddress = '5 Arie Shenkar St, Herzliya';
  const buildingUrl = 'https://realestate.example.com/arie-shenkar-5';

  function addressOnlyFacts(): LocationFacts {
    return {
      ...unknownLocationFacts(),
      city: fact('הרצליה'),
      address: fact(hebrewAddress),
      workModel: { ...fact('היברידי בישראל'), officeScope: 'israel' },
    };
  }
  function discoveringSetup(initial: LocationFacts) {
    const context = setup(initial);
    let searchIndex = 0;
    context.search.mockImplementation(() => {
      const url = `https://search.example.com/result-${searchIndex++}`;
      context.discovered.set(url, source(url));
      return Promise.resolve(undefined);
    });
    return context;
  }

  it('searches the known exact address itself when the building is missing', async () => {
    const context = setup(addressOnlyFacts());
    const result = await investigateLocation(context.input);
    const buildingQueries = result.queries.filter(
      (item) => item.target === 'building',
    );
    expect(buildingQueries[0].query).toBe('אריה שנקר 5 הרצליה בניין');
    expect(
      planLocationQueries('Varonis', addressOnlyFacts(), 'building'),
    ).toEqual(
      expect.arrayContaining([
        'אריה שנקר 5 הרצליה בניין',
        'אריה שנקר 5 הרצליה מגדל משרדים',
      ]),
    );
  });

  it('searches the floor count of the building at the address even without a building name', async () => {
    const context = discoveringSetup(addressOnlyFacts());
    const result = await investigateLocation(context.input);
    const floorQueries = result.queries.filter(
      (item) => item.target === 'buildingFloors',
    );
    expect(floorQueries.length).toBeGreaterThan(0);
    expect(floorQueries[0].query).toContain(hebrewAddress);
    expect(floorQueries[0].query).toMatch(/קומות/);
  });

  it('keeps an explicitly sourced building floor count when the building name is unknown', () => {
    const discovered = new Map([
      [officeUrl, source(officeUrl)],
      [
        buildingUrl,
        source(buildingUrl, 'The building at the address has 18 floors'),
      ],
    ]);
    const facts = addressOnlyFacts();
    facts.buildingFloors = { ...fact('18', buildingUrl), value: 18 };
    const validated = validateLocationFacts(facts, discovered);
    expect(validated.building.value).toBeNull();
    expect(validated.buildingFloors.value).toBe(18);
    const presented = locationPresentation({
      facts: validated,
      queries: [],
      searchCalls: 2,
      readCalls: 0,
      assessmentFailures: 0,
      stopReason: 'no-new-evidence',
    });
    expect(presented).toMatchObject({ building: null, buildingFloors: 18 });
    expect(presented.verificationNote).toBe(
      'אימתתי את הכתובת ואת מספר הקומות בבניין, אבל לא מצאתי מקור אמין לשם הבניין ולקומות שבהן החברה יושבת.',
    );
  });

  it('uses a newly discovered building name for follow-up floor and company-floor searches', async () => {
    const context = discoveringSetup(addressOnlyFacts());
    context.input.mode = 'DEEP';
    const withBuilding = addressOnlyFacts();
    withBuilding.building = fact('Gav-Yam Building 1', buildingUrl);
    context.discovered.set(buildingUrl, source(buildingUrl));
    context.assess
      .mockResolvedValueOnce(addressOnlyFacts())
      .mockResolvedValue(withBuilding);
    const result = await investigateLocation(context.input);
    expect(
      result.queries.some(
        (item) =>
          item.target === 'buildingFloors' &&
          item.query.includes('Gav-Yam Building 1'),
      ),
    ).toBe(true);
    expect(
      result.queries.some(
        (item) =>
          item.target === 'companyFloors' &&
          item.query === 'ExampleCo Gav-Yam Building 1 floor',
      ),
    ).toBe(true);
  });

  it('generates Hebrew and English searches for an Israeli address from assessor variants', async () => {
    const context = discoveringSetup(addressOnlyFacts());
    context.assess.mockImplementation(() =>
      Promise.resolve({
        ...addressOnlyFacts(),
        addressSearchVariants: [
          englishAddress,
          'https://invented.example/',
          hebrewAddress,
        ],
      }),
    );
    const result = await investigateLocation(context.input);
    expect(result.addressSearchVariants).toEqual([englishAddress]);
    const queries = result.queries.map((item) => item.query);
    expect(queries.some((query) => query.includes(hebrewAddress))).toBe(true);
    expect(queries.some((query) => query.includes(englishAddress))).toBe(true);
    expect(
      planLocationQueries('Varonis', addressOnlyFacts(), 'buildingFloors', [
        englishAddress,
      ]),
    ).toEqual(
      expect.arrayContaining([
        'אריה שנקר 5 הרצליה קומות',
        `${englishAddress} floors`,
      ]),
    );
    expect(
      planLocationQueries('Varonis', addressOnlyFacts(), 'companyFloors', [
        englishAddress,
      ]),
    ).toEqual(
      expect.arrayContaining([
        'Varonis אריה שנקר 5 הרצליה קומה',
        `Varonis ${englishAddress} floor`,
      ]),
    );
    expect(cleanAddressSearchVariants([englishAddress, ' '], null)).toEqual([]);
  });

  it('keeps conflicting building floor counts unknown and explains it naturally without failing', async () => {
    const conflicting = addressOnlyFacts();
    conflicting.buildingFloors = {
      ...fact('16', officeUrl),
      value: 16,
      conflicting: true,
      rationale: 'מקור אחד מציין 16 קומות ומקור אחר 18 קומות.',
    };
    const context = setup(conflicting);
    const result = await investigateLocation(context.input);
    expect(result.facts.buildingFloors.value).toBeNull();
    expect(locationPresentation(result).verificationNote).toContain(
      'מצאתי מקורות סותרים לגבי מספר הקומות בבניין, ולכן לא קבעתי מספר ודאי.',
    );
  });

  it('returns null only after address-based attempts stop producing new evidence', async () => {
    const context = setup(addressOnlyFacts());
    const result = await investigateLocation(context.input);
    expect(result.stopReason).toBe('no-new-evidence');
    expect(result.searchCalls).toBe(
      LOCATION_LIMITS.QUICK.searchesWithoutProgress,
    );
    expect(result.queries[0].query).toContain(hebrewAddress);
    const presented = locationPresentation(result);
    expect(presented).toMatchObject({
      building: null,
      buildingFloors: null,
      companyFloors: null,
    });
    expect(presented.verificationNote).not.toMatch(/null|undefined/);
  });
});

describe('Location evidence integrity', () => {
  const resolvedUrl = 'https://cdn.redirect-target.com/final-page';
  const undiscoveredUrl = 'https://news.other-site.com/article?token=secret';
  const unsafeUrl = 'http://localhost/internal';

  it('sends only original discovered URLs, never resolvedUrl, to the location assessor', async () => {
    const discovered = new Map<string, ResearchSource>([
      [
        officeUrl,
        {
          ...source(officeUrl),
          resolvedUrl,
          readStatus: 'read',
          pageContent: 'Office page',
          readFailure: 'internal detail',
        },
      ],
    ]);
    expect(locationAssessmentEvidence(discovered)).toEqual([
      {
        title: 'Source',
        url: officeUrl,
        content: 'Office evidence',
        readStatus: 'read',
        pageContent: 'Office page',
      },
    ]);
    const model = new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...unknownLocationFacts(),
                addressSearchVariants: [],
              }),
            },
          ],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        }),
    });
    await assessLocation(
      model,
      'ExampleCo',
      'QUICK',
      discovered,
      unknownLocationFacts(),
      new AbortController().signal,
    );
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain(officeUrl);
    expect(prompt).not.toContain(resolvedUrl);
    expect(prompt).not.toContain('resolvedUrl');
    expect(prompt).not.toContain('internal detail');
  });

  it('drops an undiscovered location citation without failing the investigation', async () => {
    const facts = initialFacts();
    facts.companyFloors = fact('7–9', undiscoveredUrl);
    const context = setup(facts);
    const result = await investigateLocation(context.input);
    expect(result.facts.companyFloors).toMatchObject({
      value: null,
      status: 'UNKNOWN',
      sourceUrls: [],
    });
    expect(result.facts.address.value).toBe('הדוגמה 8, הרצליה');
    expect(context.onRejectedEvidence).toHaveBeenCalledWith({
      field: 'companyFloors',
      url: 'https://news.other-site.com/article',
      reason: 'undiscovered',
    });
  });

  it('drops an unsafe location citation without failing the investigation', async () => {
    const facts = initialFacts();
    facts.buildingFloors = { ...fact('12', unsafeUrl), value: 12 };
    const context = setup(facts);
    const result = await investigateLocation(context.input);
    expect(result.facts.buildingFloors.value).toBeNull();
    expect(context.onRejectedEvidence).toHaveBeenCalledWith({
      field: 'buildingFloors',
      url: 'http://localhost/internal',
      reason: 'unsafe',
    });
  });

  it('keeps valid citations when they are mixed with invalid ones', () => {
    const discovered = new Map([
      [officeUrl, source(officeUrl)],
      [towerUrl, source(towerUrl)],
    ]);
    const facts = initialFacts();
    facts.building = {
      ...fact('Example Tower'),
      sourceUrls: [officeUrl, undiscoveredUrl, towerUrl, unsafeUrl, officeUrl],
    };
    const rejected = jest.fn();
    const validated = validateLocationFacts(facts, discovered, rejected);
    expect(validated.building).toMatchObject({
      value: 'Example Tower',
      status: 'VERIFIED',
      sourceUrls: [officeUrl, towerUrl],
    });
    expect(rejected).toHaveBeenCalledTimes(2);
  });

  it('turns a fact with only invalid citations into an unknown, non-conflicting fact', () => {
    const discovered = new Map([[officeUrl, source(officeUrl)]]);
    const facts = initialFacts();
    facts.buildingFloors = {
      ...fact('16', undiscoveredUrl),
      value: 16,
      conflicting: true,
      sourceUrls: [undiscoveredUrl, unsafeUrl],
    };
    expect(validateLocationFacts(facts, discovered).buildingFloors).toEqual({
      value: null,
      status: 'UNKNOWN',
      sourceUrls: [],
      rationale: null,
      credibility: 'high',
      conflicting: false,
      officeScope: 'israel',
    });
  });

  it('does not let a later unsupported citation overwrite a previously validated fact', async () => {
    const context = setup();
    const hallucinated = initialFacts();
    hallucinated.building = {
      ...fact('Invented Tower', undiscoveredUrl),
      conflicting: true,
    };
    context.assess
      .mockResolvedValueOnce(initialFacts())
      .mockResolvedValue(hallucinated);
    const result = await investigateLocation(context.input);
    expect(result.facts.building).toMatchObject({
      value: 'Example Tower',
      status: 'VERIFIED',
      sourceUrls: [officeUrl],
      conflicting: false,
    });
    expect(context.onRejectedEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'building', reason: 'undiscovered' }),
    );
  });

  it('still accepts an exact discovered URL as location evidence', () => {
    const discovered = new Map([[towerUrl, source(towerUrl, '12 floors')]]);
    const facts = initialFacts();
    facts.buildingFloors = { ...fact('12', towerUrl), value: 12 };
    const rejected = jest.fn();
    const validated = validateLocationFacts(facts, discovered, rejected);
    expect(validated.buildingFloors).toMatchObject({
      value: 12,
      status: 'VERIFIED',
      sourceUrls: [towerUrl],
    });
    expect(rejected).not.toHaveBeenCalledWith(
      expect.objectContaining({ field: 'buildingFloors' }),
    );
  });

  it('keeps main company-report source validation strict', () => {
    const discovered = new Map([
      ['https://acme.com/', source('https://acme.com/')],
    ]);
    expect(() =>
      validateReportEvidence(
        {
          ...reportDraftFixture,
          sources: [
            {
              title: 'Invented',
              url: 'https://news.other-site.com/article',
              sourceType: 'news',
            },
          ],
        },
        discovered,
      ),
    ).toThrow('Report contains an undiscovered source');
  });
});
