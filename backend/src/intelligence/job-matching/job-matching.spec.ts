import {
  buildMatchedJob,
  buildSkillIndex,
  computeMatchScore,
  MATCH_LEVEL_MINIMUM_SCORES,
  validateJobMatches,
  validateRequirement,
} from './job-matching';
import type { JobCandidate } from './job-discovery';
import type {
  LlmJobAssessment,
  LlmRequirementAssessment,
} from './job-match.schema';
import { configuredProfileFixture as profile } from '../../test/candidate-profile.fixture';

const skillIndex = buildSkillIndex(profile);

function requirement(
  name: string,
  relation: LlmRequirementAssessment['relation'],
  profileSkills: string[] = [],
  note: string | null = null,
): LlmRequirementAssessment {
  return {
    requirement: name,
    importance: 'required',
    relation,
    profileSkills,
    note,
  };
}

function assessment(
  overrides: Partial<LlmJobAssessment> = {},
): LlmJobAssessment {
  return {
    jobId: 'job-1',
    title: 'Senior Backend Engineer',
    team: 'Data Security Platform',
    location: 'Herzliya',
    locationRegion: 'israel',
    workModel: 'Hybrid',
    workArrangement: 'unknown',
    officeDaysPerWeek: null,
    roleFit: 'core',
    seniorityFit: 'match',
    vacancyStatus: 'appears-open',
    requirements: [
      requirement('Java', 'direct', ['Java']),
      requirement('Kubernetes', 'direct', ['Kubernetes']),
    ],
    matchSummary: 'התפקיד מתאים לניסיון שלך ב-Java ו-Kubernetes.',
    concerns: [],
    ...overrides,
  };
}

function candidate(url = 'https://jobs.lever.co/acme/1'): JobCandidate {
  return {
    url,
    title: 'Senior Backend Engineer',
    snippet: 'Herzliya',
    pageContent: 'Job page',
    readStatus: 'read',
  };
}

function score(overrides: Partial<LlmJobAssessment>): number {
  const job = assessment(overrides);
  const requirements = job.requirements.map((item) =>
    validateRequirement(item, skillIndex)!,
  );
  return computeMatchScore(job, requirements, profile);
}

