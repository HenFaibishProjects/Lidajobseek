import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { Process } from '../processes/process.entity';

@Entity({ schema: 'app' })
export class Interaction {
  @PrimaryKey()
  id!: number;

  @Property()
  date!: Date;

  @Property()
  interviewType!: string;

  @Property({ type: 'json', nullable: true })
  participants?: any;

  @Property({ type: 'text' })
  summary!: string;

  @Property({ type: 'text', nullable: true })
  testsAssessment?: string;

  @Property({ type: 'text', nullable: true })
  roleInsights?: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ type: 'text', nullable: true })
  headsup?: string;

  @Property({ type: 'json', nullable: true })
  reminder?: {
    enabled: boolean;
    beforeMinutes: number;
    channels: {
      email: boolean;
    };
    sendWhatsAppReminder?: boolean;
    emailSentAt?: string;
    whatsAppSentAt?: string;
  };

  /** Multiple reminders support — each entry is independent */
  @Property({ type: 'json', nullable: true })
  reminders?: Array<{
    beforeMinutes: number;
    channels: { email: boolean };
    sendWhatsAppReminder?: boolean;
    emailSentAt?: string;
    whatsAppSentAt?: string;
  }>;


  // Next Interview Invitation Tracking
  @Property({ nullable: true })
  nextInviteStatus?: string;

  @Property({ nullable: true })
  nextInviteDate?: Date;

  @Property({ nullable: true })
  nextInviteLink?: string;

  @Property({ nullable: true })
  nextInviteType?: string;

  @Property({ nullable: true })
  invitationExtended?: string;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Index()
  @ManyToOne(() => Process)
  process!: Process;
}
