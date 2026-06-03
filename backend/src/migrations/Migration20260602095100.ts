import { Migration } from '@mikro-orm/migrations';

export class Migration20260602095100 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "app"."recruitment_agency" drop column if exists "status";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."recruitment_agency" add column "status" varchar(255) not null default 'ACTIVE';`);
  }

}
