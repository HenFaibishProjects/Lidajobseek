export interface IncomingEmail {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

export enum EmailProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum EmailFilterDecision {
  PASS = 'PASS',
  BLOCKED_SENDER = 'BLOCKED_SENDER',
  BLOCKED_DOMAIN = 'BLOCKED_DOMAIN',
  REJECTION = 'REJECTION',
  ADVERTISEMENT = 'ADVERTISEMENT',
}

export interface RecruiterEmailPrefilterResult {
  shouldAnalyze: boolean;
  decision: EmailFilterDecision;
  reasons: string[];
}

export interface RecruiterEmailClassification {
  isRecruiterEmail: boolean;
  confidence: number;
  companyName: string | null;
  roleTitle: string | null;
  recruiterName: string | null;
  summary: string | null;
}