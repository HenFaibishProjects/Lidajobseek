import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { ActiveCandidateProfileService } from '../candidate-profile/active-candidate-profile.service';
import type { CandidateProfile } from '../candidate-profile/candidate-profile';
import { FirecrawlService } from '../company-intelligence/firecrawl.service';
import { LlmProviders } from '../company-intelligence/llm-providers';
import {
  logResearchFailure,
  ResearchError,
} from '../company-intelligence/research-error';
import { TavilyService } from '../company-intelligence/tavily.service';
import {
  buildDiscoveryQueries,
  buildRefinementQuery,
  careersHostOf,
  extractJobLinks,
  isCareersListingUrl,
  JOB_MATCH_LIMITS,
  JobCandidateCollection,
  selectCandidatesForMatching,
  selectCandidatesForReading,
} from './job-discovery';
import type { JobCandidate } from './job-discovery';
import {
  JobMatchCacheRepository,
  jobMatchCacheKey,
} from './job-match-cache.repository';
import { llmJobMatchSchema } from './job-match.schema';
import type {
  JobMatchContent,
  JobMatchRequest,
  JobMatchResult,
  LlmJobMatch,
} from './job-match.schema';
import {
  describeMatchSummary,
  JOB_MATCHING_PROMPT,
  validateJobMatches,
} from './job-matching';

const JOB_MATCH_LOG_MODE = 'JOBS';

type JobMatchStage =
  'profile' | 'cache-lookup' | 'discovery' | 'matching' | 'persistence';

interface ScanProgress {
  searchCalls: number;
  successfulSearches: number;
  pageReads: number;
  failedReads: number;
  timeLimited: boolean;
  lastSearchFailure: ResearchError | null;
}

@Injectable()
export class JobMatchingService {
  private readonly logger = new Logger(JobMatchingService.name);

  constructor(
    private readonly profiles: ActiveCandidateProfileService,
    private readonly cache: JobMatchCacheRepository,
    private readonly providers: LlmProviders,
    private readonly tavily: TavilyService,
    private readonly firecrawl: FirecrawlService,
  ) {}

  async match(request: JobMatchRequest): Promise<JobMatchResult> {
    let stage: JobMatchStage = 'profile';
    const progress: ScanProgress = {
      searchCalls: 0,
      successfulSearches: 0,
      pageReads: 0,
      failedReads: 0,
      timeLimited: false,
      lastSearchFailure: null,
    };
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      JOB_MATCH_LIMITS.timeoutMs,
    );
    let candidateCount = 0;
    try {
      const profile = await this.profiles.loadActiveProfile();
      const cacheKey = jobMatchCacheKey(request.companyName, profile);
      stage = 'cache-lookup';
      if (!request.forceRefresh) {
        const cached = await this.cache.findFresh(cacheKey, new Date());
        if (cached) {
          this.logger.log({
            event: 'job-match-cache-hit',
            companyKey: cacheKey.companyKey,
          });
          return {
            ...cached.content,
            cache: {
              status: 'hit',
              refreshedAt: cached.refreshedAt.toISOString(),
            },
          };
        }
      }
      const model = this.providers.model(request.provider);
      stage = 'discovery';
      const collection = await this.discoverJobs(
        request.companyName,
        profile,
        progress,
        controller.signal,
      );
      candidateCount = collection.size();
      stage = 'matching';
      const content = await this.matchCandidates(
        request.companyName,
        profile,
        model,
        collection,
        progress,
        controller.signal,
      );
      stage = 'persistence';
      const refreshedAt = new Date();
      await this.cache.save(cacheKey, content, refreshedAt);
      this.logger.log({
        event: 'job-match-finished',
        companyKey: cacheKey.companyKey,
        jobsScanned: content.jobsScanned,
        relevantJobs: content.relevantJobs.length,
        searchCalls: progress.searchCalls,
        pageReads: progress.pageReads,
      });
      return {
        ...content,
        cache: { status: 'refreshed', refreshedAt: refreshedAt.toISOString() },
      };
    } catch (error) {
      const failure = this.toResearchError(error, stage, controller.signal);
      logResearchFailure(this.logger, failure, {
        provider: request.provider,
        stage,
        mode: JOB_MATCH_LOG_MODE,
        searchCalls: progress.searchCalls,
        scrapeCalls: progress.pageReads,
        discoveredSize: candidateCount,
        pagesSize: progress.pageReads - progress.failedReads,
      });
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }

