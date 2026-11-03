import { ConfigService } from '@nestjs/config';
import { environmentSchema } from '../config/environment';
import { LlmProviders } from '../company-intelligence/llm-providers';
import {
  recruiterEmailAnalysisSchema,
  readSavedRecruiterAnalysis,
} from './recruiter-email.schema';
import { RECRUITER_RESEARCH_POLICY } from './recruiter-research-policy';

const decision = {
  companyName: 'Acme',
  roleTitle: 'Backend developer',
  recruiterName: null,
  eventType: 'RECRUITER_OUTREACH',
  stage: null,
  summary: 'Synthetic interest',
  actionRequired: false,
  requestedAction: null,
  interview: null,
  companyResearchNeeded: true,
  nextAction: 'RESEARCH_COMPANY',
  researchDepth: 'QUICK',
  researchReason: 'Concrete early opportunity',
};

describe('Recruiter research-depth contract and documented policy', () => {
  it.each(['QUICK', 'FULL'])(
    'accepts authorized %s company research',
    (researchDepth) => {
      expect(
        recruiterEmailAnalysisSchema.parse({ ...decision, researchDepth })
          .researchDepth,
      ).toBe(researchDepth);
    },
  );
  it.each([
    { ...decision, researchDepth: 'NONE' },
    { ...decision, companyName: null },
    { ...decision, companyName: ' ' },
    { ...decision, companyResearchNeeded: false },
  ])(
    'rejects an inconsistent research decision before paid research',
    (value) => {
      expect(recruiterEmailAnalysisSchema.safeParse(value).success).toBe(false);
    },
  );
  it('accepts unknown company with NONE and no research action', () => {
    expect(
      recruiterEmailAnalysisSchema.safeParse({
        ...decision,
        companyName: null,
        researchDepth: 'NONE',
        companyResearchNeeded: false,
        nextAction: 'NO_ACTION',
      }).success,
    ).toBe(true);
  });
  it('does not authorize a legacy saved research decision without a depth', () => {
    const { researchDepth, researchReason, ...legacy } = decision;
    expect(readSavedRecruiterAnalysis(legacy)).toMatchObject({
      researchDepth: 'NONE',
      companyResearchNeeded: false,
      nextAction: 'NO_ACTION',
    });
  });
  it('preserves legacy non-research actions without another analysis call', () => {
    const { researchDepth, researchReason, ...legacy } = decision;
    expect(
      readSavedRecruiterAnalysis({
        ...legacy,
        nextAction: 'MATCH_JOB_TO_PROFILE',
      }).nextAction,
    ).toBe('MATCH_JOB_TO_PROFILE');
  });
  it('does not silently repair an inconsistent modern saved decision', () => {
    expect(() =>
      readSavedRecruiterAnalysis({ ...decision, researchDepth: 'NONE' }),
    ).toThrow();
  });
  it('documents receipts, rejections, cancellation, outreach and active-interview progression without claiming model accuracy', () => {
    for (const clause of [
      'NONE: receipts, final rejections',
      'pure cancellation without replacement/next step',
      'QUICK: direct recruiter outreach',
      'FULL: an interview invitation',
      'rescheduling an interview that remains active',
      'Unknown/blank company identity requires NONE',
    ]) {
      expect(RECRUITER_RESEARCH_POLICY).toContain(clause);
    }
  });
  it('defaults only autonomous research to DeepSeek Flash and retains Luna/Terra', () => {
    const config = environmentSchema.parse({
      INTELLIGENCE_DB_HOST: 'localhost',
      INTELLIGENCE_DB_PORT: 5432,
      INTELLIGENCE_DB_USERNAME: 'test',
      INTELLIGENCE_DB_PASSWORD: 'test',
      INTELLIGENCE_DB_DATABASE: 'test',
      GOOGLE_CLIENT_ID: 'synthetic-client',
      GOOGLE_CLIENT_SECRET: 'synthetic-secret',
      GOOGLE_REFRESH_TOKEN: 'synthetic-refresh',
    });
    expect(config.RECRUITER_RESEARCH_PROVIDER).toBe('deepseek');
    expect(config.RECRUITER_RESEARCH_MODEL).toBe('deepseek-flash');
    expect(config.RECRUITER_CHEAP_MODEL).toBe('gpt-6-luna');
    expect(config.RECRUITER_ANALYSIS_MODEL).toBe('gpt-6.1-terra');
    const providers = new LlmProviders(
      new ConfigService({ ...config, DEEPSEEK_API_KEY: 'synthetic' }),
    );
    expect(
      providers.model(
        config.RECRUITER_RESEARCH_PROVIDER,
        config.RECRUITER_RESEARCH_MODEL,
      ).modelId,
    ).toBe('deepseek-flash');
    expect(
      environmentSchema.safeParse({
        ...config,
        RECRUITER_RESEARCH_PROVIDER: 'unknown',
      }).success,
    ).toBe(false);
  });
});
