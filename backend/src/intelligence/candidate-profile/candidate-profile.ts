import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const entries = z.array(z.string().trim().min(1).max(300)).max(30);
export const candidateProfileStatusSchema = z.enum([
  'not-configured',
  'configured',
]);
export const candidateProfileSchema = z
  .strictObject({
    status: candidateProfileStatusSchema,
    preferredRoles: entries,
    seniority: z.string().trim().min(1).nullable(),
    backendExperience: z.strictObject({
      years: z.number().min(0).max(80).nullable(),
      level: z.string().trim().min(1).nullable(),
    }),
    programmingLanguages: entries,
    frameworks: entries,
    databases: entries,
    cloud: entries,
    infrastructure: entries,
    distributedSystems: entries,
    messagingAndData: entries,
    strengths: entries,
    limitedExperience: entries,
    noExperience: entries,
    workPreferences: z
      .strictObject({
        locations: entries,
        workModels: entries,
        notes: z.string().trim().max(1000).nullable(),
      })
      .nullable(),
  })
  .superRefine((profile, context) => {
    if (
      profile.status === 'configured' &&
      ![
        ...profile.programmingLanguages,
        ...profile.frameworks,
        ...profile.strengths,
        ...profile.databases,
        ...profile.cloud,
        ...profile.infrastructure,
        ...profile.distributedSystems,
        ...profile.messagingAndData,
      ].length &&
      !profile.backendExperience.level &&
      profile.backendExperience.years === null
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A configured profile requires verified experience, skills or strengths',
      });
    }
  });
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

// Placeholder only. Fill in verified personal values and change status when ready.
// Empty arrays and null mean unknown, not no experience. Do not copy invented skills.
export const candidateProfile: CandidateProfile = {
  status: 'not-configured',
  preferredRoles: [],
  seniority: null,
  backendExperience: { years: null, level: null },
  programmingLanguages: [],
  frameworks: [],
  databases: [],
  cloud: [],
  infrastructure: [],
  distributedSystems: [],
  messagingAndData: [],
  strengths: [],
  limitedExperience: [],
  noExperience: [],
  workPreferences: null,
};

@Injectable()
export class CandidateProfileService {
  getProfile(): CandidateProfile {
    return candidateProfileSchema.parse(candidateProfile);
  }
}
