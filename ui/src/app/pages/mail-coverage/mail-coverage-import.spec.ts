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

  it('accepts a tab-separated table copied from a rendered table', () => {
    const preview = parseMailCoverageMarkdown(
      [
        'Date\tCompany\tPosition\tStatus\tAction\tDescription',
        '11/08/2026\tAidoc\tSenior Software Engineer\tREJECTED\t\tRejected email received',
        '12/08/2026\tApono\tBackend Developer\tRECEIVED\t\tCV received',
      ].join('\n'),
      new Date('2026-08-29T12:00:00Z'),
    );

    expect(preview.entries).toEqual([
      jasmine.objectContaining({
        companyName: 'Aidoc',
        rejectedEmail: true,
        rejectedDate: '2026-08-11',
      }),
      jasmine.objectContaining({
        companyName: 'Apono',
        receivedCvEmail: true,
        receivedCvDate: '2026-08-12',
      }),
    ]);
    expect(preview.errors).toEqual([]);
  });
});
