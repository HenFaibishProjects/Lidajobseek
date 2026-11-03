import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';

import type { IncomingEmail } from '../recruiter-agent.types';

@Injectable()
export class GmailClientService {
  private readonly gmail: gmail_v1.Gmail;

  constructor(private readonly configService: ConfigService) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
    );

    oauth2Client.setCredentials({
      refresh_token:
        this.configService.getOrThrow<string>('GOOGLE_REFRESH_TOKEN'),
    });

    this.gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client,
    });
  }

  async getRecentInboxEmails(
    maxResults = 20,
  ): Promise<IncomingEmail[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults,
    });

    const messages = response.data.messages ?? [];

    const emails = await Promise.all(
      messages.map(({ id }) => this.getEmail(id!)),
    );

    return emails;
  }

  async getEmail(messageId: string): Promise<IncomingEmail> {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;

    return {
      id: message.id!,
      threadId: message.threadId ?? undefined,
      from: this.getHeader(message.payload, 'From'),
      subject: this.getHeader(message.payload, 'Subject'),
      body: this.extractBody(message.payload),
      receivedAt: new Date(Number(message.internalDate)),
    };
  }

  private getHeader(
    payload: gmail_v1.Schema$MessagePart | undefined,
    headerName: string,
  ): string {
    return (
      payload?.headers?.find(
        ({ name }) =>
          name?.toLowerCase() === headerName.toLowerCase(),
      )?.value ?? ''
    );
  }

  private extractBody(
    payload: gmail_v1.Schema$MessagePart | undefined,
  ): string {
    if (!payload) {
      return '';
    }

    const plainText = this.findMimePart(payload, 'text/plain');

    if (plainText?.body?.data) {
      return this.decodeBody(plainText.body.data);
    }

    const html = this.findMimePart(payload, 'text/html');

    if (html?.body?.data) {
      return this.htmlToText(
        this.decodeBody(html.body.data),
      );
    }

    if (payload.body?.data) {
      return this.decodeBody(payload.body.data);
    }

    return '';
  }

  private findMimePart(
    part: gmail_v1.Schema$MessagePart,
    mimeType: string,
  ): gmail_v1.Schema$MessagePart | undefined {
    // An empty first alternative must not hide usable siblings or HTML.
    if (
      part.mimeType === mimeType &&
      part.body?.data &&
      this.decodeBody(part.body.data).trim()
    ) {
      return part;
    }

    for (const child of part.parts ?? []) {
      const found = this.findMimePart(child, mimeType);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private decodeBody(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf8');
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
}
