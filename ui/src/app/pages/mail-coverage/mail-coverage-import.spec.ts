import { parseMailCoverageMarkdown } from './mail-coverage-import';

describe('parseMailCoverageMarkdown', () => {
  const header = `
| **Date** | **Company** | **Position** | **Status** |
| :---: | :---: | :---: | :---: |
`;

  it('merges repeated companies and keeps the useful date for each status', () => {
    const preview = parseMailCoverageMarkdown(
      `${header}
| 11/08/2026 | Apono | Backend Developer | RECEIVED |
| 26/08/2026 10:58 | Apono | Backend Developer | RECEIVED |
| 27/08/2026 | Apono | Backend Developer | REJECTED |`,
      new Date('2026-08-29T12:00:00Z'),
    );

    expect(preview.entries).toEqual([
      jasmine.objectContaining({
        companyName: 'Apono',
        note: 'Position: Backend Developer',
        receivedCvDate: '2026-08-11',
        rejectedDate: '2026-08-27',
      }),
    ]);
    expect(preview.duplicatesMerged).toBe(2);
    expect(preview.errors).toEqual([]);
  });

  it('extracts a company from a Markdown link and corrects a next-year typo', () => {
    const preview = parseMailCoverageMarkdown(
      `${header}
| 24/08/2027 | [monday.com](http://monday.com) | Engineer | REJECTED |`,
      new Date('2026-08-29T12:00:00Z'),
    );

    expect(preview.entries[0]).toEqual(
      jasmine.objectContaining({
        companyName: 'monday.com',
        rejectedEmail: true,
        rejectedDate: '2026-08-24',
      }),
    );
    expect(preview.correctedFutureDates).toBe(1);
  });

  it('reports a useful error when required columns are missing', () => {
    const preview = parseMailCoverageMarkdown('| Company | Notes |');

    expect(preview.entries).toEqual([]);
    expect(preview.errors[0]).toContain('Date, Company and Status');
  });
});
