import type { ColumnKey, ParsedAddress } from "./addressParser";

export const LAYOUT_EXAMPLE_ADDRESS =
  "Flat 3, Ashton House, 14 Baker Street, London, W1U 3BU";

export const LAYOUT_EXAMPLE_ROW: ParsedAddress = {
  flatNumber: "3",
  buildingName: "Ashton House",
  flatAndBuilding: "Flat 3, Ashton House",
  streetNumber: "14",
  streetName: "Baker Street",
  town: "London",
  postcodeStart: "W1U",
  postcodeEnd: "3BU",
  addressLine: "Flat 3, Ashton House, 14 Baker Street",
};

export type LayoutMode = "full" | "summary";

export type DisplayColumn = ColumnKey | "addressLine";

export type OutputLayoutConfig = {
  mode: LayoutMode;
  combinePostcode: boolean;
  combineFlatWithBuilding: boolean;
};

export const ALL_FIELD_KEYS: ColumnKey[] = [
  "flatNumber",
  "buildingName",
  "streetNumber",
  "streetName",
  "town",
  "postcodeStart",
  "postcodeEnd",
];

export const FIELD_CHIP_LABELS: Record<ColumnKey, string> = {
  flatNumber: "Flat",
  buildingName: "Building",
  streetNumber: "Street no.",
  streetName: "Street name",
  town: "Town",
  postcodeStart: "Outward",
  postcodeEnd: "Inward",
};

export const DEFAULT_OUTPUT_LAYOUT: OutputLayoutConfig = {
  mode: "full",
  combinePostcode: false,
  combineFlatWithBuilding: false,
};

export function applyLayoutPatch(
  layout: OutputLayoutConfig,
  patch: Partial<OutputLayoutConfig>,
): OutputLayoutConfig {
  const next: OutputLayoutConfig = { ...layout, ...patch };

  if (patch.mode === "summary") {
    next.combinePostcode = true;
  }

  return next;
}

export function columnsForLayout(layout: OutputLayoutConfig): DisplayColumn[] {
  if (layout.mode === "summary") {
    return ["addressLine", "town", "postcodeStart"];
  }

  let cols: DisplayColumn[] = [...ALL_FIELD_KEYS];

  if (layout.combineFlatWithBuilding) {
    cols = cols.filter((c) => c !== "flatNumber");
  }
  if (layout.combinePostcode) {
    cols = cols.filter((c) => c !== "postcodeEnd");
  }

  return cols;
}

export function outputColumnLabels(layout: OutputLayoutConfig): string[] {
  return columnsForLayout(layout).map((col) => labelForDisplayColumn(col, layout));
}

export type ColumnJoinId = "flat-building" | "postcode";

export type OutputHeaderSegment =
  | { kind: "column"; col: DisplayColumn }
  | { kind: "join"; id: ColumnJoinId; merged: boolean };

export type TableBodySegment =
  | { kind: "column"; col: DisplayColumn }
  | { kind: "join-spacer" };

/** Body cells aligned with headerSegmentsForLayout (join icons sit in spacer cells). */
export function tableBodySegmentsForLayout(layout: OutputLayoutConfig): TableBodySegment[] {
  return headerSegmentsForLayout(layout).map((segment) =>
    segment.kind === "join" ? { kind: "join-spacer" } : { kind: "column", col: segment.col },
  );
}

/** Header cells for the interactive output preview (columns + merge/split controls). */
export function headerSegmentsForLayout(layout: OutputLayoutConfig): OutputHeaderSegment[] {
  const cols = columnsForLayout(layout);
  const segments: OutputHeaderSegment[] = [];

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const next = cols[i + 1];

    if (
      layout.mode === "full" &&
      col === "buildingName" &&
      layout.combineFlatWithBuilding
    ) {
      segments.push({ kind: "join", id: "flat-building", merged: true });
    }

    segments.push({ kind: "column", col });

    if (layout.mode === "full") {
      if (col === "flatNumber" && next === "buildingName") {
        segments.push({ kind: "join", id: "flat-building", merged: false });
      }
    }

    if (layout.mode === "full") {
      if (col === "postcodeStart" && next === "postcodeEnd") {
        segments.push({ kind: "join", id: "postcode", merged: false });
      }
      if (col === "postcodeStart" && layout.combinePostcode && !next) {
        segments.push({ kind: "join", id: "postcode", merged: true });
      }
    }
  }

  return segments;
}

export function labelForDisplayColumn(
  col: DisplayColumn,
  layout: OutputLayoutConfig,
): string {
  if (col === "addressLine") return "Address line";
  if (layout.combinePostcode && col === "postcodeStart") return "Postcode";
  if (
    layout.mode === "full" &&
    layout.combineFlatWithBuilding &&
    col === "buildingName"
  ) {
    return "Flat and Building";
  }
  return FIELD_CHIP_LABELS[col as ColumnKey] ?? col;
}

