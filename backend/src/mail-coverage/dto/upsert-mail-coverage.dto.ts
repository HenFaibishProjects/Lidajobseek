export class UpsertMailCoverageDto {
  companyName!: string;
  receivedCvEmail!: boolean;
  receivedCvDate?: string | null;
  rejectedEmail!: boolean;
  rejectedDate?: string | null;
}
