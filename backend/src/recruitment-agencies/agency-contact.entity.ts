import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { RecruitmentAgency } from './recruitment-agency.entity';

@Entity({ schema: 'app' })
export class AgencyContact {
  @PrimaryKey()
  id!: number;

  @Property()
  fullName!: string;

  @Property({ nullable: true })
  phoneNumber?: string;

  @Property({ nullable: true })
  email?: string;

  @Property({ nullable: true })
  roleTitle?: string;

  @Property({ nullable: true })
  linkedinUrl?: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ default: false })
  isPrimaryContact: boolean = false;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Index()
  @ManyToOne(() => RecruitmentAgency)
  agency!: RecruitmentAgency;
}
