import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { isAllowedResearchUrl } from '../company-intelligence/research-url';

export const JOB_MATCH_LIMITS = {
  searches: 6,
  pageReads: 10,
  careersPageReads: 2,
  pageReadConcurrency: 3,
  timeoutMs: 110000,
  matchingReserveMs: 40000,
  matchingTokens: 7000,
  candidatesForMatching: 12,
  returnedJobs: 10,
  snippetCharacters: 1200,
  pageCharacters: 6000,
  linksPerCareersPage: 60,
} as const;

export type TitleClassification = 'engineering' | 'excluded' | 'unknown';
export type CandidateReadStatus = 'not-read' | 'read' | 'failed';

export interface JobCandidate {
  url: string;
  title: string;
  snippet: string;
  pageContent: string | null;
  readStatus: CandidateReadStatus;
}

const ATS_HOSTS = [
  'greenhouse.io',
  'lever.co',
  'comeet.com',
  'comeet.co',
  'myworkdayjobs.com',
  'ashbyhq.com',
  'smartrecruiters.com',
  'workable.com',
];
const CAREERS_LISTING_SEGMENTS = new Set([
  'careers',
  'career',
  'jobs',
  'job',
  'positions',
  'open-positions',
  'openings',
  'join-us',
  'vacancies',
]);
const JOB_PATH_PATTERN =
  /\/(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|job-?openings?)\//i;
const ATS_NAME_PATTERN =
  /^(?:greenhouse|lever|comeet|workday|ashby|smartrecruiters|workable|linkedin|careers?|jobs?)$/i;
const JOB_TITLE_PREFIX_PATTERN = /^(?:job application for|apply for|join)\s+/i;

const EXCLUDED_ROLE_PATTERN =
  /\b(?:sales|account (?:executive|manager)|business development|bdr|sdr|marketing|hr|human resources|people (?:partner|operations)|recruit(?:er|ing|ment)|talent acquisition|finance|financial|accountant|accounting|controller|payroll|legal|counsel|paralegal|customer success|customer support|support (?:engineer|specialist)|technical support|product manager|product owner|designer|ux|office manager|administrative|procurement|qa|quality assurance|test automation|automation (?:engineer|developer)|sdet|tester)\b|מכירות|שיווק|משאבי אנוש|כספים|הנהלת חשבונות|תמיכה|בודק/i;
const FRONTEND_PATTERN =
  /front[- ]?end|\bui (?:developer|engineer)\b|react developer|web developer/i;
const BACKEND_CAPABLE_PATTERN = /back[- ]?end|full[- ]?stack|platform|server/i;
const ENGINEERING_PATTERN =
  /engineer|developer|architect|back[- ]?end|platform|infrastructure|devops|\bsre\b|software|full[- ]?stack|cloud|\bdata\b|java|node|team lead|tech lead|r&d|programmer|מפתח|מהנדס/i;
const BACKEND_TITLE_PATTERN = /back[- ]?end|server[- ]side/i;
const PLATFORM_TITLE_PATTERN =
  /platform|infrastructure|distributed|cloud|data platform|scale/i;
const SENIOR_TITLE_PATTERN = /senior|staff|principal|lead|sr\.?\b/i;
const ISRAEL_PATTERN =
  /israel|herzliya|tel[- ]?aviv|ra'?anana|petah|petach|haifa|jerusalem|be'?er[- ]?sheva|ramat[- ]gan|hod hasharon|kfar saba|yokneam|rehovot|netanya|or yehuda|airport city|ישראל|תל אביב|הרצליה|רעננה|פתח תקווה|חיפה|ירושלים/i;
const FOREIGN_PATTERN =
  /united states|\busa?\b|new york|boston|san francisco|bay area|london|united kingdom|\buk\b|germany|berlin|india|bangalore|bengaluru|toronto|canada|austin|seattle|chicago|paris|singapore|australia|remote[- ](?:us|usa|uk|emea)/i;

const RELEVANCE_POINTS = {
  engineering: 3,
  backendTitle: 3,
  platformTitle: 2,
  seniorTitle: 1,
  preferredRoleTitle: 3,
  profileTechnologyInTitle: 1,
  maxProfileTechnologyInTitle: 2,
  israel: 4,
  preferredLocation: 2,
  foreignOnly: -4,
} as const;

const DEFAULT_SEARCH_LOCATION = 'Israel';
const DEFAULT_PRIMARY_ROLE = 'backend engineer';
const DEFAULT_SECONDARY_ROLE = 'platform infrastructure engineer';

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function isAtsHost(host: string): boolean {
  return ATS_HOSTS.some(
    (atsHost) => host === atsHost || host.endsWith(`.${atsHost}`),
  );
}

