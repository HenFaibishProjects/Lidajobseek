import { MigrationInterface, QueryRunner } from 'typeorm';

export class HebrewPresentation1792864000000 implements MigrationInterface {
  name = 'HebrewPresentation1792864000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      ADD COLUMN "quickBrief" jsonb,
      ADD COLUMN location jsonb,
      ADD COLUMN "reportLanguage" varchar(10),
      ADD COLUMN "researchEvidence" jsonb`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      DROP COLUMN "researchEvidence", DROP COLUMN "reportLanguage", DROP COLUMN location, DROP COLUMN "quickBrief"`);
  }
}
