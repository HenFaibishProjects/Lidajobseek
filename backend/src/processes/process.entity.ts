import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { User } from '../users/user.entity';
import { Interaction } from '../interactions/interaction.entity';
import { SelfReview } from '../reviews/self-review.entity';
import { Contact } from '../contacts/contact.entity';

@Entity({ schema: 'app' })
export class Process {
  @PrimaryKey()
  id!: number;

  @Property()
  companyName!: string;

  @Property()
  roleTitle!: string;

  @Property()
  techStack!: string;

  @Property()
  location!: string;

  @Property()
  workMode!: string;

  @Property({ nullable: true })
  daysFromOffice?: number;

  @Property({ nullable: true })
  source?: string;

  @Property({ nullable: true })
  salaryExpectation?: number;

  @Property({ nullable: true, default: 'ILS' })
  salaryCurrency?: string;

  @Property({ nullable: true, default: 'Month' })
  salaryPeriod?: string;

  @Property()
  currentStage!: string;

  @Property({ nullable: true })
  dataFromThePhoneCall?: string;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  // Initial Interaction Details
  @Property({ nullable: true })
  initialInviteDate?: Date;

  @Property({ nullable: true })
  initialInviteMethod?: string;

  @Property({ nullable: true })
  initiatedBy?: string;

  @Property({ nullable: true })
  firstContactChannel?: string;

  @Property({ nullable: true })
  initialInviteContent?: string;

  // Offer Details
  @Property({ nullable: true })
  baseSalary?: number;

  @Property({ nullable: true })
  equity?: string;

  @Property({ nullable: true })
  bonus?: string;

  @Property({ nullable: true })
  signingBonus?: number;

  @Property({ nullable: true })
  benefits?: string;

  @Property({ nullable: true })
  offerDeadline?: Date;

  @Property({ nullable: true })
  nextFollowUp?: Date;

  // Decision Matrix
  @Property({ default: 0 })
  scoreTech: number = 0;

  @Property({ default: 0 })
  scoreWLB: number = 0;

  @Property({ default: 0 })
  scoreGrowth: number = 0;

  @Property({ default: 0 })
  scoreVibe: number = 0;

  @OneToMany(() => Interaction, interaction => interaction.process, { orphanRemoval: true })
  interactions = new Collection<Interaction>(this);

  @OneToMany(() => SelfReview, review => review.process, { orphanRemoval: true })
  reviews = new Collection<SelfReview>(this);

  @OneToMany(() => Contact, contact => contact.process, { orphanRemoval: true })
  contacts = new Collection<Contact>(this);

  @ManyToOne(() => User)
  user!: User;
}
