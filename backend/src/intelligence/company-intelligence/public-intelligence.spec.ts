import {
  classifyPublicSource,
  validateOverallAssessment,
  validatePublicSignals,
} from './public-intelligence';
import { validateReportEvidence } from './company-report.schema';
import type { PublicSignal } from './company-report.schema';
import type { ResearchSource } from './tavily.service';
import { reportDraftFixture } from '../../test/company-report.fixture';

const companyUrl = 'https://acme.com/';
const postUrl = 'https://www.linkedin.com/posts/acme-ceo_hiring-1';
const secondPostUrl = 'https://www.linkedin.com/posts/acme-cto_impact-2';
const meetupUrl = 'https://www.meetup.com/tlv-backend/events/123';
const inventedUrl = 'https://news.invented-site.com/story';
const unsafeUrl = 'http://localhost/private';

function source(url: string, content = 'Public evidence'): ResearchSource {
  return { url, title: `Title for ${url}`, content };
}
const discovered = new Map(
  [companyUrl, postUrl, secondPostUrl, meetupUrl].map((url) => [
    url,
    source(url),
  ]),
);

function signal(overrides: Partial<PublicSignal> = {}): PublicSignal {
  return {
    title: 'רף גיוס גבוה',
    observation: 'ה-CEO כותב שוב ושוב על רף גבוה בגיוס ועל פסילה מוקדמת.',
    interpretation:
      'ייתכן שתרבות הגיוס סלקטיבית מאוד; אין ראיה לתהליך לא הוגן.',
    candidateImplication: 'כדאי להתכונן לתהליך תובעני.',
    confidence: 'medium',
    signalType: 'yellow',
    sourceKind: 'leadership',
    corroborated: false,
    sourceUrls: [postUrl],
    ...overrides,
  };
}

describe('Public signals', () => {
  it('drops undiscovered and unsafe citations, keeping signals that still have valid evidence', () => {
    const [kept] = validatePublicSignals(
      [signal({ sourceUrls: [inventedUrl, postUrl, unsafeUrl, postUrl] })],
      discovered,
    );
    expect(kept.sourceUrls).toEqual([postUrl]);
    expect(
      validatePublicSignals(
        [signal({ sourceUrls: [inventedUrl, unsafeUrl] })],
        discovered,
      ),
    ).toEqual([]);
  });

  it('never promotes weak social evidence to a red flag', () => {
    const [weakRed] = validatePublicSignals(
      [signal({ signalType: 'red', confidence: 'low' })],
      discovered,
    );
    expect(weakRed.signalType).toBe('yellow');
    const [uncorroboratedRed] = validatePublicSignals(
      [signal({ signalType: 'red', confidence: 'high', corroborated: true })],
      discovered,
    );
    expect(uncorroboratedRed).toMatchObject({
      signalType: 'yellow',
      corroborated: false,
      confidence: 'medium',
    });
    const [strongRed] = validatePublicSignals(
      [
        signal({
          signalType: 'red',
          confidence: 'high',
          corroborated: true,
          sourceUrls: [postUrl, secondPostUrl],
        }),
      ],
      discovered,
    );
    expect(strongRed).toMatchObject({ signalType: 'red', confidence: 'high' });
  });

  it('keeps the strongest four insights, ordered by confidence, and drops text containing URLs', () => {
    const signals = [
      signal({ title: 'low', confidence: 'low' }),
      signal({
        title: 'high',
        confidence: 'high',
        corroborated: true,
        sourceUrls: [postUrl, meetupUrl],
      }),
      signal({ title: 'medium one' }),
      signal({ title: 'medium two' }),
      signal({ title: 'medium three' }),
      signal({ title: 'with link', observation: 'See https://acme.com/x' }),
    ];
    expect(
      validatePublicSignals(signals, discovered).map((item) => item.title),
    ).toEqual(['high', 'medium one', 'medium two', 'medium three']);
  });
});

describe('Overall assessment', () => {
  it('keeps inferred and conflicting findings with valid evidence and removes unsupported ones', () => {
    expect(
      validateOverallAssessment(
        {
          summary:
            ' גיוס פעיל ומשרד חדש עשויים להעיד על צמיחה של מרכז הפיתוח. ',
          findings: [
            {
              statement: 'החברה מגייסת מהנדסי Backend בישראל.',
              status: 'verified',
              sourceUrls: [companyUrl],
            },
            {
              statement: 'ייתכן שמרכז הפיתוח מתרחב.',
              status: 'inferred',
              sourceUrls: [postUrl, inventedUrl],
            },
            {
              statement: 'ממצא בלי ראיה',
              status: 'verified',
              sourceUrls: [inventedUrl],
            },
          ],
        },
        discovered,
      ),
    ).toEqual({
      summary: 'גיוס פעיל ומשרד חדש עשויים להעיד על צמיחה של מרכז הפיתוח.',
      findings: [
        {
          statement: 'החברה מגייסת מהנדסי Backend בישראל.',
          status: 'verified',
          sourceUrls: [companyUrl],
        },
        {
          statement: 'ייתכן שמרכז הפיתוח מתרחב.',
          status: 'inferred',
          sourceUrls: [postUrl],
        },
      ],
    });
    expect(
      validateOverallAssessment({ summary: null, findings: [] }, discovered),
    ).toBeNull();
  });
});

describe('Public source classification and report evidence', () => {
  it('classifies public social and event sources', () => {
    expect(classifyPublicSource(postUrl)).toBe('social');
    expect(classifyPublicSource('https://www.facebook.com/acme/posts/1')).toBe(
      'social',
    );
    expect(classifyPublicSource(meetupUrl)).toBe('event');
    expect(classifyPublicSource('https://acme.com/events/office-opening')).toBe(
      'event',
    );
    expect(classifyPublicSource('https://news.example.org/acme')).toBe('other');
  });

  it('adds cited public sources to the report sources without weakening main source validation', () => {
    const content = validateReportEvidence(
      {
        ...reportDraftFixture,
        publicSignals: [signal({ sourceUrls: [postUrl, inventedUrl] })],
        overallAssessment: {
          summary: null,
          findings: [
            {
              statement: 'מיטאפ במשרד',
              status: 'verified',
              sourceUrls: [meetupUrl],
            },
          ],
        },
      },
      discovered,
    );
    expect(content.publicSignals[0].sourceUrls).toEqual([postUrl]);
    expect(content.sources).toEqual([
      expect.objectContaining({ url: companyUrl, sourceType: 'company-site' }),
      expect.objectContaining({ url: postUrl, sourceType: 'social' }),
      expect.objectContaining({ url: meetupUrl, sourceType: 'event' }),
    ]);
    expect(() =>
      validateReportEvidence(
        {
          ...reportDraftFixture,
          sources: [
            { title: 'Invented', url: inventedUrl, sourceType: 'news' },
          ],
        },
        discovered,
      ),
    ).toThrow('Report contains an undiscovered source');
  });
});
