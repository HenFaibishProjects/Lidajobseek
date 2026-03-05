import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProcessesModule } from './processes/processes.module';
import { InteractionsModule } from './interactions/interactions.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ContactsService } from './contacts/contacts.service';
import { ContactsController } from './contacts/contacts.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { ResourcesModule } from './resources/resources.module';
import { AuthModule } from './auth/auth.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from '../mikro-orm.config';
import { Contact } from './contacts/contact.entity';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: (() => {
        const backendEnv = join(process.cwd(), 'backend', '.env');
        const rootEnv = join(process.cwd(), '.env');
        const parentBackendEnv = join(process.cwd(), '..', 'backend', '.env');
        if (existsSync(backendEnv)) {
          return backendEnv;
        }
        if (existsSync(parentBackendEnv)) {
          return parentBackendEnv;
        }
        return rootEnv;
      })(),
    }),
    MikroOrmModule.forRoot(config),
    MikroOrmModule.forFeature([Contact]),
    AuthModule,
    ServeStaticModule.forRoot(
      {
        rootPath: (() => {
          const uploadsRoot = join(process.cwd(), 'uploads');
          const uploadsParent = join(process.cwd(), '..', 'uploads');
          return existsSync(uploadsRoot) ? uploadsRoot : uploadsParent;
        })(),
        serveRoot: '/uploads',
      },
      {
        rootPath: (() => {
          const uiBrowserRoot = join(process.cwd(), 'ui', 'dist', 'ui', 'browser');
          const uiBrowserParent = join(process.cwd(), '..', 'ui', 'dist', 'ui', 'browser');
          const distPublicRoot = join(process.cwd(), 'dist', 'public', 'browser');
          const distPublicParent = join(process.cwd(), '..', 'dist', 'public', 'browser');

          if (existsSync(uiBrowserRoot)) {
            return uiBrowserRoot;
          }
          if (existsSync(uiBrowserParent)) {
            return uiBrowserParent;
          }
          if (existsSync(distPublicRoot)) {
            return distPublicRoot;
            }
            return distPublicParent;
                    })(),
                    exclude: ['/api']
                  },
    ),
    ProcessesModule,
    InteractionsModule,
    ReviewsModule,
    ResourcesModule,
    ProfilesModule,
  ],
  controllers: [AppController, ContactsController],
  providers: [AppService, ContactsService],
})
export class AppModule {}
