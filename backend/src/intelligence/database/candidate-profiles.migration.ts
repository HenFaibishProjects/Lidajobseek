import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateProfiles1793800000000 implements MigrationInterface {
  name = 'CandidateProfiles1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE candidate_profiles (
        id varchar(50) PRIMARY KEY,
        profile jsonb NOT NULL,
        "createdAt" timestamptz,
        "updatedAt" timestamptz
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE candidate_profiles');
  }
}
