import { describe, expect, it } from "vitest";
import {
  buildTsvForClipboard,
  normalizePastedAddressLine,
  sanitizeSpreadsheetCell,
} from "@/lib/spreadsheet";

describe("spreadsheet helpers", () => {
  it("normalizes tab-separated Excel rows into one line", () => {
    expect(normalizePastedAddressLine("Flat 3\t14 Baker St\tLondon\tW1U\t9FD")).toBe(
      "Flat 3, 14 Baker St, London, W1U, 9FD",
    );
  });

  it("strips tabs and newlines from cell values", () => {
    expect(sanitizeSpreadsheetCell("9FD\nextra")).toBe("9FD extra");
    expect(sanitizeSpreadsheetCell("a\tb")).toBe("a b");
  });

  it("outputs fixed column count for TSV", () => {
    const tsv = buildTsvForClipboard(["Outward", "Inward"], [["W1U", "3BU"], ["SW1A", "1AA\trogue"]]);
    const lines = tsv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1].split("\t")).toHaveLength(2);
    expect(lines[2].split("\t")).toHaveLength(2);
    expect(lines[2]).toBe("SW1A\t1AA rogue");
  });
});
