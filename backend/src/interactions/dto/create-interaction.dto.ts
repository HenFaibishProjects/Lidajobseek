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

export class CreateInteractionDto {
  processId: number;
  date: string;
  interviewType: string;
  participants?: any;
  summary: string;
  testsAssessment?: string; // Tests or technical assessments during interview
  roleInsights?: string; // What was learned about the role
  notes?: string;
  headsup?: string; // Heads-up information for scheduled interview
  reminder?: ReminderDto;
  nextInviteStatus?: string;
  nextInviteDate?: string;
  nextInviteLink?: string;
  nextInviteType?: string;
  invitationExtended?: string; // 'yes', 'later', or 'no'
}
