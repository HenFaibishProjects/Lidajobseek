export class UpsertMailCoverageDto {
  companyName!: string;
  note?: string | null;
  hadProcess?: boolean;
  receivedCvEmail!: boolean;
  receivedCvDate?: string | null;
  rejectedEmail!: boolean;
  rejectedDate?: string | null;
}
