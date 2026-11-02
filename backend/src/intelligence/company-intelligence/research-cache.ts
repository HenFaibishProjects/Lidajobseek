import { locationIntelligenceSchema } from './location-intelligence';
import type { LocationIntelligence } from './location-intelligence';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import type { ResearchSource } from './tavily.service';
import {
  quickBriefSchema,
  companyLocationSchema,
  persistedCompanyReportContentSchema,
} from './company-report.schema';
import type {
  PersistedCompanyReportContent,
  ResearchQuality,
} from './company-report.schema';
import type { ResearchMode } from './research-mode';

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPANY_CACHE_TTL_MS = 8 * 7 * DAY_MS;
export const ROLE_CACHE_TTL_MS = 7 * DAY_MS;
export interface ResearchRunResult {
  content: PersistedCompanyReportContent;
  evidence: ResearchSource[];
  locationIntelligence?: LocationIntelligence;
}
export interface StoredResearchEvidence {
  company: ResearchSource[];
  locationIntelligence?: LocationIntelligence;
  roles: ResearchSource[];
}
const evidenceSourcesSchema = z.array(
  z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
    pageContent: z.string().optional(),
    resolvedUrl: z.string().optional(),
    readStatus: z.enum(['not-read', 'read', 'failed']).optional(),
    readFailure: z.string().optional(),
  }),
);
export type ResearchScope = 'full' | 'company' | 'roles';
export const companyCacheContentSchema = persistedCompanyReportContentSchema
  .omit({
    relevantRoles: true,
    roleDiscoverySummary: true,
  })
  .extend({
    locationIntelligence: locationIntelligenceSchema.nullable().default(null),
    evidenceSources: evidenceSourcesSchema,
    reportLanguage: z.literal('he-IL'),
    quickBrief: quickBriefSchema,
    location: companyLocationSchema,
    sources: z
      .array(persistedCompanyReportContentSchema.shape.sources.element)
      .max(50),
  });
export const roleCacheContentSchema = persistedCompanyReportContentSchema
  .pick({
    relevantRoles: true,
    roleDiscoverySummary: true,
    reportLanguage: true,
    sources: true,
    researchQuality: true,
  })
  .extend({
    evidenceSources: evidenceSourcesSchema,
    reportLanguage: z.literal('he-IL'),
    sources: z
      .array(persistedCompanyReportContentSchema.shape.sources.element)
      .max(25),
  });
export type CompanyCacheContent = z.infer<typeof companyCacheContentSchema>;
export type RoleCacheContent = z.infer<typeof roleCacheContentSchema>;
export interface CacheSnapshot<T> {
  content: T;
  refreshedAt: Date;
  mode: ResearchMode;
  reportId: string;
}
export interface ResearchCache {
  company: CacheSnapshot<CompanyCacheContent> | null;
  roles: CacheSnapshot<RoleCacheContent> | null;
}
export interface CacheContext {
  roleIntentKey: string;
  profileFingerprint: string;
}
export function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
export function cacheContext(
  role: string | undefined,
  profile: CandidateProfile,
): CacheContext {
  return {
    roleIntentKey: role ? `intent:${normalizeLookup(role)}` : 'profile-driven',
    profileFingerprint: createHash('sha256')
      .update(JSON.stringify(profile))
      .digest('hex'),
  };
}
export function isFreshCache(
  refreshedAt: Date,
  mode: ResearchMode,
  requestedMode: ResearchMode,
  ttl: number,
  now: Date,
): boolean {
  const age = now.getTime() - refreshedAt.getTime();
  return (
    age >= 0 && age < ttl && (mode === 'DEEP' || requestedMode === 'QUICK')
  );
}
export function companySection(
  content: PersistedCompanyReportContent,
  evidenceSources: ResearchSource[] = [],
  locationIntelligence?: LocationIntelligence,
): CompanyCacheContent {
  return companyCacheContentSchema.strip().parse({
    ...content,
    evidenceSources,
    locationIntelligence: locationIntelligence ?? null,
  });
}
export function roleSection(
  content: PersistedCompanyReportContent,
  evidenceSources: ResearchSource[] = [],
): RoleCacheContent {
  return roleCacheContentSchema.strip().parse({
    ...content,
    evidenceSources,
    sources: [
      ...content.sources.filter(
        (source) => source.sourceType === 'job-posting',
      ),
      ...content.sources.filter(
        (source) => source.sourceType !== 'job-posting',
      ),
    ].slice(0, 25),
  });
}
export function mergeSections(
  company: CompanyCacheContent,
  roles: RoleCacheContent,
  sameRun: boolean,
): PersistedCompanyReportContent {
  const sources = new Map(
    company.sources.map((source) => [source.url, source]),
  );
  for (const source of roles.sources) sources.set(source.url, source);
  const {
    evidenceSources: companyEvidence,
    locationIntelligence: officeEvidence,
    ...companyContent
  } = company;
  const { evidenceSources: roleEvidence, ...roleContent } = roles;
  void companyEvidence;
  void officeEvidence;
  void roleEvidence;
  return {
    ...companyContent,
    ...roleContent,
    sources: [...sources.values()],
    researchQuality: mergeQuality(
      company.researchQuality,
      roles.researchQuality,
      sameRun,
    ),
  };
}
function mergeQuality(
  company: ResearchQuality | null,
  roles: ResearchQuality | null,
  sameRun: boolean,
): ResearchQuality | null {
  if (!company || !roles) return company ?? roles;
  const limitations = [
    ...new Set([...company.limitations, ...roles.limitations]),
  ];
  return {
    ...(company.officeEvidenceLevel !== undefined
      ? { officeEvidenceLevel: company.officeEvidenceLevel }
      : {}),
    evidenceLevel:
      company.evidenceLevel === 'limited' || roles.evidenceLevel === 'limited'
        ? 'limited'
        : company.evidenceLevel === 'strong' &&
            roles.evidenceLevel === 'strong' &&
            !limitations.length
          ? 'strong'
          : 'partial',
    sourcesDiscovered: sameRun
      ? Math.max(company.sourcesDiscovered, roles.sourcesDiscovered)
      : company.sourcesDiscovered + roles.sourcesDiscovered,
    pagesRead: sameRun
      ? Math.max(company.pagesRead, roles.pagesRead)
      : company.pagesRead + roles.pagesRead,
    limitations,
  };
}
