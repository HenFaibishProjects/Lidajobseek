import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from './company.entity';
import type { ResearchMode } from './research-mode';
import type { CompanyCacheContent, RoleCacheContent } from './research-cache';

@Entity('research_cache')
@Index(
  'UQ_research_cache_context',
  ['companyId', 'section', 'roleIntentKey', 'profileFingerprint', 'mode'],
  { unique: true },
)
export class ResearchCacheEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') companyId!: string;
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company!: Company;
  @Column({ type: 'varchar', length: 10 }) section!: 'company' | 'roles';
  @Column({ type: 'varchar', length: 510, default: '' }) roleIntentKey!: string;
  @Column({ type: 'varchar', length: 64, default: '' })
  profileFingerprint!: string;
  @Column({ type: 'varchar', length: 10 }) mode!: ResearchMode;
  @Column('timestamptz') refreshedAt!: Date;
  @Column('uuid') reportId!: string;
  @Column('jsonb') content!: CompanyCacheContent | RoleCacheContent;
}
