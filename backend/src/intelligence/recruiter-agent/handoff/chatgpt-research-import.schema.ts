import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { isAllowedResearchUrl } from '../../company-intelligence/research-url';

export const MAX_CHATGPT_IMPORT_CHARACTERS = 60000;
export const UNKNOWN_IMPORTED_SUMMARY = 'לא ידוע (ייבוא ידני מ־ChatGPT).';
const text = z.string().trim().min(1).max(6000);
const optionalText = text.nullable().default(null);
const shortText = (length: number) =>
  z.string().trim().min(1).max(length).nullable().default(null);
const list = z.array(z.string().trim().min(1).max(1500)).max(20).default([]);
const sourceUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    isAllowedResearchUrl,
    'Expected a public HTTP(S) source URL without credentials.',
  );
const count = z.number().int().min(0).max(100000000);
const employeeCount = z
  .union([
    z.object({ count, approximate: z.boolean() }),
    z
      .object({ min: count, max: count, approximate: z.literal(true) })
      .refine((value) => value.min <= value.max, 'Invalid headcount range.'),
  ])
  .nullable()
  .default(null);
const finding = z.object({
  statement: z.string().trim().min(1).max(1500),
  status: z.enum(['FACT', 'DIRECT_REPORT', 'INFERENCE', 'UNKNOWN']),
  sourceUrls: z.array(sourceUrl).max(5).default([]),
  reportedAt: shortText(100),
  context: shortText(500),
});
const findings = z.array(finding).max(12).default([]);
export const chatGptResearchImportSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200),
    roleTitle: shortText(300),
    companySummary: optionalText,
    whatTheyDo: optionalText,
    productSummary: optionalText,
    businessModel: optionalText,
    location: z
      .object({
        city: shortText(200),
        address: shortText(500),
        building: shortText(200),
        floor: shortText(100),
        buildingFloors: z
          .number()
          .int()
          .min(1)
          .max(300)
          .nullable()
          .default(null),
        companyFloors: shortText(100),
        campus: shortText(200),
      })
      .default({
        city: null,
        address: null,
        building: null,
        floor: null,
        buildingFloors: null,
        companyFloors: null,
        campus: null,
      }),
    workModel: shortText(500),
    employees: z
      .object({
        global: employeeCount,
        israel: employeeCount,
        israelEngineering: employeeCount,
      })
      .default({ global: null, israel: null, israelEngineering: null }),
    engineeringSummary: optionalText,
    technologySummary: optionalText,
    stabilitySummary: optionalText,
    employeeSentimentSummary: optionalText,
    greenFlags: list,
    redFlags: list,
    questionsToAskRecruiter: list,
    interviewInsights: z
      .object({
        summary: optionalText,
        stages: findings,
        reportedTopics: findings,
        candidateExperiences: findings,
        limitations: list,
      })
      .nullable()
      .default(null),
    workplaceSignals: z
      .object({
        summary: optionalText,
        positiveSignals: findings,
        negativeSignals: findings,
        mixedSignals: findings,
        limitations: list,
      })
      .nullable()
      .default(null),
    sources: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(500),
          url: sourceUrl,
          sourceType: z.preprocess(
            (value) =>
              [
                'company-site',
                'news',
                'engineering',
                'employee-review',
                'job-posting',
                'social',
                'event',
                'other',
              ].includes(String(value))
                ? value
                : 'other',
            z.enum([
              'company-site',
              'news',
              'engineering',
              'employee-review',
              'job-posting',
              'social',
              'event',
              'other',
            ]),
          ),
        }),
      )
      .max(50)
      .default([]),
  });
export type ChatGptResearchImport = z.infer<typeof chatGptResearchImportSchema>;

function normalizeImportedFindingCitations(
  research: ChatGptResearchImport,
): ChatGptResearchImport {
  const knownUrls = new Set(research.sources.map((source) => source.url));
  let normalized = false;

  const normalize = (items: Array<z.infer<typeof finding>>) => {
    for (const item of items) {
      const supportedUrls = item.sourceUrls.filter((url) => knownUrls.has(url));
      if (supportedUrls.length !== item.sourceUrls.length) normalized = true;
      item.sourceUrls = supportedUrls;

      if (item.status !== 'UNKNOWN' && supportedUrls.length === 0) {
        item.status = 'UNKNOWN';
        normalized = true;
      }
    }
  };

  if (research.interviewInsights) {
    normalize(research.interviewInsights.stages);
    normalize(research.interviewInsights.reportedTopics);
    normalize(research.interviewInsights.candidateExperiences);
    if (
      normalized &&
      !research.interviewInsights.limitations.includes(
        'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
      )
    ) {
      research.interviewInsights.limitations.push(
        'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
      );
    }
  }

  const normalizedBeforeWorkplace = normalized;
  if (research.workplaceSignals) {
    normalize(research.workplaceSignals.positiveSignals);
    normalize(research.workplaceSignals.negativeSignals);
    normalize(research.workplaceSignals.mixedSignals);
    if (
      normalized !== normalizedBeforeWorkplace &&
      !research.workplaceSignals.limitations.includes(
        'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
      )
    ) {
      research.workplaceSignals.limitations.push(
        'חלק מהממצאים יובאו ללא מקור תואם ולכן סומנו כ־UNKNOWN.',
      );
    }
  }

  return research;
}



export function parseChatGptResearchImport(
  content: string,
): ChatGptResearchImport {
  if (
    content.length > MAX_CHATGPT_IMPORT_CHARACTERS ||
    Buffer.byteLength(content, 'utf8') > 90000
  )
    throw new BadRequestException(
      'Research import is too large (60,000 characters / 90 KB maximum).',
    );
  let json = content.trim();
  if (!json.startsWith('{')) {
    const markers = [
      ...json.matchAll(
        /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?APP_IMPORT_JSON(?:\*\*)?[ \t]*:?[ \t]*(?:\r?\n|(?=\{))/gm,
      ),
    ];
    const marker = markers.at(-1);
    if (marker) json = json.slice(marker.index! + marker[0].length).trim();
    json = json
      .replace(/^```(?:json)?\s*\r?\n/i, '')
      .replace(/\r?\n```\s*$/, '')
      .trim();
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new BadRequestException(
      'Paste a valid JSON object or a response ending with APP_IMPORT_JSON and its JSON object.',
    );
  }
  const parsed = chatGptResearchImportSchema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException({
      message: 'Research import validation failed.',
      errors: parsed.error.issues.slice(0, 10).map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return normalizeImportedFindingCitations(parsed.data);
}

export const CHATGPT_IMPORT_FORMAT = `After the Hebrew report, append a final section named exactly APP_IMPORT_JSON on its own line, followed by ONE JSON object matching this schema. No prose after the object, no markdown inside JSON. Use null for unknown facts, empty arrays for unavailable findings, and never invent data or source URLs. Keep companyName exactly equal to the hiring-context companyName. Counts must be {"count":123,"approximate":true/false} or {"min":100,"max":200,"approximate":true}, or null. All insight citations must also appear in sources; label FACT, DIRECT_REPORT, INFERENCE or UNKNOWN honestly. Keep the JSON below 60,000 characters.\n${JSON.stringify(z.toJSONSchema(chatGptResearchImportSchema, { io: 'input', unrepresentable: 'any' }))}`;
