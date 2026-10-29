type CsvValue = string | number | boolean | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a CSV document from a header row and data rows.
 * Columns whose values contain a formula trigger are prefixed with a single
 * quote so spreadsheets treat them as text instead of executing them.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCell(sanitizeFormula(cell))).join(','));
  }
  return lines.join('\r\n');
}

function sanitizeFormula(value: CsvValue): CsvValue {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export function csvResponse(res: import('express').Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}
