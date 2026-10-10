import { Migration } from '@mikro-orm/migrations';

export class Migration20261010120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "app"."mail_coverage" add column if not exists "received_cv_count" int not null default 0, add column if not exists "rejected_count" int not null default 0, add column if not exists "received_cv_import_keys" jsonb not null default '[]', add column if not exists "rejected_import_keys" jsonb not null default '[]';`,
    );
    this.addSql(
      `update "app"."mail_coverage" set "received_cv_count" = 1 where "received_cv_email" = true and "received_cv_count" = 0;`,
    );
    this.addSql(
      `update "app"."mail_coverage" set "rejected_count" = 1 where "rejected_email" = true and "rejected_count" = 0;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "app"."mail_coverage" drop column if exists "received_cv_count", drop column if exists "rejected_count", drop column if exists "received_cv_import_keys", drop column if exists "rejected_import_keys";`,
    );
  }
}
