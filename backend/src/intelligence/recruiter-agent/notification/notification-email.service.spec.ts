import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { NotificationEmailService } from './notification-email.service';
import type { ResearchHandoffEntity } from '../handoff/research-handoff.entity';

const handoff = {
  id: '11111111-1111-4111-8111-111111111111',
  companyName: 'Acme\r\nInjected',
  roleTitle: 'Developer',
  eventType: 'INTERVIEW_INVITATION',
  researchReason: 'Interview',
  context: { existingResearch: null },
  chatGptPrompt: 'Very long private prompt',
} as ResearchHandoffEntity;
describe('Internal SMTP notification (mocked transport only)', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses only configured recipient, safe subject, timeouts and a handoff link', async () => {
    const sendMail = jest.fn().mockResolvedValue({ rejected: [] });
    const transport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as Transporter);
    const service = new NotificationEmailService(
      new ConfigService({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        RECRUITER_NOTIFICATION_TO: 'hen@example.com',
        RECRUITER_NOTIFICATION_FROM: 'app@example.com',
        APP_BASE_URL: 'https://app.example.com/',
      }),
    );
    await service.sendHandoff(handoff);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 10000,
        socketTimeout: 20000,
        requireTLS: true,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hen@example.com',
        from: 'app@example.com',
        subject: expect.not.stringMatching(/[\r\n]/),
        text: expect.stringContaining(`?handoff=${handoff.id}`),
      }),
    );
    expect(sendMail.mock.calls[0][0].text).not.toContain(handoff.chatGptPrompt);
  });
  it('does not create a transport when configuration is missing', async () => {
    const transport = jest.spyOn(nodemailer, 'createTransport');
    const service = new NotificationEmailService(new ConfigService());
    expect(service.isConfigured()).toBe(false);
    await expect(service.sendHandoff(handoff)).rejects.toThrow(
      'not configured',
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
