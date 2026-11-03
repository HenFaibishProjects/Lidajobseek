import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateProfiles1793800000000 implements MigrationInterface {
  name = 'CandidateProfiles1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('candidate_profiles')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE candidate_profiles (
        id varchar(50) PRIMARY KEY,
        profile jsonb NOT NULL,
        "createdAt" timestamptz,
        "updatedAt" timestamptz
      )
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // This migration may adopt a candidate_profiles table that predates
    // TypeORM migration tracking. Keep rollback non-destructive so reverting
    // it can never delete an existing production candidate profile.
  }
}
