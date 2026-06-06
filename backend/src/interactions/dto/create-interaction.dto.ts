export type ReminderChannelsDto = {
  email: boolean;
};

export type ReminderDto = {
  enabled: boolean;
  beforeMinutes: number;
  channels: ReminderChannelsDto;
  sendWhatsAppReminder?: boolean;
  emailSentAt?: string;
  whatsAppSentAt?: string;
};

/** Single entry in the multi-reminder array sent by the UI */
export type ReminderItemDto = {
  beforeMinutes: number;
  channels: ReminderChannelsDto;
  sendWhatsAppReminder?: boolean;
  whatsAppSentAt?: string;
};


export class CreateInteractionDto {
  processId?: number;
  agencyId?: number;
  date: string;
  interviewType: string;
  participants?: any;
  summary: string;
  testsAssessment?: string;
  roleInsights?: string;
  notes?: string;
  headsup?: string;
  /** Legacy single-reminder (kept for backward compat) */
  reminder?: ReminderDto;
  /** New: array of independent reminders */
  reminders?: ReminderItemDto[];
  nextInviteStatus?: string;
  nextInviteDate?: string;
  nextInviteLink?: string;
  nextInviteType?: string;
  invitationExtended?: string;
}