  private toResearchError(
    error: unknown,
    stage: JobMatchStage,
    signal: AbortSignal,
  ): ResearchError {
    if (error instanceof ResearchError) return error;
    if (stage === 'cache-lookup' || stage === 'persistence')
      return new ResearchError(
        'DATABASE_FAILURE',
        stage === 'cache-lookup'
          ? 'Job match cache could not be read'
          : 'Job match result could not be saved',
        HttpStatus.INTERNAL_SERVER_ERROR,
        error,
      );
    if (signal.aborted)
      return new ResearchError(
        'TIMEOUT',
        'Job matching timed out',
        HttpStatus.GATEWAY_TIMEOUT,
        error,
      );
    if (NoObjectGeneratedError.isInstance(error))
      return new ResearchError(
        'STRUCTURED_OUTPUT_INVALID',
        'Job match assessment could not be validated',
        HttpStatus.BAD_GATEWAY,
        error,
      );
    return new ResearchError(
      'LLM_FAILURE',
      `Job matching ${stage} failed`,
      HttpStatus.BAD_GATEWAY,
      error,
    );
  }

  private async discoverJobs(
    companyName: string,
    profile: CandidateProfile,
    progress: ScanProgress,
    overallSignal: AbortSignal,
  ): Promise<JobCandidateCollection> {
    const discoveryDeadline =
      Date.now() +
      JOB_MATCH_LIMITS.timeoutMs -
      JOB_MATCH_LIMITS.matchingReserveMs;
    const discoverySignal = AbortSignal.any([
      overallSignal,
      AbortSignal.timeout(discoveryDeadline - Date.now()),
    ]);
    const collection = new JobCandidateCollection(companyName);
    const careersPages: string[] = [];
    for (const query of buildDiscoveryQueries(companyName, profile)) {
      if (discoverySignal.aborted) break;
      await this.runSearch(
        query,
        collection,
        careersPages,
        progress,
        discoverySignal,
      );
    }
    const careersHost =
      [...collection.discovered(), ...careersPages]
        .map(careersHostOf)
        .find((host) => host !== null) ?? null;
    if (
      !discoverySignal.aborted &&
      progress.searchCalls < JOB_MATCH_LIMITS.searches
    )
      await this.runSearch(
        buildRefinementQuery(companyName, careersHost, profile),
        collection,
        careersPages,
        progress,
        discoverySignal,
      );
    overallSignal.throwIfAborted();
    if (progress.successfulSearches === 0 && progress.lastSearchFailure)
      throw progress.lastSearchFailure;
    for (const careersPage of careersPages.slice(
      0,
      JOB_MATCH_LIMITS.careersPageReads,
    )) {
      if (discoverySignal.aborted) break;
      const content = await this.readPage(
        careersPage,
        collection,
        progress,
        overallSignal,
        discoverySignal,
      );
      if (content === null) continue;
      for (const link of extractJobLinks(content, careersPage))
        collection.add(link.title, link.url, '');
    }
    const remainingReads = JOB_MATCH_LIMITS.pageReads - progress.pageReads;
    const toRead = selectCandidatesForReading(
      collection.all(),
      profile,
      remainingReads,
    );
    for (
      let start = 0;
      start < toRead.length;
      start += JOB_MATCH_LIMITS.pageReadConcurrency
    ) {
      if (discoverySignal.aborted) {
        progress.timeLimited = true;
        break;
      }
      const batch = toRead.slice(
        start,
        start + JOB_MATCH_LIMITS.pageReadConcurrency,
      );
      await Promise.all(
        batch.map((candidate) =>
          this.readCandidate(
            candidate,
            collection,
            progress,
            overallSignal,
            discoverySignal,
          ),
        ),
      );
    }
    return collection;
  }

  private async runSearch(
    query: string,
    collection: JobCandidateCollection,
    careersPages: string[],
    progress: ScanProgress,
    signal: AbortSignal,
  ): Promise<void> {
    progress.searchCalls++;
    try {
      const sources = await this.tavily.searchWeb(query, signal);
      progress.successfulSearches++;
      for (const source of sources) {
        if (collection.add(source.title, source.url, source.content)) continue;
        if (
          isCareersListingUrl(source.url) &&
          !careersPages.includes(source.url)
        ) {
          collection.markDiscovered(source.url);
          careersPages.push(source.url);
        }
      }
    } catch (error) {
      if (signal.aborted) {
        progress.timeLimited = true;
        return;
      }
      progress.lastSearchFailure =
        error instanceof ResearchError
          ? error
          : new ResearchError(
              'TAVILY_FAILURE',
              'Search failed',
              HttpStatus.BAD_GATEWAY,
              error,
            );
      this.logger.debug({
        event: 'job-search-failed',
        code: progress.lastSearchFailure.code,
      });
    }
  }

