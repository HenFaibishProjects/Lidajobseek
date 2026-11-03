import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecruiterProcessingState1793400000000 implements MigrationInterface {
  name = 'RecruiterProcessingState1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."email_processing_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    // Existing audits are historical: do not unexpectedly replay paid work.
    await queryRunner.query(`ALTER TABLE "email_processing_audit"
      ADD COLUMN "processingStatus" "public"."email_processing_status_enum" NOT NULL DEFAULT 'COMPLETED',
      ADD COLUMN "processingAttempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN "processingError" text`);
    await queryRunner.query(
      `ALTER TABLE "email_processing_audit" ALTER COLUMN "processingStatus" SET DEFAULT 'PENDING'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_processing_audit"
      DROP COLUMN "processingError", DROP COLUMN "processingAttempts", DROP COLUMN "processingStatus"`);
    await queryRunner.query(
      `DROP TYPE "public"."email_processing_status_enum"`,
    );
  }
}
