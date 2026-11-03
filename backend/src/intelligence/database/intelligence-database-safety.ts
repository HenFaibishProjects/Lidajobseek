import { ConfigService } from '@nestjs/config';

const LIDAJOBSEEK_SCHEMA = 'app';

function normalizeHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'localhost') return '127.0.0.1';
  return normalized;
}

export function assertIntelligenceDatabaseIsolation(
  config: ConfigService,
): void {
  const mainDatabaseUrl = config.get<string>('DATABASE_URL');
  if (!mainDatabaseUrl) return;

  let main: URL;
  try {
    main = new URL(mainDatabaseUrl);
  } catch {
    return;
  }

  const intelligenceHost = normalizeHost(
    config.getOrThrow<string>('INTELLIGENCE_DB_HOST'),
  );
  const intelligencePort = String(
    config.get<number | string>('INTELLIGENCE_DB_PORT') ?? 5432,
  );
  const intelligenceDatabase = config.getOrThrow<string>(
    'INTELLIGENCE_DB_DATABASE',
  );
  const intelligenceSchema =
    config.get<string>('INTELLIGENCE_DB_SCHEMA')?.trim() || 'public';

  const mainHost = normalizeHost(main.hostname);
  const mainPort = main.port || '5432';
  const mainDatabase = decodeURIComponent(main.pathname.replace(/^\//, ''));

  if (
    mainHost === intelligenceHost &&
    mainPort === intelligencePort &&
    mainDatabase === intelligenceDatabase &&
    intelligenceSchema === LIDAJOBSEEK_SCHEMA
  ) {
    throw new Error(
      'Unsafe database configuration: Reqcue and Intelligence point to the same PostgreSQL database/schema.',
    );
  }
}
