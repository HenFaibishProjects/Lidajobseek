import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailProcessingAudit1793200000000
  implements MigrationInterface
{
  name = 'EmailProcessingAudit1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."email_processing_audit_filter_decision_enum" AS ENUM (
        'PASS',
        'BLOCKED_SENDER',
        'BLOCKED_DOMAIN',
        'REJECTION',
        'ADVERTISEMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."email_processing_audit_review_status_enum" AS ENUM (
        'UNREVIEWED',
        'CORRECT',
        'FALSE_POSITIVE',
        'FALSE_NEGATIVE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "email_processing_audit" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gmailMessageId" character varying NOT NULL,
        "from" character varying NOT NULL,
        "subject" character varying NOT NULL,
        "body" text NOT NULL,
        "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "filterDecision" "public"."email_processing_audit_filter_decision_enum" NOT NULL,
        "filterReason" text,
        "sentToLlm" boolean NOT NULL DEFAULT false,
        "llmClassification" character varying,
        "llmConfidence" double precision,
        "reviewStatus" "public"."email_processing_audit_review_status_enum" NOT NULL DEFAULT 'UNREVIEWED',
        "reviewNote" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_email_processing_audit_gmail_message_id"
          UNIQUE ("gmailMessageId"),
        CONSTRAINT "PK_email_processing_audit"
          PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_processing_audit_received_at"
      ON "email_processing_audit" ("receivedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_processing_audit_review_status"
      ON "email_processing_audit" ("reviewStatus")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_processing_audit_filter_decision"
      ON "email_processing_audit" ("filterDecision")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."IDX_email_processing_audit_filter_decision"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_email_processing_audit_review_status"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_email_processing_audit_received_at"
    `);

    await queryRunner.query(`
      DROP TABLE "email_processing_audit"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."email_processing_audit_review_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."email_processing_audit_filter_decision_enum"
    `);
  }
}