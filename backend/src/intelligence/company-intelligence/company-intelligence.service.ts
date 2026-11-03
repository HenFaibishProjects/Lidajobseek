import {
  LOCATION_LIMITS,
  assessLocation,
  investigateLocation,
  locationPresentation,
} from './location-intelligence';
import type { LocationIntelligence } from './location-intelligence';
import {
  FOLLOW_UP_LIMITS,
  investigateFollowUps,
  planFollowUpLeads,
} from './research-follow-up';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  stepCountIs,
  tool,
} from 'ai';
import { z } from 'zod';
import { CompanyRepository } from './company.repository';
import { LlmProviders } from './llm-providers';
import { TavilyService } from './tavily.service';
import type { ResearchSource } from './tavily.service';
import { FirecrawlService } from './firecrawl.service';
import type { CompanyResearchRequest } from './company-research-request.schema';
import type { CompanyReport, CacheMetadata } from './company-report.schema';
import {
  cacheContext,
  companySection,
  roleSection,
  mergeSections,
} from './research-cache';
import type { ResearchRunResult, ResearchScope } from './research-cache';
import {
  COMPANY_FACT_FIELDS,
  companyReportDraftSchema,
  llmCompanyReportSchema,
  llmCompanyOnlySchema,
  llmRolesOnlySchema,
  llmQuickCompanySchema,
  expandQuickCompanyOutput,
  validateReportEvidence,
  normalizeGeneratedReport,
  persistedCompanyReportContentSchema,
} from './company-report.schema';
import {
  COMPANY_RESEARCH_PROMPT,
  COMPANY_SYNTHESIS_PROMPT,
  COMPANY_QUICK_RESEARCH_PROMPT,
  COMPANY_QUICK_SYNTHESIS_PROMPT,
  COMPANY_QUICK_COMPANY_SYNTHESIS_PROMPT,
  FULL_RESEARCH_INSIGHTS_PROMPT,
} from './company-intelligence.prompt';
import { groundedResearchInsights } from './company-research-insights';
import { logResearchFailure, ResearchError } from './research-error';
import {
  buildResearchQuality,
  candidateFlags,
  usefulGreenFlags,
} from './research-quality';
import { apiKey } from './research-http';
import { CandidateProfileService } from '../candidate-profile/candidate-profile';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { RESEARCH_LIMITS } from './research-mode';
import type { ResearchMode } from './research-mode';
import { validateRelevantRoles } from './role-evidence';

const ROLE_ONLY_COMPANY_PLACEHOLDER = {
  companySummary:
    'Company information is supplied separately from the company cache.',
  productSummary:
    'Product information is supplied separately from the company cache.',
  ...Object.fromEntries(
    COMPANY_FACT_FIELDS.map((field) => [
      field,
      { value: null, supported: false },
    ]),
  ),
  quickBrief: {
    whatTheyDo: 'מידע החברה זמין במטמון.',
    employees: {
      israel: { value: null, supported: false },
      israelEngineering: { value: null, supported: false },
      global: { value: null, supported: false },
      verificationNote: null,
    },
    workModel: { value: null, supported: false },
    greenFlags: [],
    redFlags: [],
  },
  location: Object.fromEntries(
    ['city', 'address', 'building', 'floor'].map((field) => [
      field,
      { value: null, supported: false },
    ]),
  ),
  recentImportantEvents: [],
  greenFlags: [],
  redFlags: [],
  questionsToAskRecruiter: [],
  publicSignals: [],
  overallAssessment: { summary: null, findings: [] },
  interviewInsights: null,
  workplaceSignals: null,
};
function scopeInstructions(scope: ResearchScope): string {
  if (scope === 'company')
    return '\nThis run refreshes COMPANY INFORMATION ONLY. Do not search vacancies or assess candidate fit. Company flags and recruiter questions must be general, independent of candidate profile or role intent. Return only the company output fields in the supplied schema.';
  if (scope === 'roles')
    return '\nThis run refreshes RELEVANT ROLES ONLY. Company information is already cached and is context, not current-run citation evidence. Do not research company overview, product, engineering or general news again. Focus searches and page reads on current relevant postings and assess them against the request/profile. Cite only current-run URLs. Return only role output fields in the supplied schema.';
  return '\nCompany facts, flags and recruiter questions must be general and independent of candidate profile/role intent, because company information is reusable. Role analysis belongs in the role section.';
}

export interface ResearchExecutionOptions {
  modelName?: string;
  companyOnly?: boolean;
}

@Injectable()
export class CompanyIntelligenceService {
  private readonly logger = new Logger(CompanyIntelligenceService.name);

