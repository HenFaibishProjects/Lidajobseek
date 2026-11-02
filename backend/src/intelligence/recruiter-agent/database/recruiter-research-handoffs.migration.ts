import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecruiterResearchHandoffs1793700000000 implements MigrationInterface {
  name = 'RecruiterResearchHandoffs1793700000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE email_processing_audit
      ADD COLUMN "sentToDecisionLlm" boolean NOT NULL DEFAULT false,
      ADD COLUMN "decisionLlmResult" jsonb`);
    await runner.query(
      `CREATE TYPE "public"."research_handoff_status_enum" AS ENUM ('PENDING_CHATGPT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await runner.query(`CREATE TABLE recruiter_research_handoffs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "gmailMessageId" varchar NOT NULL UNIQUE,
      "companyName" varchar(200) NOT NULL, "roleTitle" varchar(300), "recruiterName" varchar(200),
      "eventType" varchar(50) NOT NULL, "researchReason" text NOT NULL,
      status "public"."research_handoff_status_enum" NOT NULL DEFAULT 'PENDING_CHATGPT',
      "existingReportId" uuid, context jsonb NOT NULL, "requestedResearch" jsonb NOT NULL,
      "chatGptPrompt" text NOT NULL, "deepResearchResult" jsonb,
      "notificationSentAt" timestamptz, "notificationError" text, "notificationAttempts" integer NOT NULL DEFAULT 0,
      "notificationClaimedAt" timestamptz, "notificationRetryAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "completedAt" timestamptz
    )`);
    await runner.query(
      `CREATE INDEX "IDX_research_handoff_status" ON recruiter_research_handoffs (status)`,
    );
    await runner.query(
      `CREATE INDEX "IDX_research_handoff_notification" ON recruiter_research_handoffs ("notificationAttempts", "notificationRetryAt") WHERE "notificationSentAt" IS NULL`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE recruiter_research_handoffs`);
    await runner.query(`DROP TYPE "public"."research_handoff_status_enum"`);
    await runner.query(
      `ALTER TABLE email_processing_audit DROP COLUMN "decisionLlmResult", DROP COLUMN "sentToDecisionLlm"`,
    );
  }
}
