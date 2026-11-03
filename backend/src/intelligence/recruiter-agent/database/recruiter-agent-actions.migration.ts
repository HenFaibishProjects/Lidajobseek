import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecruiterAgentActions1793500000000 implements MigrationInterface {
  name = 'RecruiterAgentActions1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."recruiter_agent_action_type_enum" AS ENUM (
      'RESEARCH_COMPANY', 'USE_EXISTING_COMPANY', 'PREPARE_INTERVIEW_CONTEXT',
      'MATCH_JOB_TO_PROFILE', 'DRAFT_REPLY', 'NO_ACTION')`);
    await queryRunner.query(`CREATE TYPE "public"."recruiter_agent_action_status_enum" AS ENUM (
      'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEFERRED')`);
    await queryRunner.query(`CREATE TABLE "recruiter_agent_actions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "gmailMessageId" varchar NOT NULL,
      "actionType" "public"."recruiter_agent_action_type_enum" NOT NULL,
      "status" "public"."recruiter_agent_action_status_enum" NOT NULL DEFAULT 'PENDING',
      "attempts" integer NOT NULL DEFAULT 0,
      "emailProcessingAttempt" integer,
      "result" jsonb,
      "error" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_recruiter_agent_actions" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_recruiter_action_message_type" UNIQUE ("gmailMessageId", "actionType")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_recruiter_action_message" ON "recruiter_agent_actions" ("gmailMessageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recruiter_action_status" ON "recruiter_agent_actions" ("status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "recruiter_agent_actions"`);
    await queryRunner.query(
      `DROP TYPE "public"."recruiter_agent_action_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."recruiter_agent_action_type_enum"`,
    );
  }
}
