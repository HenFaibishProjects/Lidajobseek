import { Migration } from '@mikro-orm/migrations';

export class Migration20260602191000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "app"."agency_contact" add column "linkedin_url" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."agency_contact" drop column if exists "linkedin_url";`);
  }

}
