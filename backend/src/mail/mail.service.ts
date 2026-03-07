import { Injectable, Logger } from '@nestjs/common';
const nodemailer = require('nodemailer');

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type MailTransporter = {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: MailTransporter;
  private readonly fromAddress: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

    this.fromAddress = process.env.SMTP_FROM || user || 'no-reply@lidajobseek.local';

    if (!host || !user || !pass) {
      this.logger.warn(
        'Mail service is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing). Reminder emails are disabled.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  isConfigured(): boolean {
    return !!this.transporter;
  }

  async sendMail(input: SendMailInput): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${input.to}`, error as any);
      return false;
    }
  }
}
