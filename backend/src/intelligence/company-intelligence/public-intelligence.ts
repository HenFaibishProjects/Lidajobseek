import { isAllowedResearchUrl } from './research-url';
import type { ResearchSource } from './tavily.service';
import type { OverallAssessment, PublicSignal } from './company-report.schema';

export const PUBLIC_INTELLIGENCE_LIMITS = {
  signals: 4,
  findings: 5,
  sourceUrlsPerItem: 3,
  titleCharacters: 120,
  textCharacters: 600,
  summaryCharacters: 700,
  redSignalMinimumSources: 2,
} as const;

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 } as const;
const URL_PATTERN = /https?:\/\//i;
const SOCIAL_HOST_PATTERN =
  /(?:^|\.)(?:linkedin\.com|facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|threads\.net|youtube\.com|tiktok\.com|medium\.com)$/i;
const EVENT_HOST_PATTERN =
  /(?:^|\.)(?:meetup\.com|eventbrite\.com|eventbrite\.co\.il|lu\.ma|sessionize\.com|papercall\.io|tickettailor\.com)$/i;
const EVENT_PATH_PATTERN =
  /\/(?:events?|meetups?|conferences?|webinars?|talks?)(?:\/|$)/i;

export type PublicSourceType = 'social' | 'event' | 'other';

export function classifyPublicSource(url: string): PublicSourceType {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (SOCIAL_HOST_PATTERN.test(host)) return 'social';
  if (EVENT_HOST_PATTERN.test(host) || EVENT_PATH_PATTERN.test(parsed.pathname))
    return 'event';
  return 'other';
}

function cleanText(value: string | null, maxCharacters: number) {
  if (value === null) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || URL_PATTERN.test(text)) return null;
  return text.slice(0, maxCharacters);
}

function discoveredCitations(
  urls: readonly string[],
  discovered: ReadonlyMap<string, ResearchSource>,
): string[] {
  const citations: string[] = [];
  for (const url of new Set(urls)) {
    if (!isAllowedResearchUrl(url) || !discovered.has(url)) continue;
    const source = discovered.get(url)!;
    if (!source.content.trim() && !source.pageContent?.trim()) continue;
    citations.push(url);
    if (citations.length === PUBLIC_INTELLIGENCE_LIMITS.sourceUrlsPerItem)
      break;
  }
  return citations;
}

function boundedSignalType(
  signal: PublicSignal,
  sourceUrls: readonly string[],
): PublicSignal['signalType'] {
  if (signal.signalType !== 'red') return signal.signalType;
  const strongRedSignal =
    signal.confidence === 'high' &&
    signal.corroborated &&
    sourceUrls.length >= PUBLIC_INTELLIGENCE_LIMITS.redSignalMinimumSources;
  return strongRedSignal ? 'red' : 'yellow';
}

export function validatePublicSignals(
  signals: readonly PublicSignal[],
  discovered: ReadonlyMap<string, ResearchSource>,
): PublicSignal[] {
  const validated: PublicSignal[] = [];
  for (const signal of signals) {
    const title = cleanText(
      signal.title,
      PUBLIC_INTELLIGENCE_LIMITS.titleCharacters,
    );
    const observation = cleanText(
      signal.observation,
      PUBLIC_INTELLIGENCE_LIMITS.textCharacters,
    );
    const interpretation = cleanText(
      signal.interpretation,
      PUBLIC_INTELLIGENCE_LIMITS.textCharacters,
    );
    const sourceUrls = discoveredCitations(signal.sourceUrls, discovered);
    if (!title || !observation || !interpretation || !sourceUrls.length)
      continue;
    const corroborated = signal.corroborated && sourceUrls.length > 1;
    validated.push({
      ...signal,
      title,
      observation,
      interpretation,
      candidateImplication: cleanText(
        signal.candidateImplication,
        PUBLIC_INTELLIGENCE_LIMITS.textCharacters,
      ),
      confidence:
        signal.confidence === 'high' && !corroborated
          ? 'medium'
          : signal.confidence,
      corroborated,
      signalType: boundedSignalType({ ...signal, corroborated }, sourceUrls),
      sourceUrls,
    });
  }
  validated.sort(
    (first, second) =>
      CONFIDENCE_ORDER[first.confidence] - CONFIDENCE_ORDER[second.confidence],
  );
  return validated.slice(0, PUBLIC_INTELLIGENCE_LIMITS.signals);
}

export function validateOverallAssessment(
  assessment: OverallAssessment | null,
  discovered: ReadonlyMap<string, ResearchSource>,
): OverallAssessment | null {
  if (assessment === null) return null;
  const findings: OverallAssessment['findings'] = [];
  for (const finding of assessment.findings) {
    const statement = cleanText(
      finding.statement,
      PUBLIC_INTELLIGENCE_LIMITS.textCharacters,
    );
    const sourceUrls = discoveredCitations(finding.sourceUrls, discovered);
    if (!statement || !sourceUrls.length) continue;
    findings.push({ ...finding, statement, sourceUrls });
    if (findings.length === PUBLIC_INTELLIGENCE_LIMITS.findings) break;
  }
  const summary = cleanText(
    assessment.summary,
    PUBLIC_INTELLIGENCE_LIMITS.summaryCharacters,
  );
  if (!summary && !findings.length) return null;
  return { summary, findings };
}
