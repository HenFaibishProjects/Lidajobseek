import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicIntelligence1793100000000 implements MigrationInterface {
  name = 'PublicIntelligence1793100000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      ADD COLUMN "publicSignals" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN "overallAssessment" jsonb`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      DROP COLUMN "overallAssessment",
      DROP COLUMN "publicSignals"`);
  }
}
