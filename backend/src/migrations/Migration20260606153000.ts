import { Migration } from '@mikro-orm/migrations';

export class Migration20260606153000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "app"."template" ("id" serial primary key, "name" varchar(255) not null, "versions" json not null default '[]', "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" int not null);`);
    this.addSql(`create index "template_updated_at_index" on "app"."template" ("updated_at");`);
    this.addSql(`create index "template_user_id_index" on "app"."template" ("user_id");`);
    this.addSql(`alter table "app"."template" add constraint "template_user_id_foreign" foreign key ("user_id") references "app"."user" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."template" drop constraint if exists "template_user_id_foreign";`);
    this.addSql(`drop table if exists "app"."template";`);
  }

}