  constructor(
    private readonly providers: LlmProviders,
    private readonly tavily: TavilyService,
    private readonly firecrawl: FirecrawlService,
    private readonly repository: CompanyRepository,
    private readonly config: ConfigService,
    private readonly candidateProfiles: CandidateProfileService,
  ) {}

  async research(
    request: CompanyResearchRequest,
    mode: ResearchMode = 'DEEP',
    options: ResearchExecutionOptions = {},
  ): Promise<CompanyReport> {
    let stage = 'cache-lookup';
    try {
      let profile: CandidateProfile;
      try {
        profile = this.candidateProfiles.getProfile();
      } catch (error) {
        throw new ResearchError(
          'CANDIDATE_PROFILE_INVALID',
          'Candidate profile configuration is invalid',
          HttpStatus.SERVICE_UNAVAILABLE,
          error,
        );
      }
      const context = cacheContext(request.role, profile);
      const cached = await this.repository.findFreshCache(
        request.companyName,
        context,
        mode,
        new Date(),
      );
      const missingFullCoverage =
        options.companyOnly &&
        mode === 'DEEP' &&
        cached.company &&
        (!cached.company.content.interviewInsights ||
          !cached.company.content.workplaceSignals);
      const company =
        request.forceRefresh || missingFullCoverage ? null : cached.company;
      const roles =
        request.forceRefresh || options.companyOnly ? null : cached.roles;
      const scope = options.companyOnly
        ? company
          ? 'none'
          : 'company'
        : !company && !roles
          ? 'full'
          : !company
            ? 'company'
            : !roles
              ? 'roles'
              : 'none';
      let metadata: CacheMetadata;
      if (company && roles) {
        metadata = {
          company: 'hit',
          roles: 'hit',
          companyRefreshedAt: company.refreshedAt.toISOString(),
          rolesRefreshedAt: roles.refreshedAt.toISOString(),
        };
        if (company.reportId === roles.reportId) {
          const report = await this.repository.findReport(company.reportId);
          if (report) return { ...report, cache: metadata };
        }
      }
      stage = 'research';
      const fresh =
        scope === 'none'
          ? null
          : await this.runResearch(
              request,
              mode,
              profile,
              scope,
              company?.content,
              options,
            );
      const refreshedAt = new Date();
      metadata = {
        company: company ? 'hit' : 'refreshed',
        roles: options.companyOnly
          ? 'not-requested'
          : roles
            ? 'hit'
            : 'refreshed',
        companyRefreshedAt: (company?.refreshedAt ?? refreshedAt).toISOString(),
        rolesRefreshedAt: options.companyOnly
          ? null
          : (roles?.refreshedAt ?? refreshedAt).toISOString(),
      };
      const companyContent =
        company?.content ??
        companySection(
          fresh!.content,
          fresh!.evidence,
          fresh!.locationIntelligence,
        );
      const roleContent = options.companyOnly
        ? null
        : (roles?.content ?? roleSection(fresh!.content, fresh!.evidence));
      const content = options.companyOnly
        ? persistedCompanyReportContentSchema.strip().parse({
            ...companyContent,
            relevantRoles: [],
            roleDiscoverySummary: null,
          })
        : mergeSections(
            companyContent,
            roleContent!,
            scope === 'full' ||
              Boolean(company && roles && company.reportId === roles.reportId),
          );
      if (options.companyOnly && company) {
        const report = await this.repository.findReport(company.reportId);
        if (report) {
          this.logger.log({
            event: 'company-research-cache',
            mode,
            provider: request.provider,
            model: options.modelName ?? null,
            cache: metadata,
          });
          return {
            ...report,
            relevantRoles: [],
            roleDiscoverySummary: null,
            cache: metadata,
          };
        }
      }
      stage = 'persistence';
      this.logger.log({
        event: 'company-research-cache',
        mode,
        provider: request.provider,
        model: options.modelName ?? null,
        cache: metadata,
      });
      return await this.repository.persistReport(
        request,
        content,
        refreshedAt,
        mode,
        profile.status,
        {
          context,
          scope,
          metadata,
          freshContent: fresh?.content,
          freshEvidence: fresh?.evidence,
          locationIntelligence: fresh?.locationIntelligence,
          researchEvidence: {
            company: companyContent.evidenceSources,
            locationIntelligence:
              companyContent.locationIntelligence ?? undefined,
            roles: roleContent?.evidenceSources ?? [],
          },
        },
      );
    } catch (error) {
      if (error instanceof ResearchError) throw error;
      const failure = new ResearchError(
        'DATABASE_FAILURE',
        stage === 'cache-lookup'
          ? 'Research cache could not be read'
          : 'Company report could not be saved',
        HttpStatus.INTERNAL_SERVER_ERROR,
        error,
      );
      logResearchFailure(this.logger, failure, {
        provider: request.provider,
        mode,
        stage,
        searchCalls: 0,
        scrapeCalls: 0,
        discoveredSize: 0,
        pagesSize: 0,
      });
      throw failure;
    }
  }

