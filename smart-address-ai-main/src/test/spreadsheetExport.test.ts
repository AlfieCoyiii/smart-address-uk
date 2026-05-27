import { describe, expect, it } from "vitest";
import { buildTsvForClipboard, sanitizeSpreadsheetCell } from "@/lib/spreadsheetExport";

describe("spreadsheetExport", () => {
  it("replaces tabs in cells so TSV columns stay aligned", () => {
    const building = "V.05.03 Building 12\t White City Living";
    expect(sanitizeSpreadsheetCell(building)).toBe("V.05.03 Building 12 White City Living");

    const tsv = buildTsvForClipboard(
      ["Building", "Street number"],
      [[building, "54"]],
    );
    expect(tsv.split("\n")[1].split("\t")).toEqual([
      "V.05.03 Building 12 White City Living",
      "54",
    ]);
  });
});
