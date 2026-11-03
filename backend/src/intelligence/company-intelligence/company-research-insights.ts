import { z } from 'zod';
import { isAllowedResearchUrl } from './research-url';
import type { ResearchSource } from './tavily.service';

export const researchInsightSchema = z.strictObject({
  statement: z.string(),
  status: z.enum(['FACT', 'DIRECT_REPORT', 'INFERENCE', 'UNKNOWN']),
  sourceUrls: z.array(z.string()),
  reportedAt: z.string().nullable(),
  context: z.string().nullable(),
});
export const interviewInsightsSchema = z.strictObject({
  summary: z.string().nullable(),
  stages: z.array(researchInsightSchema),
  reportedTopics: z.array(researchInsightSchema),
  candidateExperiences: z.array(researchInsightSchema),
  limitations: z.array(z.string()),
});
export const workplaceSignalsSchema = z.strictObject({
  summary: z.string().nullable(),
  positiveSignals: z.array(researchInsightSchema),
  negativeSignals: z.array(researchInsightSchema),
  mixedSignals: z.array(researchInsightSchema),
  limitations: z.array(z.string()),
});

type ResearchInsight = z.infer<typeof researchInsightSchema>;
type InterviewInsights = z.infer<typeof interviewInsightsSchema>;
type WorkplaceSignals = z.infer<typeof workplaceSignalsSchema>;

const INSIGHT_LIMITS = {
  textCharacters: 700,
  citations: 2,
  findings: 4,
  limitations: 8,
};

function text(value: string | null): string | null {
  if (!value || /https?:\/\//i.test(value)) return null;
  return value.trim().slice(0, INSIGHT_LIMITS.textCharacters) || null;
}

function findings(
  items: ResearchInsight[],
  evidence: ReadonlyMap<string, ResearchSource>,
): ResearchInsight[] {
  const grounded: ResearchInsight[] = [];
  for (const item of items) {
    const statement = text(item.statement);
    const sourceUrls = [...new Set(item.sourceUrls)]
      .filter((url) => {
        const source = evidence.get(url);
        return (
          isAllowedResearchUrl(url) &&
          source &&
          (source.content.trim() || source.pageContent?.trim())
        );
      })
      .slice(0, INSIGHT_LIMITS.citations);
    if (!statement || item.status === 'UNKNOWN' || !sourceUrls.length) continue;
    const hasReadNonReviewSource = sourceUrls.some(
      (url) =>
        evidence.get(url)?.readStatus === 'read' &&
        !/(?:glassdoor|reddit|linkedin|facebook|indeed)\./i.test(
          new URL(url).hostname,
        ),
    );
    grounded.push({
      ...item,
      statement,
      sourceUrls,
      status:
        item.status === 'FACT' && !hasReadNonReviewSource
          ? 'DIRECT_REPORT'
          : item.status,
      reportedAt: text(item.reportedAt),
      context: text(item.context),
    });
    if (grounded.length === INSIGHT_LIMITS.findings) break;
  }
  return grounded;
}

export function groundedResearchInsights(
  interview: InterviewInsights | null,
  workplace: WorkplaceSignals | null,
  evidence: ReadonlyMap<string, ResearchSource>,
): {
  interviewInsights: InterviewInsights;
  workplaceSignals: WorkplaceSignals;
} {
  const stages = findings(interview?.stages ?? [], evidence);
  const reportedTopics = findings(interview?.reportedTopics ?? [], evidence);
  const candidateExperiences = findings(
    interview?.candidateExperiences ?? [],
    evidence,
  );
  const positiveSignals = findings(workplace?.positiveSignals ?? [], evidence);
  const negativeSignals = findings(workplace?.negativeSignals ?? [], evidence);
  const mixedSignals = findings(workplace?.mixedSignals ?? [], evidence);
  const limitations = (items: string[]) =>
    items
      .map(text)
      .filter((item): item is string => Boolean(item))
      .slice(0, INSIGHT_LIMITS.limitations);
  const interviewKnown =
    stages.length + reportedTopics.length + candidateExperiences.length > 0;
  const workplaceKnown =
    positiveSignals.length + negativeSignals.length + mixedSignals.length > 0;
  const glassdoorReadable = [...evidence.values()].some(
    (source) =>
      isAllowedResearchUrl(source.url) &&
      /(?:^|\.)glassdoor\./i.test(new URL(source.url).hostname) &&
      source.readStatus === 'read' &&
      source.pageContent?.trim(),
  );
  return {
    interviewInsights: {
      summary: interviewKnown ? text(interview?.summary ?? null) : null,
      stages,
      reportedTopics,
      candidateExperiences,
      limitations: [
        ...new Set([
          ...limitations(interview?.limitations ?? []),
          ...(!interviewKnown
            ? [
                'לא נמצאו דיווחי ראיונות מבוססים במסגרת התקציב; תהליך הגיוס הנוכחי בישראל אינו ידוע.',
              ]
            : []),
          ...(!glassdoorReadable
            ? [
                'לא נקראו עמודי Glassdoor במחקר זה; תקצירי חיפוש, אם קיימים, הם מידע חלקי בלבד.',
              ]
            : []),
        ]),
      ],
    },
    workplaceSignals: {
      summary: workplaceKnown ? text(workplace?.summary ?? null) : null,
      positiveSignals,
      negativeSignals,
      mixedSignals,
      limitations: [
        ...new Set([
          ...limitations(workplace?.limitations ?? []),
          ...(!workplaceKnown
            ? [
                'לא נמצאו ביקורות או דיונים ציבוריים מבוססים מספיק להערכת סביבת העבודה.',
              ]
            : []),
          ...(!glassdoorReadable
            ? ['לא נקראו עמודי Glassdoor; אין בכך ראיה לאיכות סביבת העבודה.']
            : []),
        ]),
      ],
    },
  };
}
