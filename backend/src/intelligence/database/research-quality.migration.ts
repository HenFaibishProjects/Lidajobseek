import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResearchQuality1792826000000 implements MigrationInterface {
  name = 'ResearchQuality1792826000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE company_reports ADD COLUMN "researchQuality" jsonb',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE company_reports DROP COLUMN "researchQuality"',
    );
  }
}
