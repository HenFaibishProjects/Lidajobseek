import { Migration } from '@mikro-orm/migrations';

export class Migration20260826100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "app"."mail_coverage" ("id" serial primary key, "company_name" varchar(255) not null, "received_cv_email" boolean not null default false, "received_cv_date" timestamptz null, "rejected_email" boolean not null default false, "rejected_date" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" int not null);`,
    );
    this.addSql(
      `create index "mail_coverage_company_name_index" on "app"."mail_coverage" ("company_name");`,
    );
    this.addSql(
      `create index "mail_coverage_updated_at_index" on "app"."mail_coverage" ("updated_at");`,
    );
    this.addSql(
      `create index "mail_coverage_user_id_index" on "app"."mail_coverage" ("user_id");`,
    );
    this.addSql(
      `alter table "app"."mail_coverage" add constraint "mail_coverage_user_id_foreign" foreign key ("user_id") references "app"."user" ("id") on update cascade;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "app"."mail_coverage" drop constraint if exists "mail_coverage_user_id_foreign";`,
    );
    this.addSql(`drop table if exists "app"."mail_coverage";`);
  }
}
