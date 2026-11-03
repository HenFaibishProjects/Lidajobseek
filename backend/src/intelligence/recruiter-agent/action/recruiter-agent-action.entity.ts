import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  RECRUITER_AGENT_ACTION_TYPES,
  RecruiterAgentActionStatus,
} from './recruiter-agent-action.types';
import type {
  RecruiterAgentActionType,
  RecruiterAgentActionResult,
} from './recruiter-agent-action.types';

@Entity('recruiter_agent_actions')
@Unique('UQ_recruiter_action_message_type', ['gmailMessageId', 'actionType'])
export class RecruiterAgentActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_recruiter_action_message')
  @Column({ type: 'varchar' })
  gmailMessageId: string;

  @Column({
    type: 'enum',
    enum: [...RECRUITER_AGENT_ACTION_TYPES],
    enumName: 'recruiter_agent_action_type_enum',
  })
  actionType: RecruiterAgentActionType;

  @Index('IDX_recruiter_action_status')
  @Column({
    type: 'enum',
    enum: RecruiterAgentActionStatus,
    enumName: 'recruiter_agent_action_status_enum',
    default: RecruiterAgentActionStatus.PENDING,
  })
  status: RecruiterAgentActionStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'integer', nullable: true })
  emailProcessingAttempt: number | null;

  @Column({ type: 'jsonb', nullable: true })
  result: RecruiterAgentActionResult | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
