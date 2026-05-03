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

  @Property({ fieldName: 'pricing_plan', nullable: true, default: 'free' })
  pricingPlan?: 'free' | 'premium' | 'enterprise';

  @Property({ fieldName: 'theme_preference', nullable: true, default: 'light' })
  themePreference?: 'light' | 'dark' | 'auto';

  @Property({ fieldName: 'country_preference', nullable: true, default: '' })
  countryPreference?: string;

  @Property({ fieldName: 'date_format_preference', nullable: true, default: 'DD/MM/YYYY' })
  dateFormatPreference?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

  @Property({ fieldName: 'time_format_preference', nullable: true, default: '24' })
  timeFormatPreference?: '12' | '24';

  @Property({ fieldName: 'avatar_style_preference', nullable: true, default: 'avataaars' })
  avatarStylePreference?: string;

  @Property({ fieldName: 'has_seen_onboarding', nullable: true, default: true })
  hasSeenOnboarding?: boolean;

  @Property({ fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => Process, process => process.user)
  processes = new Collection<Process>(this);

  @OneToMany(() => Resource, resource => resource.user)
  resources = new Collection<Resource>(this);

  @OneToOne(() => Profile, profile => profile.user, { nullable: true, mappedBy: 'user' })
  profile?: Profile;
}