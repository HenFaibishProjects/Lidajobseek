import {
  buildDiscoveryQueries,
  classifyJobTitle,
  extractJobLinks,
  isCareersListingUrl,
  isJobPostingUrl,
  JobCandidateCollection,
  rankCandidates,
  selectCandidatesForReading,
} from './job-discovery';
import type { JobCandidate } from './job-discovery';
import { configuredProfileFixture } from '../../test/candidate-profile.fixture';

function candidate(title: string, url: string, snippet = ''): JobCandidate {
  return { title, url, snippet, pageContent: null, readStatus: 'not-read' };
}

describe('Job discovery', () => {
  it('filters clearly irrelevant non-engineering roles early, but keeps backend-heavy Full Stack', () => {
    for (const title of [
      'Enterprise Account Executive',
      'Product Marketing Manager',
      'HR Business Partner',
      'Senior Financial Analyst',
      'Customer Success Manager',
      'Product Manager',
      'Senior Frontend Engineer',
      'QA Automation Engineer',
    ])
      expect(classifyJobTitle(title)).toBe('excluded');
    expect(classifyJobTitle('Senior Backend Engineer')).toBe('engineering');
    expect(classifyJobTitle('Full Stack Engineer (Backend heavy)')).toBe(
      'engineering',
    );
    expect(classifyJobTitle('Frontend / Backend Platform Engineer')).toBe(
      'engineering',
    );
    const ranked = rankCandidates(
      [
        candidate('Account Executive', 'https://jobs.lever.co/acme/sales-1'),
        candidate('Backend Engineer', 'https://jobs.lever.co/acme/backend-1'),
      ],
      configuredProfileFixture,
    );
    expect(ranked.map((job) => job.title)).toEqual(['Backend Engineer']);
  });

  it('prioritizes Israeli roles over foreign-only roles', () => {
    const ranked = rankCandidates(
      [
        candidate(
          'Senior Backend Engineer',
          'https://jobs.lever.co/acme/us-1',
          'New York, United States',
        ),
        candidate(
          'Senior Backend Engineer',
          'https://jobs.lever.co/acme/il-1',
          'Herzliya, Israel · Hybrid',
        ),
      ],
      configuredProfileFixture,
    );
    expect(ranked[0].url).toBe('https://jobs.lever.co/acme/il-1');
    const selected = selectCandidatesForReading(
      [
        candidate(
          'Platform Engineer',
          'https://acme.com/careers/platform-us',
          'London',
        ),
        candidate(
          'Platform Engineer',
          'https://acme.com/careers/platform-il',
          'Tel Aviv',
        ),
      ],
      configuredProfileFixture,
      1,
    );
    expect(selected[0].url).toBe('https://acme.com/careers/platform-il');
    expect(buildDiscoveryQueries('Acme', configuredProfileFixture)).toEqual(
      expect.arrayContaining([
        'Acme careers Israel',
        'Acme Senior Backend Engineer Herzliya',
      ]),
    );
  });

  it('deduplicates the same job discovered through different URLs and merges snippets', () => {
    const collection = new JobCandidateCollection('Acme');
    expect(
      collection.add(
        'Senior Backend Engineer - Acme',
        'https://jobs.lever.co/acme/abc-123?utm_source=linkedin',
        'Herzliya',
      ),
    ).toBe(true);
    expect(
      collection.add(
        'Senior Backend Engineer | Acme',
        'https://jobs.lever.co/acme/abc-123/',
        'Hybrid, 3 days',
      ),
    ).toBe(false);
    expect(collection.size()).toBe(1);
    expect(collection.all()[0]).toMatchObject({
      title: 'Senior Backend Engineer',
      url: 'https://jobs.lever.co/acme/abc-123?utm_source=linkedin',
    });
    expect(collection.all()[0].snippet).toContain('Hybrid, 3 days');
  });

  it('recognizes ATS postings, careers listings and job links inside a careers page', () => {
    expect(
      isJobPostingUrl('https://boards.greenhouse.io/acme/jobs/123456'),
    ).toBe(true);
    expect(
      isJobPostingUrl(
        'https://www.comeet.com/jobs/acme/12.345/backend-engineer/AB.123',
      ),
    ).toBe(true);
    expect(isJobPostingUrl('https://acme.com/careers')).toBe(false);
    expect(isCareersListingUrl('https://acme.com/careers')).toBe(true);
    expect(isCareersListingUrl('https://boards.greenhouse.io/acme')).toBe(true);
    const links = extractJobLinks(
      '[Senior Backend Engineer](https://boards.greenhouse.io/acme/jobs/1) [Blog](https://acme.com/blog/post) [Other](https://unrelated.com/jobs/abc-role)',
      'https://acme.com/careers',
    );
    expect(links).toEqual([
      {
        title: 'Senior Backend Engineer',
        url: 'https://boards.greenhouse.io/acme/jobs/1',
      },
    ]);
  });
});
