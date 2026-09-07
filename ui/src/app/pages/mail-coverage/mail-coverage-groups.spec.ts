import { MailCoverageEntry } from '../../services/mail-coverage.service';
import {
  isProcessRejectionEntry,
  splitMailCoverageEntries,
} from './mail-coverage.component';

function entry(
  id: number,
  hadProcess: boolean,
  rejectedEmail: boolean,
): MailCoverageEntry {
  return {
    id,
    companyName: `Company ${id}`,
    note: null,
    hadProcess,
    receivedCvEmail: false,
    receivedCvDate: null,
    rejectedEmail,
    rejectedDate: rejectedEmail ? '2026-09-01' : null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };
}

describe('mail coverage grouping', () => {
  it('treats an entry as a process rejection only when both conditions are true', () => {
    expect(isProcessRejectionEntry(entry(1, true, true))).toBeTrue();
    expect(isProcessRejectionEntry(entry(2, true, false))).toBeFalse();
    expect(isProcessRejectionEntry(entry(3, false, true))).toBeFalse();
  });

  it('splits every entry into exactly one table', () => {
    const entries = [
      entry(1, true, true),
      entry(2, true, false),
      entry(3, false, true),
      entry(4, false, false),
    ];

    const groups = splitMailCoverageEntries(entries);

    expect(groups.processRejections.map((item) => item.id)).toEqual([1]);
    expect(groups.other.map((item) => item.id)).toEqual([2, 3, 4]);
    expect(groups.other.length + groups.processRejections.length).toBe(
      entries.length,
    );
  });
});
