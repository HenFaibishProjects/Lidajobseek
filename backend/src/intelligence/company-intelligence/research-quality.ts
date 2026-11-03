import { locationEvidenceLevel } from './location-intelligence';
import type { LocationIntelligence } from './location-intelligence';
import type { ResearchScope } from './research-cache';
import type { ResearchSource } from './tavily.service';
import type {
  ResearchQuality,
  RoleValidatedReportContent,
} from './company-report.schema';

export function isResearchLimitation(value: string): boolean {
  const missingTopic =
    /מודל (?:ה)?עבודה|מדיניות (?:ה)?עבודה|קומות?|בניין|בנין|קמפוס|טכנולוגי|פרטי.{0,6}Backend|Backend stack|backend technologies|work model|office floors?|building name|campus/i;
  const unknownDetail =
    /לא ידוע|אינ[והםן]+ (?:ידוע|ברור|זמי[נן])|לא ברור|לא פורס|לא זמי[נן]|טרם אומת|unknown|unclear|unavailable|not disclosed|not published/i;
  if (missingTopic.test(value) && unknownDetail.test(value)) return true;
  return /(?:חסר|חסרים|אין|ללא)\s+(?:לנו\s+)?מידע|לא\s+(?:נמצא|נמצאו|מצאתי|מצאנו|אומת|אומתו|אימתתי|הצלחתי לאמת|הצלחנו לאמת)|(?:מידע|נתונים|פרטים)\s+(?:חסר|חסרים|מוגבל|חלקי|לא זמין)|(?:lack of|missing|no|insufficient|unverified|unknown)\s+(?:information|data|evidence|office|building|floors?|work model|backend roles?)|(?:not found|not verified)/i.test(
    value,
  );
}

export function candidateFlags(flags: readonly string[]): string[] {
  return flags.filter((flag) => !isResearchLimitation(flag));
}

export function usefulGreenFlags(flags: readonly string[]): string[] {
  return candidateFlags(flags).filter((flag) => {
    const onlyGlobalScale =
      /עובדים|employees/i.test(flag) &&
      /בעולם|עולמי|global|worldwide/i.test(flag) &&
      !/ישראל|R&D|פיתוח|Backend|Cloud|הנדס|מערכות|scale|engineering/i.test(
        flag,
      );
    const candidateBenefit =
      /Backend|Cloud|R&D|פיתוח|הנדס|מבוזר|ענן|נתונים|היבריד|גמיש|רווחי|יציב|צמיחה|distributed|engineering|scale|stability|profitable/i;
    const marketingOnly =
      /חדשנ|מתקדמ|מוביל|פורצ.{0,3}דרך|innovative|advanced|leading|cutting.edge/i.test(
        flag,
      ) && !candidateBenefit.test(flag);
    return !onlyGlobalScale && !marketingOnly;
  });
}

export function buildResearchQuality(
  report: RoleValidatedReportContent,
  discovered: ReadonlyMap<string, ResearchSource>,
  pages: ReadonlyMap<string, string>,
  runLimitations: ReadonlySet<string>,
  scope: ResearchScope = 'full',
  office?: LocationIntelligence,
): ResearchQuality {
  const limitations = new Set(runLimitations);
  for (const flag of [
    ...report.redFlags,
    ...report.greenFlags,
    ...report.quickBrief.redFlags,
    ...report.quickBrief.greenFlags,
  ]) {
    if (isResearchLimitation(flag)) limitations.add(flag);
  }
  if (scope !== 'roles') {
    if (report.quickBrief.employees && !report.quickBrief.employees.israel)
      limitations.add('לא נמצא אומדן מבוסס למספר העובדים בישראל.');
    if (!report.workModelSummary)
      limitations.add('לא הצלחתי לאמת את מודל העבודה בישראל.');
    if (report.location.address && !report.location.building)
      limitations.add('לא נמצא מקור אמין לשם בניין המשרדים.');
    if (report.location.address && !report.location.companyFloors)
      limitations.add('לא נמצא מידע אמין על קומות המשרד.');
  }
  if (scope !== 'roles' && !report.website)
    limitations.add('לא זוהה אתר חברה רשמי באופן חד-משמעי.');
  if (!pages.size)
    limitations.add('לא נקראו עמודים; הדוח מבוסס על תוצאות חיפוש בלבד.');
  if (report.sources.some((source) => !pages.has(source.url)))
    limitations.add('חלק מהמידע המצוטט מבוסס על תוצאות חיפוש בלבד.');
  for (const [field, limitation] of [
    ['businessModel', 'המודל העסקי לא אומת.'],
    ['companySizeSummary', 'גודל החברה לא אומת.'],
    ['officeLocationSummary', 'מיקום המשרדים לא אומת.'],
    ['workModelSummary', 'מודל העבודה לא אומת.'],
    ['engineeringSummary', 'המידע על ארגון הפיתוח מוגבל.'],
    ['technologySummary', 'המידע על הטכנולוגיות מוגבל.'],
    ['stabilitySummary', 'המידע על יציבות החברה מוגבל.'],
    ['employeeSentimentSummary', 'המידע על חוויית העובדים מוגבל.'],
  ] as const) {
    if (scope !== 'roles' && !report[field]) limitations.add(limitation);
  }
  if (
    report.relevantRoles.some((role) => role.evidenceLevel === 'search-snippet')
  )
    limitations.add('חלק מפרטי המשרות מבוסס על תוצאות חיפוש בלבד.');
  return {
    ...(office ? { officeEvidenceLevel: locationEvidenceLevel(office) } : {}),
    evidenceLevel: !pages.size
      ? 'limited'
      : pages.size >= 2 && !limitations.size
        ? 'strong'
        : 'partial',
    sourcesDiscovered: discovered.size,
    pagesRead: pages.size,
    limitations: [...limitations],
  };
}
