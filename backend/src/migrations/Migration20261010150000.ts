import { Migration } from '@mikro-orm/migrations';

export class Migration20261010150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "app"."availability_block" ("id" serial primary key, "user_id" int not null references "app"."user" ("id") on update cascade, "start_date" date not null, "end_date" date not null, "start_time" varchar(255) null, "end_time" varchar(255) null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "time_zone" varchar(255) not null, "all_day" boolean not null default false, "repeat_weekly" boolean not null default false, "reason" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null);`,
    );
    this.addSql(
      `create index if not exists "availability_block_user_id_start_date_index" on "app"."availability_block" ("user_id", "start_date");`,
    );
    this.addSql(
      `create index if not exists "availability_block_user_id_starts_at_ends_at_index" on "app"."availability_block" ("user_id", "starts_at", "ends_at");`,
    );
  }
}
