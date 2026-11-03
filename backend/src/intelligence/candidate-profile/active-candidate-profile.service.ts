import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { candidateProfileSchema } from './candidate-profile';
import type { CandidateProfile } from './candidate-profile';
import { CandidateProfileRepository } from './candidate-profile.repository';
import { ResearchError } from '../company-intelligence/research-error';

export const ACTIVE_CANDIDATE_PROFILE_ID = 'default';

@Injectable()
export class ActiveCandidateProfileService {
  private readonly logger = new Logger(ActiveCandidateProfileService.name);

  constructor(private readonly repository: CandidateProfileRepository) {}

  async loadActiveProfile(): Promise<CandidateProfile> {
    let storedProfile: unknown;
    try {
      storedProfile = await this.repository.findProfileJson(
        ACTIVE_CANDIDATE_PROFILE_ID,
      );
    } catch (error) {
      throw new ResearchError(
        'DATABASE_FAILURE',
        'Candidate profile could not be read',
        HttpStatus.INTERNAL_SERVER_ERROR,
        error,
      );
    }
    if (storedProfile === null || storedProfile === undefined) {
      throw new ResearchError(
        'CANDIDATE_PROFILE_INVALID',
        `Candidate profile '${ACTIVE_CANDIDATE_PROFILE_ID}' was not found in candidate_profiles`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const parsed = candidateProfileSchema.safeParse(storedProfile);
    if (!parsed.success) {
      const invalidFields = [
        ...new Set(
          parsed.error.issues.map((issue) => issue.path.join('.') || 'profile'),
        ),
      ].slice(0, 5);
      this.logger.warn({
        event: 'candidate-profile-invalid',
        profileId: ACTIVE_CANDIDATE_PROFILE_ID,
        invalidFields,
      });
      throw new ResearchError(
        'CANDIDATE_PROFILE_INVALID',
        `Candidate profile '${ACTIVE_CANDIDATE_PROFILE_ID}' does not match candidateProfileSchema (fields: ${invalidFields.join(', ')})`,
        HttpStatus.SERVICE_UNAVAILABLE,
        parsed.error,
      );
    }
    if (parsed.data.status !== 'configured') {
      throw new ResearchError(
        'CANDIDATE_PROFILE_INVALID',
        `Candidate profile '${ACTIVE_CANDIDATE_PROFILE_ID}' is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return parsed.data;
  }
}
