import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyIntelligence1792700000000 implements MigrationInterface {
  name = 'CompanyIntelligence1792700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(200) NOT NULL,
        "normalizedName" varchar(200) NOT NULL,
        website text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_company_normalized_name" ON companies ("normalizedName")',
    );
    await queryRunner.query(`
      CREATE TABLE company_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId" uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        "companyName" varchar(200) NOT NULL,
        website text,
        role varchar(500),
        provider varchar(20) NOT NULL CHECK (provider IN ('openai', 'deepseek')),
        "companySummary" text NOT NULL,
        "productSummary" text NOT NULL,
        "businessModel" text,
        "companySizeSummary" text,
        "officeLocationSummary" text,
        "workModelSummary" text,
        "engineeringSummary" text,
        "technologySummary" text,
        "stabilitySummary" text,
        "employeeSentimentSummary" text,
        "recentImportantEvents" jsonb NOT NULL,
        "greenFlags" jsonb NOT NULL,
        "redFlags" jsonb NOT NULL,
        "questionsToAskRecruiter" jsonb NOT NULL,
        "roleSummary" text,
        "roleRequirements" jsonb,
        sources jsonb NOT NULL,
        "researchedAt" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_report_company" ON company_reports ("companyId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE company_reports');
    await queryRunner.query('DROP TABLE companies');
  }
}
