import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobMatchCache1792900000000 implements MigrationInterface {
  name = 'JobMatchCache1792900000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE job_match_cache (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "companyKey" varchar(200) NOT NULL,
      "profileFingerprint" varchar(64) NOT NULL,
      content jsonb NOT NULL,
      "refreshedAt" timestamptz NOT NULL,
      CONSTRAINT "UQ_job_match_cache_context" UNIQUE ("companyKey", "profileFingerprint")
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE job_match_cache');
  }
}
