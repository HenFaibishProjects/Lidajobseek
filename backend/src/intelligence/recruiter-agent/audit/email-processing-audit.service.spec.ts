import { Repository } from 'typeorm';
import { EmailProcessingAuditService } from './email-processing-audit.service';
import {
  EmailProcessingAuditEntity,
  EmailReviewStatus,
} from './email-processing-audit.entity';
import { EmailFilterDecision } from '../recruiter-agent.types';
import { RecruiterLlmStages1793300000000 } from '../database/recruiter-llm-stages.migration';
import type { QueryRunner } from 'typeorm';

function setup() {
  let inserted: unknown;
  const insert = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn((value) => {
      inserted = value;
      return insert;
    }),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => insert),
    findOneByOrFail: jest.fn(() => Promise.resolve(inserted)),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const audit = new EmailProcessingAuditService(
    repository as unknown as Repository<EmailProcessingAuditEntity>,
  );
  return { repository, audit };
}

describe('Two-stage email audit', () => {
  it('creates an unreviewed record with all prefilter reasons and neither LLM marked', async () => {
    const s = setup();
    const saved = await s.audit.create(
      { id: '1', from: 'a', subject: 'b', body: 'c', receivedAt: new Date() },
      EmailFilterDecision.PASS,
      ['one', 'two'],
    );
    expect(saved).toMatchObject({
      filterDecision: EmailFilterDecision.PASS,
      filterReason: 'one; two',
      reviewStatus: EmailReviewStatus.UNREVIEWED,
      sentToLlm: false,
      sentToCheapLlm: false,
      sentToExpensiveLlm: false,
      cheapLlmClassification: null,
      expensiveLlmResult: null,
    });
  });

  it('does not overwrite an existing audit or manual review', async () => {
    const s = setup();
    const existing = {
      gmailMessageId: '1',
      reviewStatus: EmailReviewStatus.FALSE_NEGATIVE,
      reviewNote: 'Missed invitation',
    };
    s.repository.findOne.mockResolvedValue(existing);
    await expect(
      s.audit.create(
        { id: '1', from: 'a', subject: 'b', body: 'c', receivedAt: new Date() },
        EmailFilterDecision.PASS,
      ),
    ).resolves.toBe(existing);
    expect(s.repository.save).not.toHaveBeenCalled();
  });

  it('updates each stage independently and retains manual review methods', async () => {
    const s = setup();
    await s.audit.markSentToCheapLlm('1');
    expect(s.repository.update).toHaveBeenLastCalledWith(
      { gmailMessageId: '1' },
      { sentToLlm: true, sentToCheapLlm: true },
    );
    await s.audit.markSentToExpensiveLlm('1');
    expect(s.repository.update).toHaveBeenLastCalledWith(
      { gmailMessageId: '1' },
      { sentToLlm: true, sentToExpensiveLlm: true },
    );
    await s.audit.markFalsePositive('1', 'Marketing');
    expect(s.repository.update).toHaveBeenLastCalledWith(
      { gmailMessageId: '1' },
      {
        reviewStatus: EmailReviewStatus.FALSE_POSITIVE,
        reviewNote: 'Marketing',
      },
    );
    await s.audit.markFalseNegative('1', 'Missed invitation');
    expect(s.repository.update).toHaveBeenLastCalledWith(
      { gmailMessageId: '1' },
      {
        reviewStatus: EmailReviewStatus.FALSE_NEGATIVE,
        reviewNote: 'Missed invitation',
      },
    );
  });

  it('migrates additively and rolls back only the new stage columns', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { query } as unknown as QueryRunner;
    const migration = new RecruiterLlmStages1793300000000();
    await migration.up(runner);
    const up = query.mock.calls[0][0] as string;
    expect(up.match(/ADD COLUMN/g)).toHaveLength(5);
    expect(up).not.toMatch(/DROP|UPDATE|DELETE/);
    await migration.down(runner);
    const down = query.mock.calls[1][0] as string;
    expect(down.match(/DROP COLUMN/g)).toHaveLength(5);
    expect(down).not.toMatch(
      /"filterDecision"|"filterReason"|"reviewStatus"|"reviewNote"|DROP TABLE/,
    );
  });
});
