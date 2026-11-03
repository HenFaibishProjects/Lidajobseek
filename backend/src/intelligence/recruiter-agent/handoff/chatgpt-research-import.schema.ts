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
      .strictObject({ min: count, max: count, approximate: z.literal(true) })
      .refine((value) => value.min <= value.max, 'Invalid headcount range.'),
  ])
  .nullable()
  .default(null);
const finding = z.object({
  statement: z.string().trim().min(1).max(1500),
  status: z.enum(['FACT', 'DIRECT_REPORT', 'INFERENCE', 'UNKNOWN']),
  sourceUrls: z.array(sourceUrl).max(5),
  reportedAt: shortText(100),
  context: shortText(500),
});
const findings = z.array(finding).max(12).default([]);
export const chatGptResearchImportSchema = z
  .strictObject({
    companyName: z.string().trim().min(1).max(200),
    roleTitle: shortText(300),
    companySummary: optionalText,
    whatTheyDo: optionalText,
    productSummary: optionalText,
    businessModel: optionalText,
    location: z
      .strictObject({
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
      .strictObject({
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
      .strictObject({
        summary: optionalText,
        stages: findings,
        reportedTopics: findings,
        candidateExperiences: findings,
        limitations: list,
      })
      .nullable()
      .default(null),
    workplaceSignals: z
      .strictObject({
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
  })
  .superRefine((research, context) => {
    const urls = new Set(research.sources.map((source) => source.url));
    for (const section of [
      research.interviewInsights,
      research.workplaceSignals,
    ]) {
      if (!section) continue;
      for (const value of Object.values(section)) {
        if (!Array.isArray(value)) continue;
        for (const item of value) {
          if (typeof item === 'string') continue;
          if (item.sourceUrls.some((url) => !urls.has(url)))
            context.addIssue({
              code: 'custom',
              message: 'Finding URLs must also appear in sources.',
            });
          if (item.status !== 'UNKNOWN' && item.sourceUrls.length === 0)
            context.addIssue({
              code: 'custom',
              message: 'Findings must cite a source or use UNKNOWN.',
            });
        }
      }
    }
  });
export type ChatGptResearchImport = z.infer<typeof chatGptResearchImportSchema>;

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
  return parsed.data;
}

export const CHATGPT_IMPORT_FORMAT = `After the Hebrew report, append a final section named exactly APP_IMPORT_JSON on its own line, followed by ONE JSON object matching this schema. No prose after the object, no markdown inside JSON. Use null for unknown facts, empty arrays for unavailable findings, and never invent data or source URLs. Keep companyName exactly equal to the hiring-context companyName. Counts must be {"count":123,"approximate":true/false} or {"min":100,"max":200,"approximate":true}, or null. All insight citations must also appear in sources; label FACT, DIRECT_REPORT, INFERENCE or UNKNOWN honestly. Keep the JSON below 60,000 characters.\n${JSON.stringify(z.toJSONSchema(chatGptResearchImportSchema, { io: 'input', unrepresentable: 'any' }))}`;
