import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResearchCache1792856000000 implements MigrationInterface {
  name = 'ResearchCache1792856000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE company_reports ADD COLUMN cache jsonb',
    );
    await queryRunner.query(`CREATE TABLE research_cache (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "companyId" uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      section varchar(10) NOT NULL CHECK (section IN ('company', 'roles')),
      "roleIntentKey" varchar(510) NOT NULL DEFAULT '',
      "profileFingerprint" varchar(64) NOT NULL DEFAULT '',
      mode varchar(10) NOT NULL CHECK (mode IN ('QUICK', 'DEEP')),
      "refreshedAt" timestamptz NOT NULL,
      "reportId" uuid NOT NULL REFERENCES company_reports(id) ON DELETE CASCADE,
      content jsonb NOT NULL,
      CONSTRAINT "UQ_research_cache_context" UNIQUE ("companyId", section, "roleIntentKey", "profileFingerprint", mode)
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE research_cache');
    await queryRunner.query('ALTER TABLE company_reports DROP COLUMN cache');
  }
}
