import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const optionalKey = z.string().trim().optional();
const optionalModel = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().min(1).optional(),
);

export const DEFAULT_RECRUITER_RESEARCH_PROVIDER = 'deepseek' as const;
export const DEFAULT_RECRUITER_RESEARCH_MODEL = 'deepseek-flash';
export const DEFAULT_RECRUITER_DECISION_PROVIDER = 'openai' as const;
export const DEFAULT_RECRUITER_DECISION_MODEL = 'gpt-6-luna';
const optionalSetting = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.email().optional(),
);

export const environmentSchema = z
  .object({
    PORT: port.default(3000),
    INTELLIGENCE_DB_HOST: z.string().min(1),
    INTELLIGENCE_DB_PORT: port,
    INTELLIGENCE_DB_USERNAME: z.string().min(1),
    INTELLIGENCE_DB_PASSWORD: z.string().min(1),
    INTELLIGENCE_DB_DATABASE: z.string().min(1),
    INTELLIGENCE_DB_SCHEMA: z
      .string()
      .trim()
      .regex(
        /^[a-z_][a-z0-9_]*$/,
        'INTELLIGENCE_DB_SCHEMA must be a lowercase PostgreSQL identifier',
      )
      .default('public'),
    INTELLIGENCE_DB_SSL: z.preprocess(
      (value) => (value === '' || value === undefined ? true : value),
      z.union([
        z.boolean(),
        z.enum(['true', 'false']).transform((value) => value === 'true'),
      ]),
    ),
    INTELLIGENCE_ALLOWED_EMAIL: optionalEmail,
    RECRUITER_GMAIL_POLLING_ENABLED: z.preprocess(
      (value) => (value === '' || value === undefined ? false : value),
      z.union([
        z.boolean(),
        z.enum(['true', 'false']).transform((value) => value === 'true'),
      ]),
    ),
    GOOGLE_CLIENT_ID: optionalSetting,
    GOOGLE_CLIENT_SECRET: optionalSetting,
    GOOGLE_REFRESH_TOKEN: optionalSetting,
    TAVILY_API_KEY: optionalKey,
    FIRECRAWL_API_KEY: optionalKey,
    OPENAI_API_KEY: optionalKey,
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-6.1-sol'),
    RECRUITER_DECISION_PROVIDER: z
      .enum(['openai', 'deepseek'])
      .default(DEFAULT_RECRUITER_DECISION_PROVIDER),
    RECRUITER_DECISION_MODEL: optionalModel.transform(
      (value) => value ?? DEFAULT_RECRUITER_DECISION_MODEL,
    ),
    RECRUITER_NOTIFICATION_TO: optionalEmail,
    RECRUITER_NOTIFICATION_FROM: optionalEmail,
    SMTP_HOST: optionalSetting,
    SMTP_PORT: port.default(587),
    SMTP_SECURE: z.preprocess(
      (value) => (value === '' || value === undefined ? false : value),
      z.union([
        z.boolean(),
        z.enum(['true', 'false']).transform((value) => value === 'true'),
      ]),
    ),
    SMTP_USER: optionalSetting,
    SMTP_PASSWORD: optionalSetting,
    APP_BASE_URL: optionalSetting.refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }, 'APP_BASE_URL must be an HTTP(S) URL without credentials'),
    RECRUITER_CHEAP_PROVIDER: z.enum(['openai', 'deepseek']).default('openai'),
    RECRUITER_CHEAP_MODEL: optionalModel.transform(
      (value) => value ?? 'gpt-6-luna',
    ),
    RECRUITER_ANALYSIS_PROVIDER: z
      .enum(['openai', 'deepseek'])
      .default('openai'),
    RECRUITER_ANALYSIS_MODEL: optionalModel.transform(
      (value) => value ?? 'gpt-6.1-terra',
    ),
    RECRUITER_RESEARCH_PROVIDER: z
      .enum(['openai', 'deepseek'])
      .default(DEFAULT_RECRUITER_RESEARCH_PROVIDER),
    RECRUITER_RESEARCH_MODEL: optionalModel.transform(
      (value) => value ?? DEFAULT_RECRUITER_RESEARCH_MODEL,
    ),
    DEEPSEEK_API_KEY: optionalKey,
    DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-chat'),
  })
  .superRefine((environment, context) => {
    if (!environment.RECRUITER_GMAIL_POLLING_ENABLED) return;

    for (const key of [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REFRESH_TOKEN',
    ] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when recruiter Gmail polling is enabled`,
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;
