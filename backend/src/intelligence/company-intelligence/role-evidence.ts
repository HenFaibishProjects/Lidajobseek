import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import type {
  CompanyReportContent,
  RoleValidatedReportContent,
} from './company-report.schema';
import type { ResearchSource } from './tavily.service';
import { ResearchError } from './research-error';

function normalizeEvidence(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isUsableTitle(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 300 &&
    !/https?:\/\//i.test(value) &&
    !/^(jobs?|careers?|vacancies|open positions?|job openings?|apply now|page not found|access denied|just a moment)[.!…]*$/i.test(
      value,
    )
  );
}

export function validateRelevantRoles(
  report: CompanyReportContent,
  discovered: ReadonlyMap<string, ResearchSource>,
  pages: ReadonlyMap<string, string>,
  profile: CandidateProfile,
  requestedRole: string | undefined,
  maxRoles: number,
): RoleValidatedReportContent {
  const verifiedSkills = new Set(
    [
      ...profile.programmingLanguages,
      ...profile.frameworks,
      ...profile.databases,
      ...profile.cloud,
      ...profile.infrastructure,
      ...profile.distributedSystems,
      ...profile.messagingAndData,
      ...profile.strengths,
    ].map(normalizeEvidence),
  );
  const seenUrls = new Set<string>();
  const relevantRoles: RoleValidatedReportContent['relevantRoles'] = [];
  for (const { omittedFacts, ...role } of report.relevantRoles) {
    const source = discovered.get(role.url);
     if (
  !source ||
  !report.sources.some(
    (citation) =>
      citation.url === role.url && citation.sourceType === 'job-posting',
  )
) {
  continue;
}
    if (
      profile.status !== 'configured' &&
      (role.matchScore !== null ||
        role.matchedSkills.length ||
        role.gaps.length)
    ) {
      throw new ResearchError(
        'STRUCTURED_OUTPUT_INVALID',
        'Candidate matching requires a configured profile',
      );
    }
    if (
      role.matchedSkills.some(
        (skill) => !verifiedSkills.has(normalizeEvidence(skill)),
      )
    ) {
      throw new ResearchError(
        'STRUCTURED_OUTPUT_INVALID',
        'Matched skills must come from the configured candidate profile',
      );
    }
    const sourceTitle = source.title.trim();
    const hasDetails = Boolean(
      source.content.trim() || pages.get(role.url)?.trim(),
    );
    const title = isUsableTitle(sourceTitle)
      ? sourceTitle
      : hasDetails && isUsableTitle(role.title)
        ? role.title
        : '';
    if (!title) continue;
    const location = hasDetails ? role.location : null;
    const workModel = hasDetails ? role.workModel : null;
    const requirements = hasDetails ? [...new Set(role.requirements)] : [];
    if (seenUrls.has(role.url)) continue;
    seenUrls.add(role.url);
    const pageRead = pages.has(role.url);
    let evidenceSummary = pageRead
      ? 'עמוד המשרה נקרא במחקר הנוכחי. ההתאמה למועמד היא הערכת מודל, ולא עובדה מאומתת.'
      : 'המידע מבוסס על תקציר חיפוש בלבד; עמוד המשרה לא נקרא. זמינות המשרה ופרטיה דורשים אימות, והערכת ההתאמה ראשונית.';
    if (!hasDetails)
      evidenceSummary +=
        ' פרטים נוספים הושמטו כי הייתה זמינה רק כותרת מתוצאת חיפוש.';
    else evidenceSummary += ' הפרטים הם פרשנות המודל לראיות, ולא אימות עצמאי.';
    if (omittedFacts?.length)
      evidenceSummary += ` פרטים שלא אומתו הושמטו: ${omittedFacts.map((field) => ({ title: 'כותרת', location: 'מיקום', 'work model': 'מודל עבודה', requirements: 'דרישות' })[field] ?? 'פרט נוסף').join(', ')}.`;
    relevantRoles.push({
      ...role,
      title,
      location,
      workModel,
      requirements,
      ...(profile.status !== 'configured'
        ? {
            matchSummary:
              'פרופיל המועמד אינו מוגדר; הרלוונטיות מבוססת רק על התפקיד שהתבקש.',
          }
        : {}),
      evidenceLevel: pageRead ? 'page-read' : 'search-snippet',
      evidenceSummary,
    });
  }
  if (profile.status !== 'configured' && !requestedRole) {
    return {
      ...report,
      relevantRoles: [],
      roleDiscoverySummary:
        'פרופיל המועמד אינו מוגדר ולא צוין תפקיד מבוקש. לא הוערכה התאמה אישית; רשימה ריקה אינה מעידה שאין משרות בחברה.',
    };
  }
  return { ...report, relevantRoles: relevantRoles.slice(0, maxRoles) };
}