describe('Job matching rubric', () => {
  it('counts exact profile skills as matched and scores them positively', () => {
    const direct = score({});
    const unrelatedRequirements = score({
      requirements: [
        requirement('Rust', 'unknown'),
        requirement('Scala', 'unknown'),
      ],
    });
    expect(direct).toBeGreaterThan(unrelatedRequirements);
    const job = buildMatchedJob(assessment(), candidate(), profile, skillIndex);
    expect(job?.matchedSkills).toEqual(['Java', 'Kubernetes']);
    expect(job?.matchLevel).toBe('strong');
  });

  it('treats limitedExperience as partial experience, not as no experience', () => {
    const limited = validateRequirement(
      requirement('Elasticsearch', 'limited', ['Elasticsearch']),
      skillIndex,
    );
    expect(limited?.relation).toBe('limited');
    const limitedScore = score({
      requirements: [
        requirement('Elasticsearch', 'limited', ['Elasticsearch']),
      ],
    });
    const noneScore = score({
      requirements: [requirement('Go', 'none', ['Go'])],
    });
    expect(limitedScore).toBeGreaterThan(noneScore);
    const job = buildMatchedJob(
      assessment({
        requirements: [
          requirement('Elasticsearch', 'limited', ['Elasticsearch']),
        ],
      }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.gaps).toEqual(['Elasticsearch – ניסיון מוגבל']);
    expect(job?.matchedSkills).toEqual([]);
  });

  it('treats a skill missing from the profile as unknown rather than a gap', () => {
    const claimedNone = validateRequirement(
      requirement('Rust', 'none', ['Rust']),
      skillIndex,
    );
    expect(claimedNone).toMatchObject({
      relation: 'unknown',
      profileSkills: [],
    });
    const job = buildMatchedJob(
      assessment({ requirements: [requirement('Rust', 'none', ['Rust'])] }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.gaps).toEqual([]);
  });

  it('allows an explicit noExperience skill to become a gap', () => {
    const job = buildMatchedJob(
      assessment({
        requirements: [
          requirement('Java', 'direct', ['Java']),
          requirement('Go', 'none', ['Go']),
        ],
      }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.gaps).toEqual(['Go – אין ניסיון לפי הפרופיל']);
  });

  it('recognizes GCP as transferable cloud experience for an AWS requirement', () => {
    const job = buildMatchedJob(
      assessment({
        requirements: [
          requirement('Java', 'direct', ['Java']),
          requirement(
            'AWS',
            'transferable',
            ['GCP'],
            'ניסיון GCP רלוונטי למרות שהמשרה משתמשת ב-AWS',
          ),
        ],
      }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.transferableExperience).toEqual([
      'ניסיון GCP רלוונטי למרות שהמשרה משתמשת ב-AWS',
    ]);
    expect(job?.matchedSkills).not.toContain('AWS');
    const transferableScore = score({
      requirements: [requirement('AWS', 'transferable', ['GCP'])],
    });
    const unknownScore = score({
      requirements: [requirement('AWS', 'unknown')],
    });
    expect(transferableScore).toBeGreaterThan(unknownScore);
  });

  it('recognizes Pub/Sub as transferable messaging experience for Kafka', () => {
    const kafka = validateRequirement(
      requirement('Kafka', 'transferable', ['pub/sub']),
      skillIndex,
    );
    expect(kafka).toMatchObject({
      relation: 'transferable',
      profileSkills: ['Pub/Sub'],
    });
    const job = buildMatchedJob(
      assessment({
        requirements: [requirement('Kafka', 'transferable', ['Pub/Sub'])],
      }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.transferableExperience).toEqual(['Pub/Sub רלוונטי ל-Kafka']);
  });

  it('lowers the fit for an explicit 4–5 office-day requirement', () => {
    const heavyOffice = score({
      workArrangement: 'hybrid',
      officeDaysPerWeek: 4,
    });
    const flexible = score({ workArrangement: 'hybrid', officeDaysPerWeek: 2 });
    expect(heavyOffice).toBeLessThan(flexible);
    const job = buildMatchedJob(
      assessment({ workArrangement: 'onsite', officeDaysPerWeek: 5 }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.concerns).toContain('המשרה דורשת 5 ימים במשרד בשבוע');
  });

  it('does not penalize an unknown work model', () => {
    const unknownWorkModel = score({
      workArrangement: 'unknown',
      officeDaysPerWeek: null,
    });
    const heavyOffice = score({
      workArrangement: 'onsite',
      officeDaysPerWeek: 5,
    });
    expect(unknownWorkModel).toBeGreaterThan(heavyOffice);
    expect(unknownWorkModel).toBeGreaterThanOrEqual(
      MATCH_LEVEL_MINIMUM_SCORES.strong,
    );
  });

  it('never returns matched skills that are absent from the profile', () => {
    const job = buildMatchedJob(
      assessment({
        requirements: [
          requirement('Go', 'direct', ['Go']),
          requirement('Rust', 'direct', ['Rust']),
          requirement('Java', 'direct', ['java']),
        ],
      }),
      candidate(),
      profile,
      skillIndex,
    );
    expect(job?.matchedSkills).toEqual(['Java']);
  });

  it('sorts results deterministically by matchScore descending', () => {
    const candidatesById = new Map([
      ['job-1', candidate('https://jobs.lever.co/acme/1')],
      ['job-2', candidate('https://jobs.lever.co/acme/2')],
      ['job-3', candidate('https://jobs.lever.co/acme/3')],
    ]);
    const { jobs } = validateJobMatches(
      {
        jobs: [
          assessment({
            jobId: 'job-1',
            roleFit: 'adjacent',
            title: 'Data Platform Engineer',
          }),
          assessment({ jobId: 'job-2', title: 'Senior Backend Engineer' }),
          assessment({
            jobId: 'job-3',
            roleFit: 'adjacent',
            seniorityFit: 'unknown',
            title: 'Platform Engineer',
          }),
        ],
      },
      candidatesById,
      profile,
      10,
    );
    const scores = jobs.map((job) => job.matchScore);
    expect(scores).toEqual([...scores].sort((first, second) => second - first));
    expect(jobs[0].url).toBe('https://jobs.lever.co/acme/2');
  });

  it('drops assessments for unknown job ids and duplicates without failing the scan', () => {
    const candidatesById = new Map([['job-1', candidate()]]);
    const result = validateJobMatches(
      {
        jobs: [
          assessment({ jobId: 'job-99' }),
          assessment({ jobId: 'job-1' }),
          assessment({ jobId: 'job-1' }),
        ],
      },
      candidatesById,
      profile,
      10,
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.droppedAssessments).toBe(2);
  });

  it('excludes unrelated, closed and low-scoring roles from the relevant list', () => {
    expect(
      buildMatchedJob(
        assessment({ roleFit: 'unrelated' }),
        candidate(),
        profile,
        skillIndex,
      ),
    ).toBeNull();
    expect(
      buildMatchedJob(
        assessment({ vacancyStatus: 'closed' }),
        candidate(),
        profile,
        skillIndex,
      ),
    ).toBeNull();
    expect(
      buildMatchedJob(
        assessment({
          roleFit: 'weak',
          seniorityFit: 'below',
          locationRegion: 'abroad',
          requirements: [requirement('Go', 'none', ['Go'])],
        }),
        candidate(),
        profile,
        skillIndex,
      ),
    ).toBeNull();
  });
});