  private async readPage(
    url: string,
    collection: JobCandidateCollection,
    progress: ScanProgress,
    overallSignal: AbortSignal,
    discoverySignal: AbortSignal,
  ): Promise<string | null> {
    progress.pageReads++;
    try {
      const page = await this.firecrawl.readPage(
        url,
        collection.discovered(),
        discoverySignal,
      );
      return page.content;
    } catch (error) {
      if (overallSignal.aborted) throw error;
      if (error instanceof ResearchError && error.code === 'EVIDENCE_INVALID')
        throw error;
      if (discoverySignal.aborted) progress.timeLimited = true;
      progress.failedReads++;
      this.logger.debug({
        event: 'job-page-read-failed',
        code: error instanceof ResearchError ? error.code : 'UNKNOWN',
      });
      return null;
    }
  }

  private async readCandidate(
    candidate: JobCandidate,
    collection: JobCandidateCollection,
    progress: ScanProgress,
    overallSignal: AbortSignal,
    discoverySignal: AbortSignal,
  ): Promise<void> {
    const content = await this.readPage(
      candidate.url,
      collection,
      progress,
      overallSignal,
      discoverySignal,
    );
    if (content === null) {
      candidate.readStatus = 'failed';
      return;
    }
    candidate.readStatus = 'read';
    candidate.pageContent = content.slice(0, JOB_MATCH_LIMITS.pageCharacters);
  }

  private async matchCandidates(
    companyName: string,
    profile: CandidateProfile,
    model: LanguageModel,
    collection: JobCandidateCollection,
    progress: ScanProgress,
    signal: AbortSignal,
  ): Promise<JobMatchContent> {
    const selected = selectCandidatesForMatching(
      collection.all(),
      profile,
      JOB_MATCH_LIMITS.candidatesForMatching,
    ).filter((candidate) => collection.isDiscovered(candidate.url));
    const candidatesById = new Map<string, JobCandidate>();
    selected.forEach((candidate, index) =>
      candidatesById.set(`job-${index + 1}`, candidate),
    );
    let relevantJobs: JobMatchContent['relevantJobs'] = [];
    if (candidatesById.size > 0) {
      const output = await this.assessCandidates(
        model,
        profile,
        candidatesById,
        signal,
      );
      const validated = validateJobMatches(
        output,
        candidatesById,
        profile,
        JOB_MATCH_LIMITS.returnedJobs,
      );
      if (validated.droppedAssessments > 0)
        this.logger.debug({
          event: 'job-assessments-dropped',
          count: validated.droppedAssessments,
        });
      relevantJobs = validated.jobs;
    }
    return {
      companyName,
      summary: describeMatchSummary(relevantJobs.length),
      jobsScanned: collection.size(),
      relevantJobs,
      limitations: this.describeLimitations(collection, progress, relevantJobs),
    };
  }

  private async assessCandidates(
    model: LanguageModel,
    profile: CandidateProfile,
    candidatesById: ReadonlyMap<string, JobCandidate>,
    signal: AbortSignal,
  ): Promise<LlmJobMatch> {
    const jobs = [...candidatesById.entries()].map(([jobId, candidate]) => ({
      jobId,
      title: candidate.title,
      snippet: candidate.snippet,
      pageContent: candidate.pageContent,
      evidenceLevel:
        candidate.readStatus === 'read' ? 'page-read' : 'search-snippet',
    }));
    const result = await generateText({
      model,
      system: JOB_MATCHING_PROMPT,
      prompt: JSON.stringify({ candidateProfile: profile, jobs }),
      output: Output.object({ schema: llmJobMatchSchema }),
      abortSignal: signal,
      maxRetries: 0,
      maxOutputTokens: JOB_MATCH_LIMITS.matchingTokens,
    });
    return result.output;
  }

  private describeLimitations(
    collection: JobCandidateCollection,
    progress: ScanProgress,
    relevantJobs: JobMatchContent['relevantJobs'],
  ): string[] {
    const limitations: string[] = [];
    const snippetOnly = relevantJobs.filter(
      (job) => job.evidenceLevel === 'search-snippet',
    ).length;
    if (snippetOnly === 1)
      limitations.push(
        'משרה אחת התבססה על תקציר חיפוש בלבד; כדאי לוודא שהיא עדיין פתוחה.',
      );
    if (snippetOnly > 1)
      limitations.push(
        `${snippetOnly} משרות התבססו על תקציר חיפוש בלבד; כדאי לוודא שהן עדיין פתוחות.`,
      );
    if (collection.size() === 0)
      limitations.push('לא אותרו עמודי משרות של החברה בחיפוש הנוכחי.');
    if (progress.failedReads > 0)
      limitations.push('חלק מעמודי המשרות לא נקראו בהצלחה.');
    if (progress.lastSearchFailure) limitations.push('חלק מהחיפושים נכשלו.');
    if (progress.timeLimited)
      limitations.push('הסריקה הוגבלה בזמן, ולכן לא כל המשרות נקראו.');
    limitations.push(
      'ציון ההתאמה הוא הערכה לפי דרישות המשרה והפרופיל שלך, לא מדד מדויק.',
    );
    return limitations;
  }
}
