const THIRD_PARTY_DOMAINS = [
  'linkedin.com',
  'wikipedia.org',
  'wikimedia.org',
  'yahoo.com',
  'builtin.com',
  'glassdoor.com',
  'glassdoor.co.il',
  'crunchbase.com',
  'leadiq.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tiktok.com',
  'reddit.com',
  'medium.com',
  'indeed.com',
  'indeed.co.il',
  'wellfound.com',
  'ziprecruiter.com',
  'monster.com',
  'dice.com',
  'jobgether.com',
  'levels.fyi',
  'comparably.com',
  'ambitionbox.com',
  'pitchbook.com',
  'owler.com',
  'rocketreach.co',
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'marketwatch.com',
  'seekingalpha.com',
  'businesswire.com',
  'globenewswire.com',
  'prnewswire.com',
  'techcrunch.com',
  'calcalist.co.il',
  'globes.co.il',
  'themarker.com',
  'geektime.co.il',
  'lever.co',
  'greenhouse.io',
  'greenhouse.com',
  'comeet.com',
  'comeet.co',
  'workable.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'ashbyhq.com',
];

export function classifyCompanySource<T extends string>(
  url: string,
  sourceType: T,
): T | 'other' {
  if (sourceType !== 'company-site') return sourceType;
  const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  if (
    THIRD_PARTY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  )
    return 'other';
  return sourceType;
}
