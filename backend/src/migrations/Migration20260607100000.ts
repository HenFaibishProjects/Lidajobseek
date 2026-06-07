import { Migration } from '@mikro-orm/migrations';

export class Migration20260607100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "app"."process" add column "company_research" json null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."process" drop column if exists "company_research";`);
  }

}
