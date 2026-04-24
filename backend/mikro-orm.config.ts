import { MikroOrmModuleOptions } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

import { User } from './src/users/user.entity';
import { Process } from './src/processes/process.entity';
import { Interaction } from './src/interactions/interaction.entity';
import { Contact } from './src/contacts/contact.entity';
import { Resource } from './src/resources/resource.entity';
import { SelfReview } from './src/reviews/self-review.entity';
import { Profile } from './src/profiles/profile.entity';

const envPath = existsSync(join(process.cwd(), 'backend', '.env'))
  ? join(process.cwd(), 'backend', '.env')
  : join(process.cwd(), '.env');

loadEnv({ path: envPath });

const config: MikroOrmModuleOptions = {
  driver: PostgreSqlDriver,
  clientUrl: process.env.DATABASE_URL,

  ensureDatabase: false,

  pool: {
    // min:0 — don't keep idle connections; Neon's pgBouncer resets them
    // and that causes ECONNRESET when the app tries to reuse a dead socket.
    min: 0,
    // Neon free tier allows ~20 pooler connections; cap at 5 to stay safe.
    max: 5,
    // Acquire timeout: fail fast instead of hanging forever.
    acquireTimeoutMillis: 10000,
    // Discard a connection after 60 s idle so we don't hold Neon slots.
    idleTimeoutMillis: 60000,
    // Validate the connection is alive before handing it to the app.
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      conn.query('SELECT 1', (err: Error | null) => done(err, conn));
    },
  },

  driverOptions: {
    connection: {
      ssl: process.env.CI === 'true' ? false : { rejectUnauthorized: false },
    },
  },

  entities: [
    User,
    Process,
    Interaction,
    Contact,
    Resource,
    SelfReview,
    Profile,
  ],

  allowGlobalContext: true,
};

export default config;
