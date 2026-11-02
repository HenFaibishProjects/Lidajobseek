import { ResearchHandoffService } from '../handoff/research-handoff.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { CompanyIntelligenceService } from '../../company-intelligence/company-intelligence.service';
import { JobMatchingService } from '../../job-matching/job-matching.service';
import { ResearchError } from '../../company-intelligence/research-error';
import { RecruiterAgentActionEntity } from '../action/recruiter-agent-action.entity';
import { RecruiterAgentActionRepository } from '../action/recruiter-agent-action.repository';
import {
  RecruiterAgentActionStatus,
  RecruiterAgentActionError,
} from '../action/recruiter-agent-action.types';
import type { RecruiterAgentActionType } from '../action/recruiter-agent-action.types';
import type { RecruiterEmailAnalysis } from '../recruiter-email.schema';
import { RecruiterAgentActionService } from './recruiter-agent-action.service';

const analysis: RecruiterEmailAnalysis = {
  companyName: 'Acme',
  roleTitle: 'Backend developer',
  recruiterName: null,
  eventType: 'RECRUITER_OUTREACH',
  stage: null,
  summary: 'Personal interest',
  actionRequired: false,
  requestedAction: null,
  interview: null,
  companyResearchNeeded: true,
  researchDepth: 'QUICK',
  researchReason: 'Active interview warrants research',
  nextAction: 'RESEARCH_COMPANY',
};

const report = {
  id: 'saved-report',
  companyName: 'Acme',
  researchedAt: '2026-10-31T12:00:00.000Z',
  cache: { company: 'hit', roles: 'hit' },
  companySummary: 'Full report stays in its existing storage.',
};
const matches = {
  companyName: 'Acme',
  summary: 'One relevant role',
  jobsScanned: 4,
  relevantJobs: [{ title: 'Backend developer' }],
  cache: { status: 'hit', refreshedAt: '2026-10-31T12:00:00.000Z' },
};

function setup(actionType: RecruiterAgentActionType = 'RESEARCH_COMPANY') {
  const pending = {
    id: 'action-id',
    gmailMessageId: 'synthetic-message',
    actionType,
    status: RecruiterAgentActionStatus.PENDING,
    attempts: 0,
    emailProcessingAttempt: null,
    result: null,
    error: null,
  } as RecruiterAgentActionEntity;
  const running = {
    ...pending,
    status: RecruiterAgentActionStatus.RUNNING,
    attempts: 1,
    emailProcessingAttempt: 1,
  };
  const actions = {
    createOrFind: jest.fn().mockResolvedValue(pending),
    claim: jest.fn().mockResolvedValue(running),
    find: jest.fn().mockResolvedValue(running),
    complete: jest.fn().mockImplementation(async (action, result) => ({
      ...action,
      status: RecruiterAgentActionStatus.COMPLETED,
      result,
    })),
    defer: jest.fn().mockImplementation(async (action) => ({
      ...action,
      status: RecruiterAgentActionStatus.DEFERRED,
      result: { reason: 'Action execution is not implemented yet.' },
    })),
    fail: jest.fn().mockResolvedValue(undefined),
    recoverExhausted: jest.fn().mockResolvedValue(undefined),
  };
  const companies = { research: jest.fn().mockResolvedValue(report) };
  const jobs = { match: jest.fn().mockResolvedValue(matches) };
  const handoffs = {
    findFreshResearch: jest.fn().mockResolvedValue(null),
    ensure: jest.fn().mockResolvedValue({
      id: 'handoff-id',
      existingReportId: null,
      status: 'PENDING_CHATGPT',
    }),
  };
  const service = new RecruiterAgentActionService(
    actions as unknown as RecruiterAgentActionRepository,
    companies as unknown as CompanyIntelligenceService,
    jobs as unknown as JobMatchingService,
    new ConfigService(),
    handoffs as unknown as ResearchHandoffService,
  );
  return { service, actions, companies, jobs, running, pending, handoffs };
}

