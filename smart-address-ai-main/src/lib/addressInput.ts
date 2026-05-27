import { normalizePastedAddressLine } from "./spreadsheet";

/** Split textarea content into address lines (handles Excel row paste with tabs). */
export function parseAddressInputLines(raw: string): string[] {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map(normalizePastedAddressLine)
    .filter(Boolean);
}
