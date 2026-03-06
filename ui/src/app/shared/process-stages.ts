export const PROCESS_STAGES: string[] = [
  // 1. Application Phase
  'Application Submitted',
  'Resume Under Review',

  // 2. Initial Screening
  'Initial Call Scheduled',
  'Initial Call Completed', // Useful for when the call is done, but no feedback yet

  // 3. Active Interviewing
  'Interview Scheduled',
  'Waiting for Interview Feedback',
  'Awaiting Next Interview', // Generalized from your original list
  
  // 4. Tasks & Assessments
  'Home Task Assigned',
  'Home Task Submitted (Under Review)', // Crucial addition: candidates hate when they submit a task and have no status for it
  
  // 5. Final Stages
  'Final Interview Scheduled', // Generalized from "Final HR Interview"
  'References Requested',
  'Background Check in Progress',

  // 6. Offer Phase
  'Offer Received',
  'Offer in Negotiation',
  'Offer Accepted',
  'Offer Declined',

  // 7. Closed / Inactive
  'Withdrawn', // Candidate pulled out
  'Rejected', // Company said no
  'Position Put On Hold', // Company froze the role
  'Ghosted / No Response' // Replaces your 14+ days rule with common candidate terminology
];

export const DEFAULT_PROCESS_STAGE = PROCESS_STAGES[0];
