import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('job_match_cache')
@Index('UQ_job_match_cache_context', ['companyKey', 'profileFingerprint'], {
  unique: true,
})
export class JobMatchCacheEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 200 }) companyKey!: string;
  @Column({ type: 'varchar', length: 64 }) profileFingerprint!: string;
  @Column('jsonb') content!: unknown;
  @Column('timestamptz') refreshedAt!: Date;
}
