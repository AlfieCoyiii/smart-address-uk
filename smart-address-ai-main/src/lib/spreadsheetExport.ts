/** Strip characters that break tab- or comma-separated clipboard/CSV paste. */
export function sanitizeSpreadsheetCell(value: string): string {
  return value
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function buildTsvForClipboard(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(sanitizeSpreadsheetCell).join("\t");
  const dataLines = rows.map((row) =>
    row.map(sanitizeSpreadsheetCell).join("\t"),
  );
  return [headerLine, ...dataLines].join("\n");
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => `"${sanitizeSpreadsheetCell(cell).replace(/"/g, '""')}"`;
  const headerLine = headers.map(escape).join(",");
  const dataLines = rows.map((row) => row.map(escape).join(","));
  return [headerLine, ...dataLines].join("\n");
}
