import { ConfigService } from '@nestjs/config';
import {
  buildIntelligenceDataSourceOptions,
  getIntelligenceSchema,
} from './intelligence-database-options';
import { CandidateProfiles1793800000000 } from './candidate-profiles.migration';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

const baseConfig = {
  INTELLIGENCE_DB_HOST: 'db.example',
  INTELLIGENCE_DB_PORT: '5432',
  INTELLIGENCE_DB_USERNAME: 'company_intelligence_user',
  INTELLIGENCE_DB_PASSWORD: 'secret',
  INTELLIGENCE_DB_DATABASE: 'company_intelligence',
  INTELLIGENCE_DB_SSL: 'false',
};

describe('Intelligence TypeORM configuration', () => {
  it('applies the configured schema to both TypeORM and raw migration SQL', () => {
    const options = buildIntelligenceDataSourceOptions(
      config({
        ...baseConfig,
        INTELLIGENCE_DB_SCHEMA: 'intelligence',
      }),
    );

    expect(options.schema).toBe('intelligence');
    expect(options.extra.options).toBe('-c search_path=intelligence');
  });

  it('does not fall back to public for a custom migration search path', () => {
    const options = buildIntelligenceDataSourceOptions(
      config({
        ...baseConfig,
        INTELLIGENCE_DB_SCHEMA: 'tenant_data',
      }),
    );

    expect(options.extra.options).not.toContain(',public');
  });

  it('registers the candidate profile migration', () => {
    const options = buildIntelligenceDataSourceOptions(config(baseConfig));

    expect(options.migrations).toContain(CandidateProfiles1793800000000);
  });

  it('rejects schema values that cannot be safely used as a PostgreSQL search_path', () => {
    expect(() =>
      getIntelligenceSchema(
        config({
          ...baseConfig,
          INTELLIGENCE_DB_SCHEMA: 'intelligence; DROP SCHEMA public',
        }),
      ),
    ).toThrow(/INTELLIGENCE_DB_SCHEMA/);
  });
});
