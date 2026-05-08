export class CreateReviewDto {
  processId: number;
  stage: string;
  confidence: number; // 1–5
  whatWentWell: string;
  whatFailed: string;
  gaps: string;
  mood?: string;
  energyLevel?: number;
  keyLearning?: string;
  nextActionPlan?: string;
  contactPersonId?: number;
  interactionId?: number;
}
