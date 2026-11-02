import { ConfigService } from '@nestjs/config';
import { ResearchHandoffService } from '../handoff/research-handoff.service';
import { EmailProcessingAuditService } from '../audit/email-processing-audit.service';
import { RecruiterEmailPipelineService } from '../agent/recruiter-email-pipeline.service';
import { prefilterRecruiterEmail } from '../prefilter/recruiter-email-prefilter';
import { EmailFilterDecision } from '../recruiter-agent.types';
import { GmailClientService } from './gmail-client.service';
import { GmailTriggerService } from './gmail-trigger.service';

jest.mock('../prefilter/recruiter-email-prefilter');
jest.mock('@nestjs/schedule', () => ({ Interval: () => () => undefined }));

const email = {
  id: 'new',
  from: 'a@b.com',
  subject: 'Hello',
  body: 'Hello',
  receivedAt: new Date(),
};
function setup() {
  const client = { getRecentInboxEmails: jest.fn().mockResolvedValue([email]) };
  const audit = { listRetryableEmails: jest.fn().mockResolvedValue([]) };
  const pipeline = { process: jest.fn().mockResolvedValue(undefined) };
  jest.mocked(prefilterRecruiterEmail).mockReturnValue({
    shouldAnalyze: true,
    decision: EmailFilterDecision.PASS,
    reasons: [],
  });
  const handoffs = {
    retryNotifications: jest.fn().mockResolvedValue(undefined),
  };
  const trigger = new GmailTriggerService(
    client as unknown as GmailClientService,
    audit as unknown as EmailProcessingAuditService,
    pipeline as unknown as RecruiterEmailPipelineService,
    handoffs as unknown as ResearchHandoffService,
    { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
  );
  return { trigger, client, audit, pipeline, handoffs };
}

describe('Durable Gmail polling', () => {
  it('does nothing when recruiter Gmail polling is disabled', async () => {
    const client = { getRecentInboxEmails: jest.fn() };
    const audit = { listRetryableEmails: jest.fn() };
    const pipeline = { process: jest.fn() };
    const handoffs = { retryNotifications: jest.fn() };
    const trigger = new GmailTriggerService(
      client as unknown as GmailClientService,
      audit as unknown as EmailProcessingAuditService,
      pipeline as unknown as RecruiterEmailPipelineService,
      handoffs as unknown as ResearchHandoffService,
      { get: jest.fn().mockReturnValue('false') } as unknown as ConfigService,
    );

    await trigger.pollInbox();

    expect(client.getRecentInboxEmails).not.toHaveBeenCalled();
    expect(audit.listRetryableEmails).not.toHaveBeenCalled();
    expect(handoffs.retryNotifications).not.toHaveBeenCalled();
  });

  it('retries handoff notifications even when Gmail is unavailable and releases the lock on notification failure', async () => {
    const s = setup();
    s.client.getRecentInboxEmails.mockRejectedValue(new Error('offline'));
    s.handoffs.retryNotifications.mockRejectedValueOnce(
      new Error('SMTP offline'),
    );
    await s.trigger.pollInbox();
    await s.trigger.pollInbox();
    expect(s.handoffs.retryNotifications).toHaveBeenCalledTimes(2);
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledTimes(2);
  });

  it('does not fetch or mark messages at construction/startup; first poll processes existing inbox email', async () => {
    const s = setup();
    expect(s.client.getRecentInboxEmails).not.toHaveBeenCalled();
    expect('onModuleInit' in s.trigger).toBe(false);
    await s.trigger.pollInbox();
    expect(s.pipeline.process).toHaveBeenCalledWith(email, expect.any(Object));
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledWith(20);
  });

  it('passes subsequent polls to durable state instead of remembering IDs', async () => {
    const s = setup();
    await s.trigger.pollInbox();
    await s.trigger.pollInbox();
    expect(s.pipeline.process).toHaveBeenCalledTimes(2);
  });

  it('recovers unfinished database emails outside the current inbox window and deduplicates the batch', async () => {
    const s = setup();
    s.audit.listRetryableEmails.mockResolvedValue([
      email,
      { ...email, id: 'older' },
    ]);
    await s.trigger.pollInbox();
    expect(s.pipeline.process).toHaveBeenCalledTimes(2);
  });

  it('skips an overlapping poll and releases the lock afterward', async () => {
    const s = setup();
    let release!: () => void;
    let discoveryStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      discoveryStarted = resolve;
    });
    s.client.getRecentInboxEmails.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          discoveryStarted();
          release = () => resolve([email]);
        }),
    );
    const running = s.trigger.pollInbox();
    await started;
    await s.trigger.pollInbox();
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledTimes(1);
    release();
    await running;
    await s.trigger.pollInbox();
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledTimes(2);
  });

  it('processes durable retries before Gmail discovery fails and unlocks afterward', async () => {
    const s = setup();
    const retryableEmail = { ...email, id: 'durable' };
    s.audit.listRetryableEmails.mockResolvedValueOnce([retryableEmail]);
    s.client.getRecentInboxEmails.mockRejectedValueOnce(
      new Error('Gmail offline'),
    );

    await s.trigger.pollInbox();
    expect(s.pipeline.process).toHaveBeenCalledTimes(1);
    expect(s.pipeline.process).toHaveBeenCalledWith(
      retryableEmail,
      expect.any(Object),
    );
    expect(s.pipeline.process.mock.invocationCallOrder[0]).toBeLessThan(
      s.client.getRecentInboxEmails.mock.invocationCallOrder[0],
    );

    // A subsequent successful poll proves the failure released the lock.
    await s.trigger.pollInbox();
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledTimes(2);
    expect(s.pipeline.process).toHaveBeenCalledWith(email, expect.any(Object));
    expect(s.pipeline.process).toHaveBeenCalledTimes(2);
  });

  it('continues processing other emails after one fails and unlocks after polling failures', async () => {
    const s = setup();
    s.client.getRecentInboxEmails.mockResolvedValueOnce([
      email,
      { ...email, id: 'second' },
    ]);
    s.pipeline.process.mockRejectedValueOnce(new Error('failed'));
    await s.trigger.pollInbox();
    expect(s.pipeline.process).toHaveBeenCalledTimes(2);
    s.client.getRecentInboxEmails.mockRejectedValueOnce(new Error('offline'));
    await s.trigger.pollInbox();
    await s.trigger.pollInbox();
    expect(s.client.getRecentInboxEmails).toHaveBeenCalledTimes(3);
  });
});
