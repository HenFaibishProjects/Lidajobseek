import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { z } from 'zod';
import type { ResearchHandoffEntity } from '../handoff/research-handoff.entity';

@Injectable()
export class NotificationEmailService {
  private transporter: Transporter | undefined;
  constructor(private readonly config: ConfigService) {}

  private settings() {
    const host = this.config.get<string>('SMTP_HOST');
    const to = this.config.get<string>('RECRUITER_NOTIFICATION_TO');
    const from = this.config.get<string>('RECRUITER_NOTIFICATION_FROM');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const port = Number(this.config.get<number>('SMTP_PORT') ?? 587);
    if (
      !host ||
      !z.email().safeParse(to).success ||
      !z.email().safeParse(from).success ||
      Boolean(user) !== Boolean(pass) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      return null;
    const secure = this.config.get<boolean | string>('SMTP_SECURE');
    return {
      host,
      to: to!,
      from: from!,
      port,
      secure: secure === true || secure === 'true',
      auth: user && pass ? { user, pass } : undefined,
    };
  }

  isConfigured(): boolean {
    return this.settings() !== null;
  }

  async sendHandoff(handoff: ResearchHandoffEntity): Promise<void> {
    const settings = this.settings();
    if (!settings) throw new Error('Notification email is not configured.');
    if (!this.transporter)
      this.transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.auth,
        requireTLS: !settings.secure,
        tls: { minVersion: 'TLSv1.2' },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    const base = this.config.get<string>('APP_BASE_URL');
    let link: string | null = null;
    if (base) {
      const url = new URL(base);
      if (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      ) {
        url.searchParams.set('handoff', handoff.id);
        url.hash = '';
        link = url.toString();
      }
    }
    const known = handoff.context.existingResearch;
    const text = `A serious hiring event was detected. A ChatGPT research handoff is waiting.
Company: ${handoff.companyName}
Role: ${handoff.roleTitle ?? 'Unknown'}
Event: ${handoff.eventType}
Reason: ${handoff.researchReason}

Quick/existing information: ${known ? `${known.whatTheyDo}\nWork model: ${known.workModel ?? 'Unknown'}\nResearch date: ${known.researchedAt}` : 'No saved company research is available.'}

${link ? `Open Research Handoff: ${link}` : `Open Pending ChatGPT Research in the application. Handoff ID: ${handoff.id}`}
Copy the prompt into ChatGPT Plus manually. No automatic deep API research was performed.`;
    const info = await this.transporter.sendMail({
      from: settings.from,
      to: settings.to,
      messageId: `<research-handoff-${handoff.id}@${settings.from.split('@')[1]}>`,
      subject:
        `Deep research needed: ${handoff.companyName} - ${handoff.roleTitle ?? 'Hiring process'}`
          .replace(/[\r\n]+/g, ' ')
          .slice(0, 200),
      text,
    });
    if (Array.isArray(info.rejected) && info.rejected.length)
      throw new Error('Notification recipient was rejected.');
  }
}
