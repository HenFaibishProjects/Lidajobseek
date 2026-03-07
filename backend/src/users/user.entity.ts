import { Entity, PrimaryKey, Property, OneToMany, Collection, OneToOne } from '@mikro-orm/core';
import { Process } from '../processes/process.entity';
import { Resource } from '../resources/resource.entity';
import { Profile } from '../profiles/profile.entity';

@Entity({ schema: 'app' })
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ unique: true })
  email!: string;

  @Property()
  password!: string;

  @Property({ nullable: true })
  name?: string;

  @Property({ nullable: true, default: 'free' })
  pricingPlan?: 'free' | 'premium' | 'enterprise';

  @Property({ nullable: true, default: 'light' })
  themePreference?: 'light' | 'dark' | 'auto';

  @Property({ nullable: true, default: '' })
  countryPreference?: string;

  @Property({ nullable: true, default: 'DD/MM/YYYY' })
  dateFormatPreference?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

  @Property({ nullable: true, default: '24' })
  timeFormatPreference?: '12' | '24';

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => Process, process => process.user)
  processes = new Collection<Process>(this);

  @OneToMany(() => Resource, resource => resource.user)
  resources = new Collection<Resource>(this);

  @OneToOne(() => Profile, profile => profile.user, { nullable: true, mappedBy: 'user' })
  profile?: Profile;
}