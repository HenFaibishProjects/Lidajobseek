import type { CandidateProfile } from '../intelligence/candidate-profile/candidate-profile';

export const configuredProfileFixture: CandidateProfile = {
  status: 'configured',
  preferredRoles: [
    'Senior Backend Engineer',
    'Backend Infrastructure',
    'Platform Backend',
  ],
  seniority: 'Senior',
  backendExperience: { years: 9, level: 'Senior' },
  programmingLanguages: ['Java', 'TypeScript'],
  frameworks: ['Spring Boot', 'NestJS'],
  databases: ['PostgreSQL', 'Redis'],
  cloud: ['GCP'],
  infrastructure: ['Kubernetes', 'Docker'],
  distributedSystems: ['Microservices', 'Distributed Systems'],
  messagingAndData: ['Pub/Sub'],
  strengths: ['Production ownership'],
  limitedExperience: ['Elasticsearch', 'AWS'],
  noExperience: ['Go'],
  workPreferences: {
    locations: ['Herzliya', 'Tel Aviv'],
    workModels: ['Hybrid', 'Remote'],
    notes: 'Up to 3 office days',
  },
};