  private async runResearch(
    request: CompanyResearchRequest,
    mode: ResearchMode,
    profile: CandidateProfile,
    scope: ResearchScope,
    cachedCompany?: ReturnType<typeof companySection>,
    options: ResearchExecutionOptions = {},
  ): Promise<ResearchRunResult> {
    const limits = RESEARCH_LIMITS[mode];
    const controller = new AbortController();
    const researchDeadline = Date.now() + limits.timeoutMs;
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    const signal = controller.signal;
    const generalDeadline =
      scope !== 'roles'
        ? researchDeadline -
          (mode === 'DEEP' ? FOLLOW_UP_LIMITS.phaseMs : 0) -
          LOCATION_LIMITS[mode].phaseMs -
          LOCATION_LIMITS[mode].synthesisReserveMs
        : researchDeadline;
    const generalSignal =
      generalDeadline === researchDeadline
        ? signal
        : AbortSignal.any([
            signal,
            AbortSignal.timeout(Math.max(1, generalDeadline - Date.now())),
          ]);
    let toolSignal = generalSignal;
    let stage: 'research' | 'synthesis' | 'validation' = 'research';
    let fatalToolFailure: ResearchError | undefined;
    const discovered = new Map<string, ResearchSource>();
    const pages = new Map<string, string>();
    let followUpBudgetOpened = false;
    let locationPhase = false;
    const searchAllowance = () =>
      limits.searches +
      (followUpBudgetOpened
        ? FOLLOW_UP_LIMITS.publicSignalSearches + FOLLOW_UP_LIMITS.leadSearches
        : 0) +
      (locationPhase
        ? LOCATION_LIMITS[mode].searches +
          LOCATION_LIMITS[mode].followUpSearches
        : 0);
    const readAllowance = () =>
      limits.scrapes +
      (followUpBudgetOpened ? FOLLOW_UP_LIMITS.reads : 0) +
      (locationPhase ? LOCATION_LIMITS[mode].reads : 0);
    let locationIntelligence: LocationIntelligence | undefined;
    const searchQueries: string[] = [];
    let searchCalls = 0;
    let scrapeCalls = 0;
    let successfulSearches = 0;
    let lastSearchFailure: ResearchError | undefined;
    const limitations = new Set<string>();
    try {
      const model = options.modelName
        ? this.providers.model(request.provider, options.modelName)
        : this.providers.model(request.provider);
      apiKey(this.config, 'TAVILY_API_KEY');
      const tools = {
        search: tool({
          description:
            'Search live internet sources with a focused query. Returns allowed source URLs and snippets.',
          inputSchema: z.object({ query: z.string().trim().min(1).max(500) }),
          execute: async ({ query }) => {
            toolSignal.throwIfAborted();
            if (fatalToolFailure) throw fatalToolFailure;
            if (searchCalls >= searchAllowance())
              return { error: 'Search budget exhausted' };
            searchCalls++;
            searchQueries.push(query);
            try {
              const sources = (
                await this.tavily.searchWeb(query, toolSignal)
              ).map((source) => ({
                ...source,
                content: source.content.slice(0, limits.snippetCharacters),
              }));
              successfulSearches++;
              for (const source of sources) {
                const previous = discovered.get(source.url);
                let content = source.content.trim()
                  ? source.content
                  : (previous?.content ?? '');
                if (
                  previous?.content.trim() &&
                  source.content.trim() &&
                  !previous.content.includes(source.content)
                ) {
                  const combined = `${previous.content}\n${source.content}`;
                  const half = Math.floor(limits.snippetCharacters / 2);
                  content =
                    combined.length <= limits.snippetCharacters
                      ? combined
                      : `${previous.content.slice(0, half)}\n${source.content.slice(0, limits.snippetCharacters - half - 1)}`;
                }
                discovered.set(source.url, {
                  readStatus: 'not-read',
                  ...previous,
                  ...source,
                  content,
                });
              }
              return { sources };
            } catch (error) {
              if (signal.aborted) throw error;
              lastSearchFailure =
                error instanceof ResearchError
                  ? error
                  : new ResearchError(
                      'TAVILY_FAILURE',
                      'Search failed',
                      HttpStatus.BAD_GATEWAY,
                      error,
                    );
              limitations.add('חלק מהחיפושים הממוקדים נכשלו.');
              this.logger.debug({
                event: 'search-failed',
                provider: request.provider,
                mode,
                code: lastSearchFailure.code,
              });
              return {
                error:
                  'Search failed; use existing evidence or another focused search within budget.',
              };
            }
          },
        }),
        readPage: tool({
          description:
            'Read a promising exact URL returned by search during this run. Never guess a URL.',
          inputSchema: z.object({ url: z.string().max(2048) }),
          execute: async ({ url }) => {
            toolSignal.throwIfAborted();
            if (fatalToolFailure) throw fatalToolFailure;
            if (!discovered.has(url)) {
              fatalToolFailure = new ResearchError(
                'EVIDENCE_INVALID',
                'Page was not discovered in this run',
              );
              controller.abort();
              throw fatalToolFailure;
            }
            if (pages.has(url)) return { url, content: pages.get(url) };
            const source = discovered.get(url)!;
            if (source.readStatus === 'failed')
              return {
                error:
                  'This source could not be read; use its snippet or choose another discovered source.',
              };
            if (scrapeCalls >= readAllowance())
              return { error: 'Page reading budget exhausted' };
            scrapeCalls++;
            try {
              const result = await this.firecrawl.readPage(
                url,
                new Set(discovered.keys()),
                toolSignal,
              );
              const boundedContent = result.content.slice(
                0,
                limits.pageCharacters,
              );
              discovered.set(url, {
                ...discovered.get(url)!,
                readStatus: 'read',
                pageContent: boundedContent,
                resolvedUrl: result.resolvedUrl,
              });
              if (result.resolvedUrl)
                this.logger.debug({
                  event: 'public-redirect-followed',
                  provider: request.provider,
                  mode,
                });
              pages.set(url, boundedContent);
              return { url, content: boundedContent };
            } catch (error) {
              const failure =
                error instanceof ResearchError
                  ? error
                  : new ResearchError(
                      'FIRECRAWL_FAILURE',
                      'Page reading failed',
                      HttpStatus.BAD_GATEWAY,
                      error,
                    );
              if (signal.aborted || failure.code === 'EVIDENCE_INVALID') {
                fatalToolFailure = failure;
                controller.abort();
                throw failure;
              }
              if (!pages.has(url))
                discovered.set(url, {
                  ...discovered.get(url)!,
                  readStatus: 'failed',
                  readFailure: failure.code,
                });
              limitations.add(
                'חלק מעמודי המקורות לא נקראו; ייתכן שנעשה שימוש בתקצירי החיפוש שלהם.',
              );
              this.logger.debug({
                event: 'page-read-failed',
                provider: request.provider,
                mode,
                code: failure.code,
              });
              return {
                error:
                  'Page could not be read. Use its search evidence cautiously or choose another source.',
              };
            }
          },
        }),
      };
      try {
        await generateText({
          model,
          providerOptions:
            request.provider === 'deepseek'
              ? { deepseek: { thinking: { type: 'disabled' } } }
              : undefined,
          system:
            (mode === 'QUICK'
              ? COMPANY_QUICK_RESEARCH_PROMPT
              : COMPANY_RESEARCH_PROMPT + FULL_RESEARCH_INSIGHTS_PROMPT) +
            scopeInstructions(scope),
          prompt: JSON.stringify({
            companyName: request.companyName,
            role: scope === 'company' ? null : (request.role ?? null),
            roleContext: options.companyOnly
              ? (request.role ?? null)
              : undefined,
            currentDate: new Date().toISOString(),
            mode,
            limits,
            candidateProfile: scope === 'company' ? null : profile,
            scope,
            cachedCompany: scope === 'roles' ? cachedCompany : undefined,
          }),
          tools,
          stopWhen: stepCountIs(limits.steps),
          prepareStep: ({ stepNumber }) => {
            let requiredTool: 'search' | 'readPage' | undefined;
            if (stepNumber === 0) {
              requiredTool = 'search';
            } else {
              const pendingPages = [...discovered.values()].some(
                (source) => source.readStatus === 'not-read',
              );
              if (pendingPages && scrapeCalls < limits.preferredReadAttempts) {
                requiredTool = 'readPage';
              } else if (!discovered.size && searchCalls < limits.searches) {
                requiredTool = 'search';
              }
            }
            if (requiredTool && request.provider === 'deepseek') {
              return {
                toolChoice: 'required' as const,
                activeTools: [requiredTool],
              };
            }
            return {
              toolChoice: requiredTool
                ? { type: 'tool' as const, toolName: requiredTool }
                : ('auto' as const),
              activeTools: [
                ...(searchCalls < limits.searches ? ['search' as const] : []),
                ...(scrapeCalls < limits.scrapes &&
                [...discovered.values()].some(
                  (source) => source.readStatus === 'not-read',
                )
                  ? ['readPage' as const]
                  : []),
              ],
            };
          },
          abortSignal: generalSignal,
          maxRetries: 0,
          maxOutputTokens: limits.stepTokens,
        });
      } catch (error) {
        if (!generalSignal.aborted || signal.aborted || fatalToolFailure)
          throw error;
        this.logger.debug({ event: 'general-research-time-reserved', mode });
      }
      const roleIntent =
        request.role ??
        (profile.status === 'configured'
          ? profile.preferredRoles.join(' ') || 'engineering'
          : null);
      const focusedQueries: Array<{
        target: 'engineering-roles' | 'israel-headcount' | 'local-r-and-d';
        query: string;
      }> = [];
      const hasPostingClue = [...discovered.values()].some(
        (source) =>
          /\/(?:jobs?|careers|positions|vacancies)\b|lever\.co|greenhouse\.(?:io|com)|comeet\.com/i.test(
            source.url,
          ) &&
          /engineer|developer|משרות|משרת|דרושים/i.test(
            `${source.title} ${source.content}`,
          ),
      );
      const hasLocalResearchClue = [...discovered.values()].some(
        (source) =>
          /israel|ישראל/i.test(`${source.title} ${source.content}`) &&
          /R&D|research and development|engineering|פיתוח/i.test(
            `${source.title} ${source.content}`,
          ),
      );
      const hasIsraelHeadcountClue = [...discovered.values()].some((source) =>
        /(?:israel|ישראל).{0,100}\d[\d,.–-]*.{0,40}(?:employees|engineers|עובד|מהנדס)|\d[\d,.–-]*.{0,40}(?:employees|engineers|עובד|מהנדס).{0,100}(?:israel|ישראל)/i.test(
          `${source.title} ${source.content}`,
        ),
      );
      if (scope !== 'company' && roleIntent && !hasPostingClue) {
        focusedQueries.push({
          target: 'engineering-roles',
          query: `${request.companyName} Israel ${roleIntent} careers engineering jobs`,
        });
      }
      if (
        scope !== 'roles' &&
        (!hasLocalResearchClue || !hasIsraelHeadcountClue)
      ) {
        focusedQueries.push({
          target: hasLocalResearchClue ? 'israel-headcount' : 'local-r-and-d',
          query: !hasIsraelHeadcountClue
            ? `${request.companyName} Israel R&D engineering employees עובדים בישראל מרכז פיתוח עובדים`
            : `${request.companyName} Israel R&D engineering development center backend`,
        });
      }
      for (const { target, query } of focusedQueries) {
        if (searchCalls >= limits.searches || generalSignal.aborted) break;
        const boundedQuery = query.slice(0, 500);
        if (
          searchQueries.some(
            (previous) => previous.toLowerCase() === boundedQuery.toLowerCase(),
          )
        )
          continue;
        const knownUrls = new Set(discovered.keys());
        this.logger.debug({ event: 'focused-research', target, mode });
        try {
          await tools.search.execute!(
            { query: boundedQuery },
            {
              toolCallId: 'focused-company-search',
              messages: [],
              abortSignal: generalSignal,
            },
          );
          if (scrapeCalls < limits.scrapes && !generalSignal.aborted) {
            const pendingSources = [...discovered.values()].filter(
              (source) =>
                !pages.has(source.url) && source.readStatus !== 'failed',
            );
            const relevantTerms =
              target === 'engineering-roles'
                ? /careers|jobs?|engineer|developer|משר|דרוש/i
                : /israel|ישראל|R&D|engineering|פיתוח/i;
            const priority = (source: ResearchSource) =>
              (knownUrls.has(source.url) ? 0 : 2) +
              Number(
                relevantTerms.test(
                  `${source.title} ${source.url} ${source.content}`,
                ),
              );
            pendingSources.sort(
              (first, second) => priority(second) - priority(first),
            );
            const pending = pendingSources[0];
            if (pending)
              await tools.readPage.execute!(
                { url: pending.url },
                {
                  toolCallId: 'focused-company-page',
                  messages: [],
                  abortSignal: generalSignal,
                },
              );
          }
        } catch (error) {
          if (!generalSignal.aborted || signal.aborted || fatalToolFailure)
            throw error;
        }
      }
      if (generalSignal.aborted && !signal.aborted)
        limitations.add('המחקר הכללי קוצר כדי להשאיר זמן לבדיקת פרטי המשרד.');
      toolSignal = signal;
      if (fatalToolFailure) throw fatalToolFailure;
      signal.throwIfAborted();
      if (
        ![...discovered.values()].some(
          (source) => source.content.trim() || source.pageContent?.trim(),
        )
      ) {
        if (!successfulSearches && lastSearchFailure && !generalSignal.aborted)
          throw lastSearchFailure;
        if (scope === 'roles' && cachedCompany && successfulSearches) {
          return {
            evidence: [...discovered.values()],
            content: {
              ...cachedCompany,
              relevantRoles: [],
              roleDiscoverySummary:
                'לא נמצאו ראיות שימושיות למשרות רלוונטיות במסגרת המחקר. אין בכך הוכחה שאין משרות פתוחות.',
              sources: [],
              researchQuality: {
                evidenceLevel: 'limited',
                sourcesDiscovered: discovered.size,
                pagesRead: 0,
                limitations: [
                  ...limitations,
                  'לא נמצאו ראיות שימושיות למשרות רלוונטיות במסגרת המחקר.',
                ],
              },
            },
          };
        }
      }
      const searchWithinPhase = async (
        query: string,
        phaseSignal: AbortSignal,
        toolCallId: string,
      ) => {
        toolSignal = phaseSignal;
        try {
          return await tools.search.execute!(
            { query },
            { toolCallId, messages: [], abortSignal: phaseSignal },
          );
        } catch (error) {
          if (
            error instanceof ResearchError &&
            error.code === 'EVIDENCE_INVALID'
          )
            throw error;
          if (phaseSignal.aborted && !signal.aborted)
            return { error: 'Research phase time budget exhausted' };
          throw error;
        } finally {
          toolSignal = signal;
        }
      };
      const readWithinPhase = async (
        url: string,
        phaseSignal: AbortSignal,
        toolCallId: string,
      ) => {
        toolSignal = phaseSignal;
        try {
          return await tools.readPage.execute!(
            { url },
            { toolCallId, messages: [], abortSignal: phaseSignal },
          );
        } catch (error) {
          if (
            error instanceof ResearchError &&
            error.code === 'EVIDENCE_INVALID'
          )
            throw error;
          if (phaseSignal.aborted && !signal.aborted)
            return { error: 'Research phase time budget exhausted' };
          throw error;
        } finally {
          toolSignal = signal;
        }
      };
      if (scope !== 'roles' && mode === 'DEEP') {
        followUpBudgetOpened = true;
        const followUps = await investigateFollowUps({
          includeInterviewResearch: true,
          companyName: request.companyName,
          signal,
          deadline: Math.min(
            Date.now() + FOLLOW_UP_LIMITS.phaseMs,
            researchDeadline -
              LOCATION_LIMITS[mode].phaseMs -
              LOCATION_LIMITS[mode].synthesisReserveMs,
          ),
          discovered,
          pages,
          previousQueries: searchQueries,
          search: (query, phaseSignal) =>
            searchWithinPhase(query, phaseSignal, 'follow-up-search'),
          readPage: (url, phaseSignal) =>
            readWithinPhase(url, phaseSignal, 'follow-up-page'),
          planLeads: (alreadySearched, phaseSignal) =>
            planFollowUpLeads(
              model,
              request.companyName,
              discovered,
              alreadySearched,
              phaseSignal,
            ),
          onPlannerFailure: (code) =>
            this.logger.debug({
              event: 'follow-up-planner-failed',
              code,
              provider: request.provider,
              mode,
            }),
        });
        signal.throwIfAborted();
        this.logger.debug({
          event: 'follow-up-research-finished',
          mode,
          searchCalls: followUps.searchCalls,
          readCalls: followUps.readCalls,
          plannerFailed: followUps.plannerFailed,
          stopReason: followUps.stopReason,
        });
        if (
          followUps.plannerFailed ||
          followUps.stopReason === 'time-reserved'
        ) {
          limitations.add(
            'בדיקת המקורות הציבוריים ודיווחי הראיונות הוגבלה בזמן או בזמינות המקורות.',
          );
        }
      }
      if (scope !== 'roles') {
        locationPhase = true;
        locationIntelligence = await investigateLocation({
          companyName: request.companyName,
          mode,
          signal,
          researchDeadline,
          discovered,
          pages,
          search: (query, locationSignal) =>
            searchWithinPhase(query, locationSignal, 'location-search'),
          readPage: (url, locationSignal) =>
            readWithinPhase(url, locationSignal, 'location-page'),
          assess: (previous, locationSignal) =>
            assessLocation(
              model,
              request.companyName,
              mode,
              discovered,
              previous,
              locationSignal,
            ),
          onAssessmentFailure: (code) =>
            this.logger.debug({
              event: 'location-assessment-failed',
              code,
              provider: request.provider,
              mode,
            }),
          onRejectedEvidence: (rejection) =>
            this.logger.debug({
              event: 'location-evidence-rejected',
              field: rejection.field,
              url: rejection.url,
              reason: rejection.reason,
              provider: request.provider,
              mode,
            }),
        });
        locationPhase = false;
        signal.throwIfAborted();
        this.logger.debug({
          event: 'location-investigation-finished',
          mode,
          searchCalls: locationIntelligence.searchCalls,
          readCalls: locationIntelligence.readCalls,
          stopReason: locationIntelligence.stopReason,
        });
      }
      if (
        ![...discovered.values()].some(
          (source) => source.content.trim() || source.pageContent?.trim(),
        )
      ) {
        if (!successfulSearches && lastSearchFailure) throw lastSearchFailure;
        throw new ResearchError(
          'EVIDENCE_INVALID',
          'Research did not collect usable source evidence',
        );
      }
      stage = 'synthesis';
      const usesQuickCompanySchema = mode === 'QUICK' && scope === 'company';
      const synthesisSchema: z.ZodType = usesQuickCompanySchema
        ? llmQuickCompanySchema
        : scope === 'company'
          ? llmCompanyOnlySchema
          : scope === 'roles'
            ? llmRolesOnlySchema
            : llmCompanyReportSchema;
      const synthesisPrompt = usesQuickCompanySchema
        ? COMPANY_QUICK_COMPANY_SYNTHESIS_PROMPT
        : mode === 'QUICK'
          ? COMPANY_QUICK_SYNTHESIS_PROMPT
          : COMPANY_SYNTHESIS_PROMPT + FULL_RESEARCH_INSIGHTS_PROMPT;
      const runSynthesis = () =>
        generateText({
          model,
          providerOptions:
            request.provider === 'deepseek'
              ? { deepseek: { thinking: { type: 'disabled' } } }
              : undefined,
          system: synthesisPrompt + scopeInstructions(scope),
          prompt: JSON.stringify({
            request:
              scope === 'company'
                ? {
                    companyName: request.companyName,
                    ...(options.companyOnly
                      ? { roleContext: request.role ?? null }
                      : {}),
                  }
                : request,
            mode,
            limits,
            candidateProfile: scope === 'company' ? null : profile,
            scope,
            cachedCompany: scope === 'roles' ? cachedCompany : undefined,
            locationIntelligence,
            evidence: [...discovered.values()].map((source) => ({
              title: source.title,
              url: source.url,
              content: source.content,
              readStatus: source.readStatus,
              pageContent: pages.get(source.url) ?? null,
            })),
          }),
          output: Output.object({ schema: synthesisSchema }),
          abortSignal: signal,
          maxRetries: 0,
          maxOutputTokens: limits.reportTokens,
        });
      let output: unknown;
      try {
        ({ output } = await runSynthesis());
      } catch (error) {
        const retriesSynthesis =
          request.provider === 'deepseek' &&
          mode === 'QUICK' &&
          NoObjectGeneratedError.isInstance(error) &&
          !signal.aborted;
        if (!retriesSynthesis) throw error;
        this.logger.warn({
          event: 'quick-synthesis-retry',
          provider: request.provider,
          mode,
          scope,
          causeName: error.name,
        });
        ({ output } = await runSynthesis());
      }
      signal.throwIfAborted();
      stage = 'validation';
      const generatedReport = usesQuickCompanySchema
        ? expandQuickCompanyOutput(llmQuickCompanySchema.parse(output))
        : {
            ...(scope === 'roles' ? ROLE_ONLY_COMPANY_PLACEHOLDER : {}),
            ...(scope === 'company'
              ? { relevantRoles: [], roleDiscoverySummary: null }
              : {}),
            ...z.record(z.string(), z.unknown()).parse(output),
          };
      const parsed = companyReportDraftSchema.safeParse(
        normalizeGeneratedReport(llmCompanyReportSchema.parse(generatedReport)),
      );
      if (!parsed.success)
        throw new ResearchError(
          'STRUCTURED_OUTPUT_INVALID',
          'Generated report failed application validation',
        );
      const content = validateReportEvidence(parsed.data, discovered);
      if (scope !== 'roles' && mode === 'DEEP') {
        Object.assign(
          content,
          groundedResearchInsights(
            content.interviewInsights,
            content.workplaceSignals,
            discovered,
          ),
        );
        for (const limitation of [
          ...content.interviewInsights!.limitations,
          ...content.workplaceSignals!.limitations,
        ])
          limitations.add(limitation);
      } else if (mode === 'QUICK') {
        content.interviewInsights = null;
        content.workplaceSignals = null;
        content.publicSignals = [];
      }
      if (locationIntelligence) {
        content.location = locationPresentation(locationIntelligence);
        const localWorkModel = locationIntelligence.facts.workModel;
        content.quickBrief.workModel =
          localWorkModel.value && localWorkModel.status === 'INFERRED'
            ? `לפי האינדיקציות: ${localWorkModel.value}; כדאי לאמת מול המגייס.`
            : localWorkModel.value;
        content.workModelSummary = content.quickBrief.workModel;
        const office = [
          content.location.city,
          content.location.address,
          content.location.building,
          content.location.campus,
        ].filter(Boolean);
        content.officeLocationSummary = office.length
          ? [...new Set(office)].join(', ')
          : null;
        for (const fact of Object.values(locationIntelligence.facts)) {
          if (
            fact.value === null &&
            !(fact.rationale && fact.sourceUrls.length)
          )
            continue;
          for (const url of fact.sourceUrls) {
            if (content.sources.some((source) => source.url === url)) continue;
            content.sources.push({
              url,
              title: discovered.get(url)!.title,
              sourceType: 'other',
            });
          }
        }
        for (const fact of Object.values(locationIntelligence.facts)) {
          if (
            (fact.conflicting || fact.value === null) &&
            fact.rationale &&
            fact.sourceUrls.length &&
            !/https?:\/\//i.test(fact.rationale)
          )
            limitations.add(fact.rationale);
        }
        if (
          Object.values(locationIntelligence.facts).some(
            (fact) => fact.value !== null && fact.status === 'INFERRED',
          )
        )
          limitations.add('חלק מפרטי המשרד הם הערכה המבוססת על המקורות.');
        if (
          locationIntelligence.stopReason === 'time-reserved' ||
          locationIntelligence.stopReason === 'assessment-unavailable' ||
          locationIntelligence.assessmentFailures > 0
        )
          limitations.add('בדיקת פרטי המשרד לא הושלמה במלואה.');
      }
      if (content.relevantRoles.some((role) => role.omittedFacts?.length))
        limitations.add('חלק מפרטי המשרות לא אומתו והושמטו.');
      const roleReport = validateRelevantRoles(
        content,
        discovered,
        pages,
        profile,
        request.role,
        limits.roles,
      );
      const reportContent = {
        ...roleReport,
        greenFlags: usefulGreenFlags(roleReport.greenFlags),
        redFlags: candidateFlags(roleReport.redFlags),
        quickBrief: {
          ...roleReport.quickBrief,
          greenFlags: usefulGreenFlags(roleReport.quickBrief.greenFlags),
          redFlags: candidateFlags(roleReport.quickBrief.redFlags),
        },
        reportLanguage: 'he-IL' as const,
        researchQuality: buildResearchQuality(
          roleReport,
          discovered,
          pages,
          limitations,
          scope,
          locationIntelligence,
        ),
      };
      this.logger.log({
        event: 'company-research-finished',
        mode,
        provider: request.provider,
        model: options.modelName ?? null,
        searchCalls,
        readCalls: scrapeCalls,
      });
      return {
        content: reportContent,
        evidence: [...discovered.values()],
        locationIntelligence,
      };
    } catch (error) {
      let failure: ResearchError;
      if (fatalToolFailure) failure = fatalToolFailure;
      else if (error instanceof ResearchError) failure = error;
      else if (signal.aborted)
        failure = new ResearchError(
          'TIMEOUT',
          'Company research timed out',
          HttpStatus.GATEWAY_TIMEOUT,
          error,
        );
      else if (
        NoObjectGeneratedError.isInstance(error) ||
        stage === 'validation'
      )
        failure = new ResearchError(
          'STRUCTURED_OUTPUT_INVALID',
          'Generated report could not be validated',
          HttpStatus.BAD_GATEWAY,
          error,
        );
      else
        failure = new ResearchError(
          'LLM_FAILURE',
          `LLM ${stage} failed`,
          HttpStatus.BAD_GATEWAY,
          error,
        );
      logResearchFailure(this.logger, failure, {
        provider: request.provider,
        stage,
        mode,
        searchCalls,
        scrapeCalls,
        discoveredSize: discovered.size,
        pagesSize: pages.size,
      });
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }
}
