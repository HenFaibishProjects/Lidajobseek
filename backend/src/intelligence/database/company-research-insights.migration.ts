import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyResearchInsights1793600000000 implements MigrationInterface {
  name = 'CompanyResearchInsights1793600000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      ADD COLUMN "interviewInsights" jsonb,
      ADD COLUMN "workplaceSignals" jsonb`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_reports
      DROP COLUMN "workplaceSignals", DROP COLUMN "interviewInsights"`);
  }
}
