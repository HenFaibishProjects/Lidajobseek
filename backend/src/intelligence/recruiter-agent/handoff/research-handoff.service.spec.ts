import { reportFixture } from '../../../test/company-report.fixture';
import { CompanyHistoryRepository } from '../../company-history/company-history.repository';
import { CompanyRepository } from '../../company-intelligence/company.repository';
import { NotificationEmailService } from '../notification/notification-email.service';
import { ResearchHandoffRepository } from './research-handoff.repository';
import { ResearchHandoffService } from './research-handoff.service';
import { ResearchHandoffEntity } from './research-handoff.entity';
import { ResearchHandoffStatus } from './research-handoff.types';
import {
  buildChatGptResearchPrompt,
  handoffContext,
} from './research-handoff-prompt';
import type { RecruiterEmailAnalysis } from '../recruiter-email.schema';

const analysis: RecruiterEmailAnalysis = {
  companyName: 'Acme',
  roleTitle: 'Developer',
  recruiterName: null,
  eventType: 'INTERVIEW_INVITATION',
  stage: null,
  summary: 'Choose an interview slot',
  actionRequired: true,
  requestedAction: 'Choose time',
  interview: null,
  researchDepth: 'FULL',
  researchReason: 'Interview invitation',
  companyResearchNeeded: true,
  nextAction: 'RESEARCH_COMPANY',
};
function setup() {
  let saved: ResearchHandoffEntity | null = null;
  const repository = {
    findByMessage: jest.fn(async () => saved),
    findById: jest.fn(async () => saved),
    createOrFind: jest.fn(
      async (gmailMessageId, context, requestedResearch, chatGptPrompt) => {
        saved ??= {
          id: 'handoff',
          gmailMessageId,
          ...context,
          context,
          requestedResearch,
          chatGptPrompt,
          status: ResearchHandoffStatus.PENDING_CHATGPT,
          existingReportId: null,
          createdAt: new Date(),
          notificationSentAt: null,
          notificationError: null,
          notificationAttempts: 0,
          completedAt: null,
        } as ResearchHandoffEntity;
        return saved;
      },
    ),
    claimNotification: jest.fn(async () => {
      if (!saved || saved.notificationSentAt) return null;
      saved.notificationAttempts++;
      return { ...saved };
    }),
    notificationSent: jest.fn(async () => {
      saved!.notificationSentAt = new Date();
    }),
    notificationFailed: jest.fn(),
    notificationUnconfigured: jest.fn(),
    listNotifications: jest.fn(async () => (saved ? [saved] : [])),
    list: jest.fn(async () => (saved ? [saved] : [])),
    complete: jest.fn(async (_id, result) => {
      if (!saved || saved.status === ResearchHandoffStatus.COMPLETED)
        return false;
      saved.status = ResearchHandoffStatus.COMPLETED;
      saved.deepResearchResult = JSON.parse(result);
      saved.completedAt = new Date();
      return true;
    }),
  };
  const history = {
    findCompanyIdByNormalizedName: jest.fn().mockResolvedValue('company-id'),
    findLatestReportReference: jest
      .fn()
      .mockResolvedValue({ reportId: 'report-id', researchedAt: new Date() }),
  };
  const companies = {
    findReport: jest
      .fn()
      .mockResolvedValue({
        ...reportFixture,
        id: 'report-id',
        companyName: 'Acme',
        mode: 'QUICK',
        researchedAt: new Date().toISOString(),
      }),
  };
  const notifications = {
    isConfigured: jest.fn().mockReturnValue(true),
    sendHandoff: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ResearchHandoffService(
    repository as unknown as ResearchHandoffRepository,
    history as unknown as CompanyHistoryRepository,
    companies as unknown as CompanyRepository,
    notifications as unknown as NotificationEmailService,
  );
  return { service, repository, history, companies, notifications };
}
describe('Durable manual ChatGPT handoff service', () => {
  it('reuses one handoff and sends once across email retries', async () => {
    const s = setup();
    const first = await s.service.ensure('message', analysis);
    const second = await s.service.ensure('message', analysis);
    await s.service.retryNotifications();
    expect(first.id).toBe(second.id);
    expect(s.repository.createOrFind).toHaveBeenCalledTimes(1);
    expect(s.notifications.sendHandoff).toHaveBeenCalledTimes(1);
    expect(s.history.findCompanyIdByNormalizedName).toHaveBeenCalledTimes(1);
  });
  it('retains a handoff when notification fails and retries without recreating it', async () => {
    const s = setup();
    s.notifications.sendHandoff.mockRejectedValueOnce(
      new Error('private SMTP details'),
    );
    await expect(s.service.ensure('message', analysis)).resolves.toMatchObject({
      status: 'PENDING_CHATGPT',
    });
    expect(s.repository.notificationFailed).toHaveBeenCalledWith(
      'handoff',
      1,
      expect.not.stringContaining('private'),
    );
    await s.service.retryNotifications();
    expect(s.repository.createOrFind).toHaveBeenCalledTimes(1);
    expect(s.repository.notificationSent).toHaveBeenCalledTimes(1);
  });
  it('creates a durable handoff without consuming retries when SMTP is absent', async () => {
    const s = setup();
    s.notifications.isConfigured.mockReturnValue(false);
    await s.service.ensure('message', analysis);
    expect(s.repository.notificationUnconfigured).toHaveBeenCalledWith(
      'handoff',
    );
    expect(s.repository.claimNotification).not.toHaveBeenCalled();
    expect(s.notifications.sendHandoff).not.toHaveBeenCalled();
  });
  it('does not send when another worker owns or exhausted the notification', async () => {
    const s = setup();
    s.repository.claimNotification.mockResolvedValue(null);
    await s.service.ensure('message', analysis);
    expect(s.notifications.sendHandoff).not.toHaveBeenCalled();
  });
  it('stores completed research result and timestamp, then preserves it on repeated completion', async () => {
    const s = setup();
    await s.service.ensure('message', analysis);
    const result = {
      assessment: 'Useful opportunity',
      sources: ['https://example.com'],
    };
    await expect(
      s.service.completeResearchHandoff('handoff', result),
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      deepResearchResult: result,
      completedAt: expect.any(Date),
    });
    await s.service.completeResearchHandoff('handoff', { changed: true });
    expect(
      (await s.service.getResearchHandoff('handoff')).deepResearchResult,
    ).toEqual(result);
    await expect(
      s.service.completeResearchHandoff('handoff', 'not an object'),
    ).rejects.toThrow('JSON object');
  });
  it('provides pending-list and detail service methods without a connector', async () => {
    const s = setup();
    await s.service.ensure('message', analysis);
    expect(await s.service.listPendingResearch()).toHaveLength(1);
    expect(s.repository.list).toHaveBeenCalledWith('pending', 20, 0);
    expect(await s.service.getResearchHandoff('handoff')).toMatchObject({
      companyName: 'Acme',
      chatGptPrompt: expect.any(String),
    });
  });
  it('generates a deterministic research checklist without raw email or secrets', () => {
    const context = handoffContext(
      {
        ...analysis,
        summary: 'Bearer private-token',
        interview: {
          date: null,
          time: null,
          location: null,
          meetingUrl:
            'https://user:password@example.com/meet?token=private&room=1',
        },
      },
      null,
    );
    const prompt = buildChatGptResearchPrompt(context);
    expect(prompt).toBe(buildChatGptResearchPrompt(context));
    expect(prompt).not.toContain('private');
    expect(prompt).not.toContain('password');
    for (const topic of [
      'Israel',
      'floor',
      'hybrid',
      'headcounts',
      'Reddit',
      'Glassdoor',
      'system design',
      'recruiter',
      'Hebrew',
    ])
      expect(prompt).toContain(topic);
    expect(context.existingResearch).toBeNull();
  });
});