function pathSegments(url: string): string[] {
  return new URL(url).pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function preferredSearchLocation(profile: CandidateProfile): string {
  const locations = profile.workPreferences?.locations ?? [];
  const israeliLocation = locations.find((location) =>
    ISRAEL_PATTERN.test(location),
  );
  return israeliLocation ?? DEFAULT_SEARCH_LOCATION;
}

export function buildDiscoveryQueries(
  companyName: string,
  profile: CandidateProfile,
): string[] {
  const company = companyName.trim().slice(0, 150);
  const location = preferredSearchLocation(profile);
  const primaryRole = profile.preferredRoles[0] ?? DEFAULT_PRIMARY_ROLE;
  const secondaryRole = profile.preferredRoles[1] ?? DEFAULT_SECONDARY_ROLE;
  const queries = [
    `${company} careers Israel`,
    `${company} ${primaryRole} ${location}`,
    `${company} backend software engineer jobs Israel`,
    `${company} jobs Greenhouse Lever Comeet Workday Ashby SmartRecruiters`,
    `${company} ${secondaryRole} Israel`,
  ];
  return [...new Set(queries.map((query) => query.replace(/\s+/g, ' ')))];
}

export function buildRefinementQuery(
  companyName: string,
  careersHost: string | null,
  profile: CandidateProfile,
): string {
  const company = companyName.trim().slice(0, 150);
  const role = profile.preferredRoles[0] ?? DEFAULT_PRIMARY_ROLE;
  if (careersHost) return `site:${careersHost} ${role} Israel`;
  return `${company} software engineer Israel open positions`;
}

export function isCareersListingUrl(url: string): boolean {
  if (!isAllowedResearchUrl(url)) return false;
  const host = hostOf(url);
  const segments = pathSegments(url);
  const lastSegment = segments[segments.length - 1] ?? '';
  if (isAtsHost(host)) return segments.length <= 2 && !isJobPostingUrl(url);
  return CAREERS_LISTING_SEGMENTS.has(lastSegment);
}

export function isJobPostingUrl(url: string): boolean {
  if (!isAllowedResearchUrl(url)) return false;
  const parsed = new URL(url);
  const host = hostOf(url);
  const segments = pathSegments(url);
  if (parsed.searchParams.has('gh_jid')) return true;
  if (host.endsWith('greenhouse.io'))
    return segments.includes('jobs') && segments.length >= 3;
  if (host === 'jobs.lever.co' || host === 'jobs.ashbyhq.com')
    return segments.length >= 2;
  if (host.endsWith('comeet.com') || host.endsWith('comeet.co'))
    return segments[0] === 'jobs' && segments.length >= 4;
  if (host.endsWith('myworkdayjobs.com')) return segments.includes('job');
  if (host.endsWith('smartrecruiters.com')) return segments.length >= 2;
  if (host.endsWith('linkedin.com'))
    return segments[0] === 'jobs' && segments[1] === 'view';
  const lastSegment = segments[segments.length - 1] ?? '';
  return (
    JOB_PATH_PATTERN.test(parsed.pathname) &&
    !CAREERS_LISTING_SEGMENTS.has(lastSegment) &&
    lastSegment.length > 3
  );
}

export function careersHostOf(url: string): string | null {
  if (!isCareersListingUrl(url) && !isJobPostingUrl(url)) return null;
  return hostOf(url);
}

export function normalizeJobUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  for (const parameter of [...parsed.searchParams.keys()]) {
    if (/^utm_|^ref$|^source$/i.test(parameter))
      parsed.searchParams.delete(parameter);
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.hostname.toLowerCase().replace(/^www\./, '')}${path}${parsed.search}`;
}

export function cleanJobTitle(rawTitle: string, companyName: string): string {
  const company = companyName.trim().toLowerCase();
  const parts = rawTitle
    .replace(JOB_TITLE_PREFIX_PATTERN, '')
    .split(/\s+[|–—-]\s+|\s+at\s+/i)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        part.toLowerCase() !== company &&
        !ATS_NAME_PATTERN.test(part),
    );
  const roleLikePart = parts.find((part) => ENGINEERING_PATTERN.test(part));
  return (roleLikePart ?? parts[0] ?? rawTitle).slice(0, 300).trim();
}

export function classifyJobTitle(title: string): TitleClassification {
  if (EXCLUDED_ROLE_PATTERN.test(title)) return 'excluded';
  if (FRONTEND_PATTERN.test(title) && !BACKEND_CAPABLE_PATTERN.test(title))
    return 'excluded';
  if (ENGINEERING_PATTERN.test(title)) return 'engineering';
  return 'unknown';
}

function profileTechnologies(profile: CandidateProfile): string[] {
  return [...profile.programmingLanguages, ...profile.frameworks]
    .map((technology) => technology.trim().toLowerCase())
    .filter((technology) => technology.length >= 2);
}

function matchesPreferredRole(title: string, profile: CandidateProfile) {
  const normalizedTitle = title.toLowerCase();
  return profile.preferredRoles.some((role) =>
    normalizedTitle.includes(role.trim().toLowerCase()),
  );
}

function matchesPreferredLocation(text: string, profile: CandidateProfile) {
  const lowerText = text.toLowerCase();
  return (profile.workPreferences?.locations ?? []).some(
    (location) =>
      location.trim().length >= 3 &&
      lowerText.includes(location.trim().toLowerCase()),
  );
}

export function jobRelevance(
  candidate: JobCandidate,
  profile: CandidateProfile,
): number {
  const classification = classifyJobTitle(candidate.title);
  if (classification === 'excluded') return 0;
  const title = candidate.title;
  const locationText = `${title} ${candidate.snippet} ${candidate.url}`;
  let relevance =
    classification === 'engineering' ? RELEVANCE_POINTS.engineering : 0;
  if (BACKEND_TITLE_PATTERN.test(title))
    relevance += RELEVANCE_POINTS.backendTitle;
  if (PLATFORM_TITLE_PATTERN.test(title))
    relevance += RELEVANCE_POINTS.platformTitle;
  if (SENIOR_TITLE_PATTERN.test(title))
    relevance += RELEVANCE_POINTS.seniorTitle;
  if (matchesPreferredRole(title, profile))
    relevance += RELEVANCE_POINTS.preferredRoleTitle;
  const lowerTitle = title.toLowerCase();
  const technologyMatches = profileTechnologies(profile).filter((technology) =>
    lowerTitle.includes(technology),
  ).length;
  relevance +=
    Math.min(technologyMatches, RELEVANCE_POINTS.maxProfileTechnologyInTitle) *
    RELEVANCE_POINTS.profileTechnologyInTitle;
  const mentionsIsrael = ISRAEL_PATTERN.test(locationText);
  if (mentionsIsrael) relevance += RELEVANCE_POINTS.israel;
  if (matchesPreferredLocation(locationText, profile))
    relevance += RELEVANCE_POINTS.preferredLocation;
  if (!mentionsIsrael && FOREIGN_PATTERN.test(locationText))
    relevance += RELEVANCE_POINTS.foreignOnly;
  return relevance;
}

function compareByRelevance(
  first: { candidate: JobCandidate; relevance: number },
  second: { candidate: JobCandidate; relevance: number },
): number {
  if (second.relevance !== first.relevance)
    return second.relevance - first.relevance;
  return first.candidate.url.localeCompare(second.candidate.url);
}

export function rankCandidates(
  candidates: readonly JobCandidate[],
  profile: CandidateProfile,
): JobCandidate[] {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      relevance: jobRelevance(candidate, profile),
    }))
    .filter((entry) => entry.relevance > 0);
  ranked.sort(compareByRelevance);
  return ranked.map((entry) => entry.candidate);
}

export function selectCandidatesForReading(
  candidates: readonly JobCandidate[],
  profile: CandidateProfile,
  count: number,
): JobCandidate[] {
  return rankCandidates(
    candidates.filter((candidate) => candidate.readStatus === 'not-read'),
    profile,
  ).slice(0, count);
}

export function selectCandidatesForMatching(
  candidates: readonly JobCandidate[],
  profile: CandidateProfile,
  count: number,
): JobCandidate[] {
  const ranked = rankCandidates(candidates, profile);
  const read = ranked.filter((candidate) => candidate.readStatus === 'read');
  const notRead = ranked.filter((candidate) => candidate.readStatus !== 'read');
  return [...read, ...notRead].slice(0, count);
}

export class JobCandidateCollection {
  private readonly candidatesByKey = new Map<string, JobCandidate>();
  private readonly discoveredUrls = new Set<string>();

  constructor(private readonly companyName: string) {}

  add(rawTitle: string, url: string, snippet: string): boolean {
    if (!isJobPostingUrl(url)) return false;
    const key = normalizeJobUrl(url);
    const existing = this.candidatesByKey.get(key);
    if (existing) {
      if (snippet && !existing.snippet.includes(snippet))
        existing.snippet = `${existing.snippet}\n${snippet}`
          .trim()
          .slice(0, JOB_MATCH_LIMITS.snippetCharacters);
      return false;
    }
    this.discoveredUrls.add(url);
    this.candidatesByKey.set(key, {
      url,
      title: cleanJobTitle(rawTitle, this.companyName),
      snippet: snippet.slice(0, JOB_MATCH_LIMITS.snippetCharacters),
      pageContent: null,
      readStatus: 'not-read',
    });
    return true;
  }

  markDiscovered(url: string): void {
    this.discoveredUrls.add(url);
  }

  isDiscovered(url: string): boolean {
    return this.discoveredUrls.has(url);
  }

  discovered(): ReadonlySet<string> {
    return this.discoveredUrls;
  }

  all(): JobCandidate[] {
    return [...this.candidatesByKey.values()];
  }

  size(): number {
    return this.candidatesByKey.size;
  }
}

export function extractJobLinks(
  markdown: string,
  pageUrl: string,
): Array<{ title: string; url: string }> {
  const pageHost = hostOf(pageUrl);
  const links: Array<{ title: string; url: string }> = [];
  const linkPattern = /\[([^\]\n]{2,200})\]\((https?:\/\/[^)\s]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const title = match[1].replace(/[*_`#]/g, '').trim();
    const url = match[2];
    if (!isJobPostingUrl(url)) continue;
    const linkHost = hostOf(url);
    if (linkHost !== pageHost && !isAtsHost(linkHost)) continue;
    links.push({ title, url });
    if (links.length >= JOB_MATCH_LIMITS.linksPerCareersPage) break;
  }
  return links;
}
