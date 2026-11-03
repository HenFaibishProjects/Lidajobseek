import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type {
  CheapRecruiterEmailClassification,
  RecruiterEmailAnalysis,
} from '../recruiter-email.schema';
import {
  EmailProcessingStatus,
  EmailFilterDecision,
} from '../recruiter-agent.types';
import type { RecruiterEmailDecision } from '../recruiter-email-decision.schema';

export enum EmailReviewStatus {
  UNREVIEWED = 'UNREVIEWED',

  // The system made the correct routing decision
  CORRECT = 'CORRECT',

  // Sent to LLM but should have been filtered
  FALSE_POSITIVE = 'FALSE_POSITIVE',

  // Filtered but should have reached the LLM
  FALSE_NEGATIVE = 'FALSE_NEGATIVE',
}

@Entity('email_processing_audit')
export class EmailProcessingAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: EmailProcessingStatus,
    enumName: 'email_processing_status_enum',
    default: EmailProcessingStatus.PENDING,
  })
  processingStatus: EmailProcessingStatus;

  @Column({ type: 'integer', default: 0 })
  processingAttempts: number;

  @Column({ type: 'text', nullable: true })
  processingError: string | null;

  @Column({ unique: true })
  gmailMessageId: string;

  @Column()
  from: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({
    type: 'enum',
    enum: EmailFilterDecision,
  })
  filterDecision: EmailFilterDecision;

  @Column({ type: 'text', nullable: true })
  filterReason: string | null;

  @Column({ default: false })
  sentToLlm: boolean;

  @Column({ type: 'varchar', nullable: true })
  llmClassification: string | null;

  @Column({ type: 'float', nullable: true })
  llmConfidence: number | null;

  @Column({ default: false })
  sentToCheapLlm: boolean;

  @Column({ type: 'jsonb', nullable: true })
  cheapLlmClassification: CheapRecruiterEmailClassification | null;

  @Column({ type: 'float', nullable: true })
  cheapLlmConfidence: number | null;

  @Column({ default: false })
  sentToExpensiveLlm: boolean;

  @Column({ type: 'jsonb', nullable: true })
  expensiveLlmResult: RecruiterEmailAnalysis | null;

  @Column({ default: false })
  sentToDecisionLlm: boolean;

  @Column({ type: 'jsonb', nullable: true })
  decisionLlmResult: RecruiterEmailDecision | null;

  @Column({
    type: 'enum',
    enum: EmailReviewStatus,
    default: EmailReviewStatus.UNREVIEWED,
  })
  reviewStatus: EmailReviewStatus;

  @Column({ type: 'text', nullable: true })
  reviewNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
