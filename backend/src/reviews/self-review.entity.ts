import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { Process } from '../processes/process.entity';

@Entity({ schema: 'app' })
export class SelfReview {
  @PrimaryKey()
  id!: number;

  @Property()
  stage!: string;

  @Property()
  confidence!: number;

  @Property()
  whatWentWell!: string;

  @Property()
  whatFailed!: string;

  @Property()
  gaps!: string;

  @Property({ nullable: true })
  mood?: string; // emoji key: great | good | neutral | tough | rough

  @Property({ nullable: true })
  energyLevel?: number; // 1–5

  @Property({ nullable: true })
  keyLearning?: string;

  @Property({ nullable: true })
  nextActionPlan?: string;

  @Property({ nullable: true })
  contactPersonId?: number; // ref to Contact.id (soft ref, no FK constraint)

  @Property({ nullable: true })
  interactionId?: number; // when set, this review is scoped to a specific interaction


  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Index()
  @ManyToOne(() => Process)
  process!: Process;
}