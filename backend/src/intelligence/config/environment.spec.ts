import { environmentSchema } from './environment';

const baseEnvironment = {
  INTELLIGENCE_DB_HOST: 'db.example',
  INTELLIGENCE_DB_PORT: '5432',
  INTELLIGENCE_DB_USERNAME: 'company_intelligence_user',
  INTELLIGENCE_DB_PASSWORD: 'secret',
  INTELLIGENCE_DB_DATABASE: 'company_intelligence',
};

describe('Company Intelligence environment schema', () => {
  it('allows missing Gmail credentials while recruiter polling is disabled', () => {
    const result = environmentSchema.safeParse({
      ...baseEnvironment,
      RECRUITER_GMAIL_POLLING_ENABLED: 'false',
    });

    expect(result.success).toBe(true);
  });

  it('requires Gmail credentials when recruiter polling is enabled', () => {
    const result = environmentSchema.safeParse({
      ...baseEnvironment,
      RECRUITER_GMAIL_POLLING_ENABLED: 'true',
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REFRESH_TOKEN',
      ]),
    );
  });

  it('accepts Gmail credentials when recruiter polling is enabled', () => {
    const result = environmentSchema.safeParse({
      ...baseEnvironment,
      RECRUITER_GMAIL_POLLING_ENABLED: 'true',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REFRESH_TOKEN: 'refresh',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsafe custom schema values', () => {
    const result = environmentSchema.safeParse({
      ...baseEnvironment,
      INTELLIGENCE_DB_SCHEMA: 'intelligence;DROP SCHEMA public',
    });

    expect(result.success).toBe(false);
  });
});
