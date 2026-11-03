import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResearchModesRoles1792800000000 implements MigrationInterface {
  name = 'ResearchModesRoles1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      ADD COLUMN mode varchar(10) NOT NULL DEFAULT 'DEEP' CHECK (mode IN ('QUICK', 'DEEP')),
      ADD COLUMN "candidateProfileStatus" varchar(20) NOT NULL DEFAULT 'not-configured' CHECK ("candidateProfileStatus" IN ('not-configured', 'configured')),
      ADD COLUMN "roleDiscoverySummary" text,
      ADD COLUMN "relevantRoles" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      DROP COLUMN "relevantRoles", DROP COLUMN "roleDiscoverySummary",
      DROP COLUMN "candidateProfileStatus", DROP COLUMN mode
    `);
  }
}
