import { RecruiterEmailPipelineService } from './recruiter-email-pipeline.service';
import { RecruiterEmailDecisionService } from './recruiter-email-decision.service';
import { RecruiterAgentActionService } from './recruiter-agent-action.service';
import { EmailProcessingAuditService } from '../audit/email-processing-audit.service';
import { EmailFilterDecision } from '../recruiter-agent.types';
import type { RecruiterEmailDecision } from '../recruiter-email-decision.schema';
import { readFileSync } from 'node:fs';

export const decision: RecruiterEmailDecision = {
  isRelevant: true,
  confidence: 0.9,
  companyName: 'Acme',
  roleTitle: 'Developer',
  recruiterName: null,
  eventType: 'INTERVIEW_SCHEDULING',
  stage: null,
  summary: 'Scheduling',
  actionRequired: true,
  requestedAction: 'Choose a slot',
  interview: null,
  companyResearchNeeded: true,
  researchDepth: 'FULL',
  researchReason: 'Active interview',
  nextAction: 'RESEARCH_COMPANY',
};
const email = {
  id: 'synthetic',
  from: 'a@example.com',
  subject: 'Interview',
  body: 'Synthetic',
  receivedAt: new Date(),
};
const pass = {
  shouldAnalyze: true,
  decision: EmailFilterDecision.PASS,
  reasons: [],
};
function setup() {
  const state: {
    processingAttempts: number;
    decisionLlmResult: RecruiterEmailDecision | null;
    expensiveLlmResult?: unknown;
    cheapLlmClassification?: unknown;
  } = { processingAttempts: 1, decisionLlmResult: null };
  const audit = {
    create: jest.fn(),
    claim: jest.fn().mockImplementation(async () => state),
    saveDecisionLlmResult: jest.fn().mockImplementation(async (_id, result) => {
      state.decisionLlmResult = result;
    }),
    complete: jest.fn(),
    fail: jest.fn(),
  };
  const decisions = { decide: jest.fn().mockResolvedValue(decision) };
  const actions = {
    execute: jest.fn(),
    recoverExhausted: jest.fn(),
    deferLegacyResearch: jest.fn(),
  };
  const pipeline = new RecruiterEmailPipelineService(
    audit as unknown as EmailProcessingAuditService,
    decisions as unknown as RecruiterEmailDecisionService,
    actions as unknown as RecruiterAgentActionService,
  );
  return { pipeline, audit, decisions, actions, state };
}
describe('One-decision recruiter pipeline (scripted results verify routing, not model accuracy)', () => {
  it.each(['QUICK', 'FULL'] as const)(
    'uses one decision, saves it before %s execution and completes afterwards',
    async (researchDepth) => {
      const s = setup();
      s.decisions.decide.mockResolvedValue({ ...decision, researchDepth });
      await s.pipeline.process(email, pass);
      expect(s.decisions.decide).toHaveBeenCalledTimes(1);
      expect(s.actions.execute).toHaveBeenCalledWith(
        email.id,
        { ...decision, researchDepth },
        1,
      );
      expect(
        s.audit.saveDecisionLlmResult.mock.invocationCallOrder[0],
      ).toBeLessThan(s.actions.execute.mock.invocationCallOrder[0]);
      expect(s.actions.execute.mock.invocationCallOrder[0]).toBeLessThan(
        s.audit.complete.mock.invocationCallOrder[0],
      );
    },
  );
  it.each([true, false])(
    'NONE stops, including relevance=%s',
    async (isRelevant) => {
      const s = setup();
      s.decisions.decide.mockResolvedValue({
        ...decision,
        isRelevant,
        researchDepth: 'NONE',
        nextAction: 'NO_ACTION',
        companyResearchNeeded: false,
      });
      await s.pipeline.process(email, pass);
      expect(s.actions.execute).not.toHaveBeenCalled();
    },
  );
  it('reuses saved decision after an action failure without another LLM call', async () => {
    const s = setup();
    s.actions.execute.mockRejectedValueOnce(new Error('action unavailable'));
    await expect(s.pipeline.process(email, pass)).rejects.toThrow(
      'action unavailable',
    );
    s.state.processingAttempts = 2;
    await s.pipeline.process(email, pass);
    expect(s.decisions.decide).toHaveBeenCalledTimes(1);
    expect(s.actions.execute).toHaveBeenLastCalledWith(email.id, decision, 2);
    expect(s.audit.fail).toHaveBeenCalledTimes(1);
  });
  it('does not call a model or action for completed/unclaimable emails', async () => {
    const s = setup();
    s.audit.claim.mockResolvedValue(null);
    await s.pipeline.process(email, pass);
    expect(s.decisions.decide).not.toHaveBeenCalled();
    expect(s.actions.execute).not.toHaveBeenCalled();
  });
  it('deterministically blocked emails never call the decision model', async () => {
    const s = setup();
    await s.pipeline.process(email, { ...pass, shouldAnalyze: false });
    expect(s.decisions.decide).not.toHaveBeenCalled();
    expect(s.actions.execute).not.toHaveBeenCalled();
  });
  it('does not escalate a failed decision call', async () => {
    const s = setup();
    s.decisions.decide.mockRejectedValue(new Error('invalid output'));
    await expect(s.pipeline.process(email, pass)).rejects.toThrow(
      'invalid output',
    );
    expect(s.actions.execute).not.toHaveBeenCalled();
    expect(s.audit.saveDecisionLlmResult).not.toHaveBeenCalled();
  });
  it('reads saved legacy Terra data without invoking either legacy model', async () => {
    const s = setup();
    const { isRelevant, confidence, ...legacy } = decision;
    s.state.expensiveLlmResult = legacy;
    await s.pipeline.process(email, pass);
    expect(s.decisions.decide).not.toHaveBeenCalled();
    expect(s.actions.execute).toHaveBeenCalled();
  });
  it('legacy research without depth is deferred without new paid work', async () => {
    const s = setup();
    const { researchDepth, researchReason, isRelevant, confidence, ...legacy } =
      decision;
    s.state.expensiveLlmResult = legacy;
    await s.pipeline.process(email, pass);
    expect(s.actions.deferLegacyResearch).toHaveBeenCalledWith(email.id, 1);
    expect(s.actions.execute).not.toHaveBeenCalled();
    expect(s.decisions.decide).not.toHaveBeenCalled();
  });
  it('legacy irrelevant Luna results stop without any new LLM call', async () => {
    const s = setup();
    s.state.cheapLlmClassification = {
      isRelevant: false,
      confidence: 0.9,
      companyName: 'Acme',
      roleTitle: null,
      reason: 'Receipt',
    };
    await s.pipeline.process(email, pass);
    expect(s.decisions.decide).not.toHaveBeenCalled();
    expect(s.actions.execute).not.toHaveBeenCalled();
  });
  it('active module and pipeline do not register or invoke Luna/Terra services', () => {
    for (const path of [
      '../recruiter-agent.module.ts',
      './recruiter-email-pipeline.service.ts',
    ]) {
      const source = readFileSync(require.resolve(path), 'utf8');
      expect(source).not.toMatch(
        /RecruiterEmailCheapClassifierService|RecruiterEmailAnalyzerService/,
      );
    }
  });
});
