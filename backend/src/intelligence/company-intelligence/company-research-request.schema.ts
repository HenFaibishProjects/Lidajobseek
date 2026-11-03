import { z } from 'zod';

export const providerSchema = z.enum(['openai', 'deepseek']);
export type LlmProvider = z.input<typeof providerSchema>;

export const companyResearchRequestSchema = z.strictObject({
  companyName: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(500).optional(),
  provider: providerSchema,
  forceRefresh: z.boolean().optional().default(false),
});
export type CompanyResearchRequest = z.input<
  typeof companyResearchRequestSchema
>;
