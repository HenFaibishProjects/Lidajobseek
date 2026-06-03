import { Migration } from '@mikro-orm/migrations';

export class Migration20260602080100 extends Migration {

  override async up(): Promise<void> {
    // recruitment_agency
    this.addSql(`create table "app"."recruitment_agency" ("id" serial primary key, "agency_name" varchar(255) not null, "website" varchar(255) null, "status" varchar(255) not null default 'ACTIVE', "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" int not null);`);
    this.addSql(`create index "recruitment_agency_updated_at_index" on "app"."recruitment_agency" ("updated_at");`);
    this.addSql(`create index "recruitment_agency_user_id_index" on "app"."recruitment_agency" ("user_id");`);
    this.addSql(`alter table "app"."recruitment_agency" add constraint "recruitment_agency_user_id_foreign" foreign key ("user_id") references "app"."user" ("id") on update cascade;`);

    // agency_contact
    this.addSql(`create table "app"."agency_contact" ("id" serial primary key, "full_name" varchar(255) not null, "phone_number" varchar(255) null, "email" varchar(255) null, "role_title" varchar(255) null, "notes" text null, "is_primary_contact" boolean not null default false, "created_at" timestamptz not null, "updated_at" timestamptz not null, "agency_id" int not null);`);
    this.addSql(`create index "agency_contact_agency_id_index" on "app"."agency_contact" ("agency_id");`);
    this.addSql(`alter table "app"."agency_contact" add constraint "agency_contact_agency_id_foreign" foreign key ("agency_id") references "app"."recruitment_agency" ("id") on update cascade on delete cascade;`);

    // agency_interaction
    this.addSql(`create table "app"."agency_interaction" ("id" serial primary key, "interaction_date" timestamptz not null, "interaction_type" varchar(255) not null, "direction" varchar(255) not null, "summary" text not null, "cv_sent" boolean not null default false, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "agency_id" int not null, "contact_id" int null);`);
    this.addSql(`create index "agency_interaction_agency_id_index" on "app"."agency_interaction" ("agency_id");`);
    this.addSql(`alter table "app"."agency_interaction" add constraint "agency_interaction_agency_id_foreign" foreign key ("agency_id") references "app"."recruitment_agency" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "app"."agency_interaction" add constraint "agency_interaction_contact_id_foreign" foreign key ("contact_id") references "app"."agency_contact" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "app"."agency_interaction" drop constraint if exists "agency_interaction_agency_id_foreign";`);
    this.addSql(`alter table "app"."agency_interaction" drop constraint if exists "agency_interaction_contact_id_foreign";`);
    this.addSql(`alter table "app"."agency_contact" drop constraint if exists "agency_contact_agency_id_foreign";`);
    this.addSql(`alter table "app"."recruitment_agency" drop constraint if exists "recruitment_agency_user_id_foreign";`);
    this.addSql(`drop table if exists "app"."agency_interaction";`);
    this.addSql(`drop table if exists "app"."agency_contact";`);
    this.addSql(`drop table if exists "app"."recruitment_agency";`);
  }

}
