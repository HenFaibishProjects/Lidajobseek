import { Migration } from '@mikro-orm/migrations';

export class Migration20260826110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "app"."mail_coverage" add column "note" text null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "app"."mail_coverage" drop column if exists "note";`,
    );
  }
}