export function buildAddressLineDisplay(
  row: ParsedAddress,
  originalAddress?: string,
): string {
  const flatPhrase =
    originalAddress && row.flatNumber
      ? flatPhraseFromOriginal(originalAddress, row.flatNumber)
      : "";
  const tokens: string[] = [];
  if (flatPhrase) {
    tokens.push(...flatPhrase.split(/\s+/));
  } else if (row.flatNumber?.trim()) {
    tokens.push(...row.flatNumber.trim().split(/\s+/));
  }
  for (const part of [row.buildingName, row.streetNumber, row.streetName]) {
    const p = (part || "").trim();
    if (p) tokens.push(...p.split(/\s+/));
  }
  if (!tokens.length) return "";
  if (originalAddress?.trim()) {
    return joinTokensPreservingCommas(originalAddress, tokens);
  }
  return [row.flatNumber, row.buildingName, row.streetNumber, row.streetName]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function resolveAddressLine(row: ParsedAddress, originalAddress?: string): string {
  if (row.addressLine?.trim()) return row.addressLine.trim();
  return buildAddressLineDisplay(row, originalAddress);
}

/** Ensure API/fallback rows always carry addressLine and flatAndBuilding for post-split toggles. */
export function enrichParsedAddress(
  row: ParsedAddress,
  originalAddress?: string,
): ParsedAddress {
  const addressLine = row.addressLine?.trim() || buildAddressLineDisplay(row, originalAddress);
  const flatAndBuilding =
    row.flatAndBuilding?.trim() ||
    buildFlatAndBuildingDisplay(row.flatNumber, row.buildingName, originalAddress);
  return {
    ...row,
    addressLine: addressLine || undefined,
    flatAndBuilding: flatAndBuilding || undefined,
  };
}

function flatPhraseFromOriginal(originalAddress: string, flatNumber: string): string {
  const flat = flatNumber.trim();
  if (!flat) return "";
  if (/^(flat|flt|apartment|apt|suite|unit)\b/i.test(flat)) return flat;
  const esc = flat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = originalAddress.match(
    new RegExp(`\\b(Flat|Flt|Apartment|Apt|Suite|Unit)\\.?\\s+${esc}\\b`, "i"),
  );
  return match ? match[0] : "";
}

function joinTokensPreservingCommas(originalAddress: string, tokens: string[]): string {
  if (!tokens.length) return "";
  if (tokens.length === 1) return tokens[0];
  const lower = originalAddress.toLowerCase();
  const positions: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const idx = lower.indexOf(token.toLowerCase(), cursor);
    if (idx === -1) return tokens.join(" ");
    const end = idx + token.length;
    positions.push({ start: idx, end });
    cursor = end;
  }
  let out = "";
  for (let i = 0; i < positions.length; i++) {
    const { start, end } = positions[i];
    if (i === 0) {
      out += originalAddress.slice(start, end);
    } else {
      const prevEnd = positions[i - 1].end;
      out += originalAddress.slice(prevEnd, start) + originalAddress.slice(start, end);
    }
  }
  return out.trim();
}

export function buildFlatAndBuildingDisplay(
  flatNumber: string,
  buildingName: string,
  originalAddress?: string,
): string {
  const flat = flatNumber.trim();
  const building = buildingName.trim();
  if (!flat && !building) return "";
  if (!flat) return building;
  if (!building) {
    const phrase = originalAddress ? flatPhraseFromOriginal(originalAddress, flat) : "";
    return phrase || flat;
  }
  const flatPhrase = originalAddress ? flatPhraseFromOriginal(originalAddress, flat) : "";
  const tokens = [...(flatPhrase ? flatPhrase.split(/\s+/) : flat.split(/\s+/)), ...building.split(/\s+/)];
  if (originalAddress?.trim()) {
    return joinTokensPreservingCommas(originalAddress, tokens);
  }
  return [flatPhrase || flat, building].filter(Boolean).join(", ");
}

function flatAndBuildingValue(row: ParsedAddress, originalAddress?: string): string {
  if (row.flatAndBuilding?.trim()) return row.flatAndBuilding.trim();
  return buildFlatAndBuildingDisplay(row.flatNumber, row.buildingName, originalAddress);
}

export function valueForDisplayColumn(
  row: ParsedAddress,
  col: DisplayColumn,
  layout: OutputLayoutConfig,
  originalAddress?: string,
): string {
  if (col === "addressLine") {
    return resolveAddressLine(row, originalAddress);
  }
  if (layout.combinePostcode && col === "postcodeStart") {
    return [row.postcodeStart, row.postcodeEnd].filter(Boolean).join(" ");
  }
  if (layout.combineFlatWithBuilding && col === "buildingName") {
    return flatAndBuildingValue(row, originalAddress);
  }
  return row[col as ColumnKey] ?? "";
}

/** Layout mode after clicking the mode switch control. */
export function targetLayoutMode(layout: OutputLayoutConfig): LayoutMode {
  return layout.mode === "full" ? "summary" : "full";
}

/** Short label for the layout mode switch (target mode, not current). */
export function switchLayoutModeButtonLabel(layout: OutputLayoutConfig): string {
  return targetLayoutMode(layout) === "summary" ? "Compact view" : "Detailed view";
}

/** Column breakdown shown on hover for the layout mode switch. */
export function switchLayoutModeTooltip(layout: OutputLayoutConfig): string {
  const target = applyLayoutPatch(layout, { mode: targetLayoutMode(layout) });
  const names = columnsForLayout(target).map((col) => labelForDisplayColumn(col, target));
  return names.join(" · ");
}

export function previewRowsForLayout(
  layout: OutputLayoutConfig,
): { label: string; value: string }[] {
  const cols = columnsForLayout(layout);
  return cols.map((col) => ({
    label: labelForDisplayColumn(col, layout),
    value: valueForDisplayColumn(LAYOUT_EXAMPLE_ROW, col, layout, LAYOUT_EXAMPLE_ADDRESS),
  }));
}

export function layoutSummary(layout: OutputLayoutConfig): string {
  if (layout.mode === "summary") {
    const parts = ["Address line", "town"];
    parts.push(layout.combinePostcode ? "postcode" : "outward + inward");
    if (layout.combineFlatWithBuilding) parts.push("flat in building");
    return parts.join(" · ");
  }
  const parts: string[] = [];
  parts.push(layout.combineFlatWithBuilding ? "flat in building" : "flat column");
  parts.push(layout.combinePostcode ? "combined postcode" : "split postcode");
  parts.push(`${columnsForLayout(layout).length} columns`);
  return parts.join(" · ");
}
