export type ReminderChannelsDto = {
  email: boolean;
  sms: boolean;
};

export type ReminderDto = {
  enabled: boolean;
  beforeMinutes: number;
  channels: ReminderChannelsDto;
  emailSentAt?: string;
  smsSentAt?: string;
};

/** Single entry in the multi-reminder array sent by the UI */
export type ReminderItemDto = {
  beforeMinutes: number;
  channels: ReminderChannelsDto;
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
