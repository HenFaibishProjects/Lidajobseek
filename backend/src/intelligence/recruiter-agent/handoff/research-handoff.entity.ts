import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResearchHandoffStatus } from './research-handoff.types';
import type { ResearchHandoffContext } from './research-handoff.types';

@Entity('recruiter_research_handoffs')
export class ResearchHandoffEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', unique: true }) gmailMessageId: string;
  @Column({ type: 'varchar', length: 200 }) companyName: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) roleTitle:
    string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) recruiterName:
    string | null;
  @Column({ type: 'varchar', length: 50 }) eventType: string;
  @Column({ type: 'text' }) researchReason: string;
  @Index('IDX_research_handoff_status')
  @Column({
    type: 'enum',
    enum: ResearchHandoffStatus,
    enumName: 'research_handoff_status_enum',
    default: ResearchHandoffStatus.PENDING_CHATGPT,
  })
  status: ResearchHandoffStatus;
  @Column({ type: 'uuid', nullable: true }) existingReportId: string | null;
  @Column({ type: 'jsonb' }) context: ResearchHandoffContext;
  @Column({ type: 'jsonb' }) requestedResearch: string[];
  @Column({ type: 'text' }) chatGptPrompt: string;
  @Column({ type: 'jsonb', nullable: true }) deepResearchResult: unknown | null;
  @Column({ type: 'timestamptz', nullable: true })
  notificationSentAt: Date | null;
  @Column({ type: 'text', nullable: true }) notificationError: string | null;
  @Column({ type: 'integer', default: 0 }) notificationAttempts: number;
  @Column({ type: 'timestamptz', nullable: true })
  notificationClaimedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  notificationRetryAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
}