describe('Recruiter safe action executor', () => {
  it('FULL obtains QUICK research before creating a handoff without calling DEEP', async () => {
    const s = setup();
    const result = await s.service.execute(
      'synthetic-message',
      { ...analysis, researchDepth: 'FULL' },
      1,
    );
    expect(s.handoffs.ensure).toHaveBeenCalledWith(
      'synthetic-message',
      expect.objectContaining({ researchDepth: 'FULL' }),
      report,
    );
    expect(result.result).toMatchObject({
      handoffId: 'handoff-id',
      researchDepth: 'FULL',
    });
    expect(s.companies.research).toHaveBeenCalledWith(
      expect.any(Object),
      'QUICK',
      { modelName: 'deepseek-flash', companyOnly: true },
    );
    expect(s.companies.research.mock.invocationCallOrder[0]).toBeLessThan(
      s.handoffs.ensure.mock.invocationCallOrder[0],
    );
    expect(s.jobs.match).not.toHaveBeenCalled();
  });

  it.each(['QUICK'] as const)(
    'executes the supplied %s decision using DeepSeek Flash and company-only research',
    async (researchDepth) => {
      const s = setup();
      const completed = await s.service.execute(
        'synthetic-message',
        { ...analysis, researchDepth },
        1,
      );
      expect(s.companies.research).toHaveBeenCalledWith(
        {
          companyName: 'Acme',
          role: 'Backend developer',
          provider: 'deepseek',
          forceRefresh: false,
        },
        researchDepth === 'QUICK' ? 'QUICK' : 'QUICK',
        { modelName: 'deepseek-flash', companyOnly: true },
      );
      expect(completed.result).toMatchObject({
        researchDepth,
        reportId: report.id,
      });
      expect(s.jobs.match).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['application receipt', 'NONE', 'NO_ACTION', 'Acme'],
    ['final rejection', 'NONE', 'NO_ACTION', 'Acme'],
    ['outreach', 'QUICK', 'RESEARCH_COMPANY', 'Acme'],
    ['interview invitation', 'FULL', 'RESEARCH_COMPANY', 'Acme'],
    ['active interview reschedule', 'FULL', 'RESEARCH_COMPANY', 'Acme'],
    ['cancellation without next step', 'NONE', 'NO_ACTION', 'Acme'],
    ['unknown company', 'NONE', 'NO_ACTION', null],
  ] as const)(
    'routes supplied policy example %s; mocked decisions are not classification-accuracy evidence',
    async (_name, researchDepth, nextAction, companyName) => {
      const s = setup(nextAction);
      await s.service.execute(
        'synthetic-message',
        {
          ...analysis,
          researchDepth,
          nextAction,
          companyName,
          companyResearchNeeded: researchDepth !== 'NONE',
        },
        1,
      );
      expect(s.companies.research).toHaveBeenCalledTimes(
        researchDepth === 'NONE' ? 0 : 1,
      );
    },
  );

  it('records a completion-write failure and preserves the error cause for retry', async () => {
    const s = setup();
    const storageFailure = new Error('Storage unavailable');
    s.actions.complete.mockRejectedValueOnce(storageFailure);
    await expect(
      s.service.execute('synthetic-message', analysis, 1),
    ).rejects.toMatchObject({
      message: 'RESEARCH_COMPANY execution failed.',
      cause: storageFailure,
    });
    expect(s.actions.fail).toHaveBeenCalledWith(
      s.running,
      expect.any(RecruiterAgentActionError),
    );
    expect(s.companies.research).toHaveBeenCalledTimes(1);
  });

  it('delegates unified company research with cache enabled and stores only report metadata', async () => {
    const s = setup();
    const result = await s.service.execute('synthetic-message', analysis, 1);
    expect(s.actions.claim).toHaveBeenCalledWith(
      'synthetic-message',
      'RESEARCH_COMPANY',
      1,
    );
    expect(s.companies.research).toHaveBeenCalledTimes(1);
    expect(s.companies.research).toHaveBeenCalledWith(
      {
        companyName: 'Acme',
        role: 'Backend developer',
        provider: 'deepseek',
        forceRefresh: false,
      },
      'QUICK',
      { modelName: 'deepseek-flash', companyOnly: true },
    );
    expect(s.actions.complete).toHaveBeenCalledWith(s.running, {
      reportId: report.id,
      companyName: report.companyName,
      researchedAt: report.researchedAt,
      researchDepth: 'QUICK',
      cache: report.cache,
    });
    expect(result.status).toBe('COMPLETED');
    expect(result.result).not.toHaveProperty('companySummary');
    expect(s.jobs.match).not.toHaveBeenCalled();
  });

  it('passes an absent role as undefined', async () => {
    const s = setup();
    await s.service.execute(
      'synthetic-message',
      { ...analysis, roleTitle: null },
      1,
    );
    expect(s.companies.research).toHaveBeenCalledWith(
      expect.objectContaining({ role: undefined }),
      'QUICK',
      { modelName: 'deepseek-flash', companyOnly: true },
    );
  });

  it.each(['RESEARCH_COMPANY', 'MATCH_JOB_TO_PROFILE'] as const)(
    '%s fails deterministically when company name is absent or blank',
    async (actionType) => {
      for (const companyName of [null, '', '  ']) {
        const s = setup(actionType);
        await expect(
          s.service.execute(
            'synthetic-message',
            {
              ...analysis,
              nextAction: actionType,
              companyName,
              researchDepth: 'NONE',
            },
            1,
          ),
        ).rejects.toThrow(
          actionType === 'RESEARCH_COMPANY'
            ? 'Company research requires QUICK/FULL'
            : `Company name is required for ${actionType}`,
        );
        if (actionType === 'RESEARCH_COMPANY')
          expect(s.actions.fail).not.toHaveBeenCalled();
        else
          expect(s.actions.fail).toHaveBeenCalledWith(
            s.running,
            expect.any(RecruiterAgentActionError),
          );
        expect(s.actions.complete).not.toHaveBeenCalled();
        expect(s.companies.research).not.toHaveBeenCalled();
        expect(s.jobs.match).not.toHaveBeenCalled();
      }
    },
  );

  it('delegates job matching with cache enabled and saves counts rather than another job result store', async () => {
    const s = setup('MATCH_JOB_TO_PROFILE');
    const result = await s.service.execute(
      'synthetic-message',
      { ...analysis, nextAction: 'MATCH_JOB_TO_PROFILE' },
      1,
    );
    expect(s.jobs.match).toHaveBeenCalledTimes(1);
    expect(s.jobs.match).toHaveBeenCalledWith({
      companyName: 'Acme',
      provider: 'openai',
      forceRefresh: false,
    });
    expect(result).toEqual({
      status: 'COMPLETED',
      result: {
        companyName: matches.companyName,
        summary: matches.summary,
        jobsScanned: 4,
        relevantJobCount: 1,
        cache: matches.cache,
      },
    });
    expect(s.actions.complete).toHaveBeenCalledWith(s.running, result.result);
    expect(s.companies.research).not.toHaveBeenCalled();
  });

  it.each(['RESEARCH_COMPANY', 'MATCH_JOB_TO_PROFILE'] as const)(
    'reuses completed %s without external calls',
    async (actionType) => {
      const s = setup(actionType);
      const storedResult = { saved: true };
      s.actions.createOrFind.mockResolvedValue({
        ...s.pending,
        status: 'COMPLETED',
        result: storedResult,
      });
      await expect(
        s.service.execute(
          'synthetic-message',
          { ...analysis, nextAction: actionType },
          2,
        ),
      ).resolves.toEqual({ status: 'COMPLETED', result: storedResult });
      expect(s.actions.claim).not.toHaveBeenCalled();
      expect(s.companies.research).not.toHaveBeenCalled();
      expect(s.jobs.match).not.toHaveBeenCalled();
    },
  );

  it.each(['NO_ACTION', 'USE_EXISTING_COMPANY'] as const)(
    '%s completes without external work',
    async (nextAction) => {
      const s = setup(nextAction);
      await expect(
        s.service.execute('synthetic-message', { ...analysis, nextAction }, 1),
      ).resolves.toMatchObject({ status: 'COMPLETED' });
      expect(s.actions.complete).toHaveBeenCalledTimes(1);
      expect(s.companies.research).not.toHaveBeenCalled();
      expect(s.jobs.match).not.toHaveBeenCalled();
    },
  );

  it.each(['DRAFT_REPLY', 'PREPARE_INTERVIEW_CONTEXT'] as const)(
    '%s is explicitly deferred without external work',
    async (nextAction) => {
      const s = setup(nextAction);
      await expect(
        s.service.execute('synthetic-message', { ...analysis, nextAction }, 1),
      ).resolves.toEqual({
        status: 'DEFERRED',
        result: { reason: 'Action execution is not implemented yet.' },
      });
      expect(s.actions.defer).toHaveBeenCalledWith(s.running);
      expect(s.actions.complete).not.toHaveBeenCalled();
      expect(s.companies.research).not.toHaveBeenCalled();
      expect(s.jobs.match).not.toHaveBeenCalled();
    },
  );

  it('reuses deferred actions without another claim', async () => {
    const s = setup('DRAFT_REPLY');
    s.actions.createOrFind.mockResolvedValue({
      ...s.pending,
      status: 'DEFERRED',
      result: { reason: 'Not implemented' },
    });
    await expect(
      s.service.execute(
        'synthetic-message',
        { ...analysis, nextAction: 'DRAFT_REPLY' },
        2,
      ),
    ).resolves.toMatchObject({ status: 'DEFERRED' });
    expect(s.actions.claim).not.toHaveBeenCalled();
    expect(s.actions.defer).not.toHaveBeenCalled();
  });

  it('does not bypass a running, exhausted or unowned action', async () => {
    const s = setup();
    s.actions.claim.mockResolvedValue(null);
    await expect(
      s.service.execute('synthetic-message', analysis, 1),
    ).rejects.toThrow('already running, exhausted');
    expect(s.companies.research).not.toHaveBeenCalled();
    expect(s.jobs.match).not.toHaveBeenCalled();
    expect(s.actions.fail).not.toHaveBeenCalled();
  });

  it('reuses a concurrent completion discovered after losing a claim', async () => {
    const s = setup();
    s.actions.claim.mockResolvedValue(null);
    s.actions.find.mockResolvedValue({
      ...s.pending,
      status: 'COMPLETED',
      result: { reportId: 'concurrent' },
    });
    await expect(
      s.service.execute('synthetic-message', analysis, 1),
    ).resolves.toEqual({
      status: 'COMPLETED',
      result: { reportId: 'concurrent' },
    });
    expect(s.companies.research).not.toHaveBeenCalled();
  });

  it.each(['RESEARCH_COMPANY', 'MATCH_JOB_TO_PROFILE'] as const)(
    'persists a safe %s failure and retains its cause without logging private provider content',
    async (nextAction) => {
      const s = setup(nextAction);
      const privateFailure = new ResearchError(
        'LLM_FAILURE',
        'private body secret-key',
        undefined,
        new Error('private'),
      );
      s.companies.research.mockRejectedValue(privateFailure);
      s.jobs.match.mockRejectedValue(privateFailure);
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      try {
        let failure: unknown;
        try {
          await s.service.execute(
            'synthetic-message',
            { ...analysis, nextAction },
            1,
          );
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(RecruiterAgentActionError);
        expect((failure as Error).cause).toBe(privateFailure);
        expect(s.actions.fail).toHaveBeenCalledWith(s.running, failure);
        expect((failure as Error).message).toBe(
          `${nextAction} execution failed (LLM_FAILURE).`,
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain('private');
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret-key');
      } finally {
        log.mockRestore();
      }
    },
  );
});
