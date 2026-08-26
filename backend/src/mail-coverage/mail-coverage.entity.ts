import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { User } from '../users/user.entity';

@Entity({ schema: 'app' })
export class MailCoverage {
  @PrimaryKey()
  id!: number;

  @Index()
  @Property()
  companyName!: string;

  @Property({ type: 'text', nullable: true })
  note: string | null = null;

  @Property({ default: false })
  hadProcess: boolean = false;

  @Property({ default: false })
  receivedCvEmail: boolean = false;

  @Property({ nullable: true })
  receivedCvDate?: Date;

  @Property({ default: false })
  rejectedEmail: boolean = false;

  @Property({ nullable: true })
  rejectedDate?: Date;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Index()
  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Index()
  @ManyToOne(() => User)
  user!: User;
}
