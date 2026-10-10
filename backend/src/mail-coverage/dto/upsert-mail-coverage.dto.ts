export class UpsertMailCoverageDto {
  companyName!: string;
  note?: string | null;
  hadProcess?: boolean;
  receivedCvCount?: number;
  rejectedCount?: number;
  receivedCvImportKeys?: string[];
  rejectedImportKeys?: string[];
  receivedCvEmail!: boolean;
  receivedCvDate?: string | null;
  rejectedEmail!: boolean;
  rejectedDate?: string | null;
}
