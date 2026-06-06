import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { User } from '../users/user.entity';

@Entity({ schema: 'app' })
export class Template {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  /**
   * Stored as a JSON array of { label: string; content: string }
   * e.g. [{ label: "v1", content: "..." }, { label: "v2", content: "..." }]
   */
  @Property({ type: 'json' })
  versions: { label: string; content: string }[] = [];

  @Property({ onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Index()
  @Property({ onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Index()
  @ManyToOne(() => User)
  user!: User;
}
