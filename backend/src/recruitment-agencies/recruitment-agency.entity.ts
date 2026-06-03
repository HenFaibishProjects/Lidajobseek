import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection, Index } from '@mikro-orm/core';
import { User } from '../users/user.entity';
import { AgencyContact } from './agency-contact.entity';
import { AgencyInteraction } from './agency-interaction.entity';

@Entity({ schema: 'app' })
export class RecruitmentAgency {
  @PrimaryKey()
  id!: number;

  @Property()
  agencyName!: string;

  @Property({ nullable: true })
  website?: string;

  @Property({ type: 'text', nullable: true })
  notes?: string;

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Index()
  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Index()
  @ManyToOne(() => User)
  user!: User;

  @OneToMany(() => AgencyContact, (c) => c.agency, { orphanRemoval: true })
  contacts = new Collection<AgencyContact>(this);

  @OneToMany(() => AgencyInteraction, (i) => i.agency, { orphanRemoval: true })
  interactions = new Collection<AgencyInteraction>(this);
}
