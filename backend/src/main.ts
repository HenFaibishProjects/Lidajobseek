import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MikroORM } from '@mikro-orm/core';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Use helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'script-src-attr': ["'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://api.dicebear.com'],
        },
      },
    }),
  );

  app.setGlobalPrefix('api');

  // Trust proxy for accurate rate limiting (essential for cloud deployments like Render/Heroku)
  // Only enable if explicitly configured to avoid spoofing in direct deployments
  if (process.env.TRUST_PROXY === 'true') {
    const httpAdapter = app.getHttpAdapter();
    if (httpAdapter && typeof httpAdapter.getInstance === 'function') {
      httpAdapter.getInstance().set('trust proxy', 1);
    }
  }

  // Ensure database schema exists (only in CI or when explicitly requested)
  if (process.env.DB_SYNC === 'true' || process.env.CI === 'true') {
    const orm = app.get(MikroORM);
    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
    await generator.updateSchema();
  }

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://127.0.0.1:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
