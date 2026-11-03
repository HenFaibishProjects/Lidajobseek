import { QueryRunner } from 'typeorm';
import { CandidateProfiles1793800000000 } from './candidate-profiles.migration';

describe('CandidateProfiles1793800000000', () => {
  const migration = new CandidateProfiles1793800000000();

  function queryRunner(hasTable: boolean) {
    return {
      hasTable: jest.fn().mockResolvedValue(hasTable),
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
  }

  it('adopts an existing candidate_profiles table without recreating it', async () => {
    const runner = queryRunner(true);

    await migration.up(runner);

    expect(runner.hasTable).toHaveBeenCalledWith('candidate_profiles');
    expect(runner.query).not.toHaveBeenCalled();
  });

  it('creates candidate_profiles on a fresh database', async () => {
    const runner = queryRunner(false);

    await migration.up(runner);

    expect(runner.query).toHaveBeenCalledTimes(1);
    expect(jest.mocked(runner.query).mock.calls[0][0]).toContain(
      'CREATE TABLE candidate_profiles',
    );
  });

  it('keeps rollback non-destructive for adopted production tables', async () => {
    const runner = queryRunner(true);

    await migration.down(runner);

    expect(runner.query).not.toHaveBeenCalled();
  });
});
