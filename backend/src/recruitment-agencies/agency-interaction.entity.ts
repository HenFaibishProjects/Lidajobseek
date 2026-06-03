import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { RecruitmentAgency } from './recruitment-agency.entity';
import { AgencyContact } from './agency-contact.entity';

@Entity({ schema: 'app' })
export class AgencyInteraction {
  @PrimaryKey()
  id!: number;

  @Property()
  interactionDate!: Date;

  @Property()
  interactionType!: string;

  @Property()
  direction!: string;

  @Property({ type: 'text' })
  summary!: string;

  @Property({ default: false })
  cvSent: boolean = false;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Index()
  @ManyToOne(() => RecruitmentAgency)
  agency!: RecruitmentAgency;

  @ManyToOne(() => AgencyContact, { nullable: true })
  contact?: AgencyContact;
}
