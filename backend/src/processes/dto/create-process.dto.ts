export class CreateProcessDto {
  companyName: string;
  roleTitle: string;
  techStack: string;
  location: string;
  workMode: string;
  daysFromOffice?: number; // For hybrid work mode
  source?: string;
  salaryExpectation?: number;
  currentStage: string;
  dataFromThePhoneCall?: string;
  nextFollowUp?: string;

  // Initial Interaction Details
  initialInviteDate?: string;
  initialInviteMethod?: string;
  initiatedBy?: string;
  firstContactChannel?: string;
  initialInviteContent?: string;

  // Career Intelligence
  scoreTech?: number;
  scoreWLB?: number;
  scoreGrowth?: number;
  scoreVibe?: number;
  tailoredPitch?: string;
  cvVersion?: string;
  submissionLink?: string;
}
