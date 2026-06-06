import { Injectable, Logger } from '@nestjs/common';
import { Interaction } from './interaction.entity';

@Injectable()
export class WhatsAppReminderService {
  private readonly logger = new Logger(WhatsAppReminderService.name);
  private readonly idInstance?: string;
  private readonly apiTokenInstance?: string;
  private readonly recipientPhone?: string;

  constructor() {
    this.idInstance = process.env.GREEN_API_ID_INSTANCE;
    this.apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
    this.recipientPhone = process.env.GREEN_API_RECIPIENT_PHONE;

    if (!this.idInstance || !this.apiTokenInstance || !this.recipientPhone) {
      this.logger.warn(
        'WhatsAppReminderService (GREEN-API) is not configured (GREEN_API_ID_INSTANCE/GREEN_API_TOKEN_INSTANCE/GREEN_API_RECIPIENT_PHONE missing). WhatsApp reminders are disabled.',
      );
    }
  }

  isConfigured(): boolean {
    return !!(this.idInstance && this.apiTokenInstance && this.recipientPhone);
  }

  buildReminderWhatsAppText(interaction: Interaction): string {
    const interviewDate = new Date(interaction.date);
    const dateText = interviewDate.toLocaleDateString('en-GB', { dateStyle: 'medium' });
    const timeText = interviewDate.toLocaleTimeString('en-GB', { timeStyle: 'short' });
    const companyName = interaction.process?.companyName || 'N/A';
    const positionName = interaction.process?.roleTitle || 'N/A';

    return `Interview reminder:
You have an interview scheduled for ${dateText} at ${timeText}.
Company: ${companyName}
Position: ${positionName}`;
  }

  async sendInterviewReminder(message: string): Promise<void> {
    const idInstance = this.idInstance;
    const apiTokenInstance = this.apiTokenInstance;
    const recipientPhone = this.recipientPhone;

    if (!idInstance || !apiTokenInstance || !recipientPhone) {
      this.logger.warn('GREEN-API is not configured. Message not sent.');
      return;
    }

    try {
      const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: `${recipientPhone}@c.us`,
          message: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`GREEN-API error response: ${response.status} ${errorText}`);
        return;
      }

      this.logger.log(`WhatsApp message sent successfully via GREEN-API.`);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message via GREEN-API`, error as any);
    }
  }
}
