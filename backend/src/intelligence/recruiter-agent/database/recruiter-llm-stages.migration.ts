import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecruiterLlmStages1793300000000 implements MigrationInterface {
  name = 'RecruiterLlmStages1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Preserve legacy audit records without guessing which model stage handled them.
    await queryRunner.query(`
      ALTER TABLE "email_processing_audit"
        ADD COLUMN "sentToCheapLlm" boolean NOT NULL DEFAULT false,
        ADD COLUMN "cheapLlmClassification" jsonb,
        ADD COLUMN "cheapLlmConfidence" double precision,
        ADD COLUMN "sentToExpensiveLlm" boolean NOT NULL DEFAULT false,
        ADD COLUMN "expensiveLlmResult" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_processing_audit"
        DROP COLUMN "expensiveLlmResult",
        DROP COLUMN "sentToExpensiveLlm",
        DROP COLUMN "cheapLlmConfidence",
        DROP COLUMN "cheapLlmClassification",
        DROP COLUMN "sentToCheapLlm"
    `);
  }
}
