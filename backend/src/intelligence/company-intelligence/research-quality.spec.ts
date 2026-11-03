import { buildResearchQuality } from './research-quality';
import { reportFixture } from '../../test/company-report.fixture';

it('derives research completeness from collection coverage and known missing fields, not a numerical confidence score', () => {
  const sources = new Map([
    [
      'https://acme.com/',
      { title: 'Acme', url: 'https://acme.com/', content: 'Overview' },
    ],
    [
      'https://acme.com/about',
      { title: 'About', url: 'https://acme.com/about', content: 'Details' },
    ],
  ]);
  const complete = {
    ...reportFixture,
    businessModel: 'Business summary',
    companySizeSummary: 'Size summary',
    engineeringSummary: 'Engineering summary',
    technologySummary: 'Technology summary',
    stabilitySummary: 'Stability summary',
    officeLocationSummary: 'Office information',
    workModelSummary: 'Work-policy evidence',
    employeeSentimentSummary: 'Anecdotal reviews summarized cautiously',
  };
  expect(
    buildResearchQuality(
      complete,
      sources,
      new Map([...sources.keys()].map((url) => [url, 'Read content'])),
      new Set(),
    ),
  ).toEqual({
    evidenceLevel: 'strong',
    sourcesDiscovered: 2,
    pagesRead: 2,
    limitations: [],
  });
  const limited = buildResearchQuality(
    { ...reportFixture, website: null },
    sources,
    new Map(),
    new Set(['A page was unavailable.']),
  );
  expect(limited).toMatchObject({
    evidenceLevel: 'limited',
    sourcesDiscovered: 2,
    pagesRead: 0,
  });
  expect(limited.limitations.join(' ')).toContain('לא זוהה אתר חברה רשמי');
  expect(limited.limitations).toContain('A page was unavailable.');
  expect(limited).not.toHaveProperty('score');
});
