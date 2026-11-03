import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('candidate_profiles')
export class CandidateProfileEntity {
  @PrimaryColumn({ type: 'varchar', length: 50 }) id!: string;
  @Column('jsonb') profile!: unknown;
  @Column({ type: 'timestamptz', nullable: true }) createdAt!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) updatedAt!: Date | null;
}
