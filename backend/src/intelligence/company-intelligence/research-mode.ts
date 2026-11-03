import { z } from 'zod';

export const researchModeSchema = z.enum(['QUICK', 'DEEP']);
export type ResearchMode = z.infer<typeof researchModeSchema>;
export const UNIFIED_RESEARCH_MODE: ResearchMode = 'DEEP';

export const RESEARCH_LIMITS = {
  QUICK: {
    steps: 4,
    searches: 3,
    scrapes: 2,
    preferredReadAttempts: 1,
    timeoutMs: 75000,
    stepTokens: 1000,
    reportTokens: 2500,
    pageCharacters: 8000,
    snippetCharacters: 1500,
    roles: 3,
  },
  DEEP: {
    steps: 9,
    searches: 6,
    scrapes: 5,
    preferredReadAttempts: 2,
    timeoutMs: 185000,
    stepTokens: 2000,
    reportTokens: 8000,
    pageCharacters: 20000,
    snippetCharacters: 3000,
    roles: 10,
  },
} as const;
