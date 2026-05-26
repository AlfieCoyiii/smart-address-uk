/** Maximum characters allowed per address line (must match parse_api MAX_ADDRESS_LINE_CHARS). */
export const MAX_ADDRESS_LINE_CHARS = 150;

export function findOverlongAddressLines(lines: string[]): { line: number; length: number }[] {
  return lines
    .map((line, index) => ({ line: index + 1, length: line.length }))
    .filter(({ length }) => length > MAX_ADDRESS_LINE_CHARS);
}
