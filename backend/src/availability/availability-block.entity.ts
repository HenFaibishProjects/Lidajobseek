import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { User } from '../users/user.entity';

@Entity({ schema: 'app' })
@Index({ properties: ['user', 'startDate'] })
@Index({ properties: ['user', 'startsAt', 'endsAt'] })
export class AvailabilityBlock {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User)
  user!: User;

  @Property({ type: 'date' })
  startDate!: string;

  @Property({ type: 'date' })
  endDate!: string;

  @Property({ nullable: true })
  startTime?: string;

  @Property({ nullable: true })
  endTime?: string;

  @Property({ columnType: 'timestamptz' })
  startsAt!: Date;

  @Property({ columnType: 'timestamptz' })
  endsAt!: Date;

  @Property()
  timeZone!: string;

  @Property({ default: false })
  allDay = false;

  @Property({ default: false })
  repeatWeekly = false;

  @Property({ type: 'text', nullable: true })
  reason: string | null = null;

  @Property({ columnType: 'timestamptz', onCreate: () => new Date() })
  createdAt = new Date();

  @Property({
    columnType: 'timestamptz',
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
  })
  updatedAt = new Date();
}
