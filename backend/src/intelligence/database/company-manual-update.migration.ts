import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyManualUpdate1793000000000 implements MigrationInterface {
  name = 'CompanyManualUpdate1793000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE companies ADD COLUMN "manuallyUpdatedAt" timestamptz',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE companies DROP COLUMN "manuallyUpdatedAt"',
    );
  }
}
