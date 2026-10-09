import { Migration } from '@mikro-orm/migrations';

export class Migration20261009070000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "app"."process" add column if not exists "rejection_summary" text null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "app"."process" drop column if exists "rejection_summary";`,
    );
  }
}
