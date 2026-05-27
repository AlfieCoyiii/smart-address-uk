/**
 * Helpers so clipboard/CSV export and pasted Excel rows align with column headings.
 */

/** Turn a pasted spreadsheet row (tab-separated cells) into one address line. */
export function normalizePastedAddressLine(line: string): string {
  const trimmed = line.replace(/\r/g, "").trim();
  if (!trimmed) return "";

  if (trimmed.includes("\t")) {
    return trimmed
      .split("\t")
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0)
      .join(", ");
  }

  return trimmed.replace(/\s+/g, " ").trim();
}

/** Remove characters that would create extra columns in Excel/TSV paste. */
export function sanitizeSpreadsheetCell(value: string): string {
  return value
    .replace(/[\t\r\n\u000b\u000c\u0085]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTsvForClipboard(headers: string[], rows: string[][]): string {
  const safeHeaders = headers.map(sanitizeSpreadsheetCell);
  const colCount = safeHeaders.length;
  const safeRows = rows.map((row) => {
    const cells = row.slice(0, colCount).map(sanitizeSpreadsheetCell);
    while (cells.length < colCount) cells.push("");
    return cells.join("\t");
  });
  return [safeHeaders.join("\t"), ...safeRows].join("\n");
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${sanitizeSpreadsheetCell(value).replace(/"/g, '""')}"`;
  const colCount = headers.length;
  const headerLine = headers.map(escape).join(",");
  const dataLines = rows.map((row) => {
    const cells = row.slice(0, colCount).map(escape);
    while (cells.length < colCount) cells.push('""');
    return cells.join(",");
  });
  return [headerLine, ...dataLines].join("\n");
}
