import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
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

  @Property()
  summary!: string;

  @Property({ nullable: true })
  testsAssessment?: string;

  @Property({ nullable: true })
  roleInsights?: string;

  @Property({ nullable: true })
  notes?: string;

  @Property({ nullable: true })
  headsup?: string;

  @Property({ type: 'json', nullable: true })
  reminder?: {
    enabled: boolean;
    beforeMinutes: number;
    channels: {
      email: boolean;
      sms: boolean;
    };
    emailSentAt?: string;
    smsSentAt?: string;
  };

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

  @ManyToOne(() => Process)
  process!: Process;
}
