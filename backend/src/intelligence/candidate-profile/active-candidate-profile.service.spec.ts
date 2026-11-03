import { DataSource } from 'typeorm';
import {
  ACTIVE_CANDIDATE_PROFILE_ID,
  ActiveCandidateProfileService,
} from './active-candidate-profile.service';
import { CandidateProfileEntity } from './candidate-profile.entity';
import { CandidateProfileRepository } from './candidate-profile.repository';
import type { CandidateProfile } from './candidate-profile';
import { ResearchError } from '../company-intelligence/research-error';

const storedProfile: CandidateProfile = {
  status: 'configured',
  preferredRoles: ['Senior Backend Engineer'],
  seniority: 'Senior',
  backendExperience: { years: 8, level: 'Senior' },
  programmingLanguages: ['Java'],
  frameworks: ['Spring Boot'],
  databases: ['PostgreSQL'],
  cloud: ['GCP'],
  infrastructure: ['Kubernetes'],
  distributedSystems: ['Microservices'],
  messagingAndData: ['Pub/Sub'],
  strengths: ['Production ownership'],
  limitedExperience: ['Elasticsearch'],
  noExperience: ['iOS'],
  workPreferences: {
    locations: ['Herzliya'],
    workModels: ['Hybrid'],
    notes: null,
  },
};

function setup(profileJson: unknown) {
  const findOne = jest
    .fn()
    .mockResolvedValue(
      profileJson === null
        ? null
        : { id: ACTIVE_CANDIDATE_PROFILE_ID, profile: profileJson },
    );
  const getRepository = jest.fn().mockReturnValue({ findOne });
  const repository = new CandidateProfileRepository({
    getRepository,
  } as unknown as DataSource);
  const service = new ActiveCandidateProfileService(repository);
  return { service, findOne, getRepository };
}

async function expectProfileError(
  promise: Promise<unknown>,
  message: string,
): Promise<void> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ResearchError);
  expect(error).toMatchObject({ code: 'CANDIDATE_PROFILE_INVALID' });
  expect((error as ResearchError).getStatus()).toBe(503);
  expect((error as ResearchError).message).toContain(message);
}

describe('Active candidate profile from PostgreSQL', () => {
  it("loads the row with id 'default' from candidate_profiles", async () => {
    const context = setup(storedProfile);
    await context.service.loadActiveProfile();
    expect(context.getRepository).toHaveBeenCalledWith(CandidateProfileEntity);
    expect(context.findOne).toHaveBeenCalledWith({
      select: { id: true, profile: true },
      where: { id: 'default' },
    });
  });

  it('validates the stored JSON with candidateProfileSchema', async () => {
    const context = setup({ ...storedProfile, seniority: '  Senior  ' });
    const profile = await context.service.loadActiveProfile();
    expect(profile.seniority).toBe('Senior');
    expect(profile.cloud).toEqual(['GCP']);
  });

  it('returns a clear CANDIDATE_PROFILE_INVALID error when the row is missing', async () => {
    const context = setup(null);
    await expectProfileError(
      context.service.loadActiveProfile(),
      "Candidate profile 'default' was not found",
    );
  });

  it('returns a clear CANDIDATE_PROFILE_INVALID error for an invalid profile JSON', async () => {
    const context = setup({ ...storedProfile, cloud: 'GCP', unexpected: true });
    await expectProfileError(
      context.service.loadActiveProfile(),
      'does not match candidateProfileSchema',
    );
  });

  it('refuses a profile that is not configured instead of falling back to a placeholder', async () => {
    const context = setup({ ...storedProfile, status: 'not-configured' });
    await expectProfileError(
      context.service.loadActiveProfile(),
      'is not configured',
    );
  });

  it('reports a database read failure as DATABASE_FAILURE', async () => {
    const context = setup(storedProfile);
    context.findOne.mockRejectedValue(new Error('connection refused'));
    await expect(context.service.loadActiveProfile()).rejects.toMatchObject({
      code: 'DATABASE_FAILURE',
    });
  });
});
