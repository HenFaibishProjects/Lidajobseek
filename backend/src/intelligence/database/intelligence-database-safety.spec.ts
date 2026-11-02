import { ConfigService } from '@nestjs/config';
import { assertIntelligenceDatabaseIsolation } from './intelligence-database-safety';

function config(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('Intelligence database isolation', () => {
  it('rejects the same database and app schema', () => {
    const value = config({
      DATABASE_URL: 'postgresql://reqcue:secret@db.example:5432/jobtracker',
      INTELLIGENCE_DB_HOST: 'db.example',
      INTELLIGENCE_DB_PORT: '5432',
      INTELLIGENCE_DB_DATABASE: 'jobtracker',
      INTELLIGENCE_DB_SCHEMA: 'app',
    });

    expect(() => assertIntelligenceDatabaseIsolation(value)).toThrow(
      /Unsafe database configuration/,
    );
  });

  it('allows the same server/database when schemas are explicitly separate', () => {
    const value = config({
      DATABASE_URL: 'postgresql://reqcue:secret@db.example:5432/jobtracker',
      INTELLIGENCE_DB_HOST: 'db.example',
      INTELLIGENCE_DB_PORT: '5432',
      INTELLIGENCE_DB_DATABASE: 'jobtracker',
      INTELLIGENCE_DB_SCHEMA: 'public',
    });

    expect(() => assertIntelligenceDatabaseIsolation(value)).not.toThrow();
  });

  it('allows a separate Intelligence database', () => {
    const value = config({
      DATABASE_URL: 'postgresql://reqcue:secret@db.example:5432/jobtracker',
      INTELLIGENCE_DB_HOST: 'db.example',
      INTELLIGENCE_DB_PORT: '5432',
      INTELLIGENCE_DB_DATABASE: 'company_intelligence',
      INTELLIGENCE_DB_SCHEMA: 'public',
    });

    expect(() => assertIntelligenceDatabaseIsolation(value)).not.toThrow();
  });
});
