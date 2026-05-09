import { Migration } from '@mikro-orm/migrations';

export class Migration20260509084431 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "app"."user" add column "app_settings" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."user" drop column "app_settings";`);
  }

}
