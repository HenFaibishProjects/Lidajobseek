export class UpsertMailCoverageDto {
  companyName!: string;
  note?: string | null;
  receivedCvEmail!: boolean;
  receivedCvDate?: string | null;
  rejectedEmail!: boolean;
  rejectedDate?: string | null;
}
