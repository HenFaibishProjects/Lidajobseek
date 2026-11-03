import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Index('IDX_company_normalized_name', { unique: true })
  @Column({ type: 'varchar', length: 200 })
  normalizedName!: string;
  @Column({ type: 'text', nullable: true }) website!: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  manuallyUpdatedAt!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
