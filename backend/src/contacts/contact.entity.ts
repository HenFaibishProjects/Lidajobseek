import { Entity, PrimaryKey, Property, ManyToOne, Index } from '@mikro-orm/core';
import { Process } from '../processes/process.entity';

@Entity({ schema: 'app' })
export class Contact {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property({ nullable: true })
  role?: string;

  @Property({ nullable: true })
  linkedIn?: string;

  @Property({ nullable: true })
  socialHooks?: string;

  @Property({ nullable: true })
  email?: string;

  @Property({ nullable: true })
  phone?: string;


  @Index()
  @ManyToOne(() => Process)
  process!: Process;
}
