export interface MailCoverageImportEntry {
  companyName: string;
  note: string | null;
  receivedCvEmail: boolean;
  receivedCvDate: string | null;
  rejectedEmail: boolean;
  rejectedDate: string | null;
}

export interface MailCoverageImportPreview {
  entries: MailCoverageImportEntry[];
  sourceRows: number;
  skippedRows: number;
  duplicatesMerged: number;
  correctedFutureDates: number;
  errors: string[];
}

interface AggregatedImportEntry {
  companyName: string;
  positions: Set<string>;
  receivedCvDate: string | null;
  rejectedDate: string | null;
}

interface ParsedDate {
  value: string;
  correctedFutureYear: boolean;
}

export function parseMailCoverageMarkdown(
  value: string,
  now = new Date(),
): MailCoverageImportPreview {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = lines.map(splitTableRow).filter((row) => row.length > 1);
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes('date') &&
      headers.includes('company') &&
      headers.includes('status')
    );
  });

  if (headerIndex < 0) {
    return emptyPreview(
      'Could not find Date, Company and Status columns in the pasted table.',
    );
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const dateIndex = headers.indexOf('date');
  const companyIndex = headers.indexOf('company');
  const positionIndex = headers.indexOf('position');
  const statusIndex = headers.indexOf('status');
  const companies = new Map<string, AggregatedImportEntry>();
  let sourceRows = 0;
  let skippedRows = 0;
  let correctedFutureDates = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (isAlignmentRow(row) || row.every((cell) => !cell.trim())) continue;
    sourceRows += 1;

    const companyName = cleanMarkdownText(row[companyIndex] || '');
    const status = cleanMarkdownText(row[statusIndex] || '').toUpperCase();
    const parsedDate = parseDate(row[dateIndex] || '', now);
    if (
      !companyName ||
      !parsedDate ||
      (status !== 'RECEIVED' && status !== 'REJECTED')
    ) {
      skippedRows += 1;
      continue;
    }

    if (parsedDate.correctedFutureYear) correctedFutureDates += 1;
    const key = companyName.toLowerCase();
    const current = companies.get(key) || {
      companyName,
      positions: new Set<string>(),
      receivedCvDate: null,
      rejectedDate: null,
    };
    const position =
      positionIndex >= 0 ? cleanMarkdownText(row[positionIndex] || '') : '';
    if (position) current.positions.add(position);

    if (status === 'RECEIVED') {
      current.receivedCvDate = earlierDate(
        current.receivedCvDate,
        parsedDate.value,
      );
    } else {
      current.rejectedDate = laterDate(current.rejectedDate, parsedDate.value);
    }
    companies.set(key, current);
  }

  const errors: string[] = [];
  const entries = Array.from(companies.values())
    .map<MailCoverageImportEntry>((entry) => {
      if (
        entry.receivedCvDate &&
        entry.rejectedDate &&
        entry.rejectedDate < entry.receivedCvDate
      ) {
        errors.push(
          `${entry.companyName}: rejection date is earlier than the received date.`,
        );
      }
      const positions = Array.from(entry.positions);
      return {
        companyName: entry.companyName,
        note:
          positions.length === 0
            ? null
            : `${positions.length === 1 ? 'Position' : 'Positions'}: ${positions.join('; ')}`,
        receivedCvEmail: Boolean(entry.receivedCvDate),
        receivedCvDate: entry.receivedCvDate,
        rejectedEmail: Boolean(entry.rejectedDate),
        rejectedDate: entry.rejectedDate,
      };
    })
    .sort((a, b) =>
      a.companyName.localeCompare(b.companyName, undefined, {
        sensitivity: 'base',
      }),
    );

  if (entries.length === 0 && errors.length === 0) {
    errors.push('No valid RECEIVED or REJECTED rows were found.');
  }

  return {
    entries,
    sourceRows,
    skippedRows,
    duplicatesMerged: Math.max(0, sourceRows - skippedRows - entries.length),
    correctedFutureDates,
    errors,
  };
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function splitTableRow(line: string): string[] {
  if (line.includes('|')) return splitMarkdownRow(line);
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  return [line];
}

function normalizeHeader(value: string): string {
  return cleanMarkdownText(value).toLowerCase();
}

function cleanMarkdownText(value: string): string {
  const linkedText = value.replace(/\[([^\]]+)]\([^)]*\)/g, '$1');
  return linkedText.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function isAlignmentRow(row: string[]): boolean {
  return row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseDate(value: string, now: Date): ParsedDate | null {
  const match = cleanMarkdownText(value).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?/,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  const correctedFutureYear = year === now.getFullYear() + 1;
  if (correctedFutureYear) year = now.getFullYear();

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    value: `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    correctedFutureYear,
  };
}

function earlierDate(current: string | null, candidate: string): string {
  return !current || candidate < current ? candidate : current;
}

function laterDate(current: string | null, candidate: string): string {
  return !current || candidate > current ? candidate : current;
}

function emptyPreview(error: string): MailCoverageImportPreview {
  return {
    entries: [],
    sourceRows: 0,
    skippedRows: 0,
    duplicatesMerged: 0,
    correctedFutureDates: 0,
    errors: [error],
  };
}
