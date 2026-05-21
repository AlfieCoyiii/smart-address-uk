export interface ParsedAddress {
  flatNumber: string;
  buildingName: string;
  /** Flat and building merged with source punctuation (from API when available). */
  flatAndBuilding?: string;
  streetNumber: string;
  streetName: string;
  town: string;
  postcodeStart: string;
  postcodeEnd: string;
  /** Flat + building + street with source punctuation (from API when available). */
  addressLine?: string;
}

export const SAMPLE_ADDRESSES = [
  "Flat 3, Ashton House, 14 Baker Street, London, W1U 3BU",
  "27 High Street, Manchester, M4 1HQ",
  "Suite 12 Regency Court 45 King's Road Brighton BN1 2FA",
  "8B Victoria Mansions, 22 Queens Avenue, Bristol, BS8 1SD",
  "Flat 17, 3 Cathedral Close, Exeter, EX1 1EZ",
  "The Old Rectory, Church Lane, Bath, BA1 5PQ",
  "Unit 4, Riverside Business Park, 100 Mill Road, Cambridge, CB1 3NF",
  "15a Cromwell Terrace, Edinburgh, EH3 8BJ",
  "Apartment 9 Harbour View 7 Dock Street Liverpool L1 4DB",
  "23 Kensington Gardens, London, W8 4PX",
  "Flat 1, 56 Park Avenue, Leeds, LS1 2SJ",
  "The Willows, 8 Meadow Lane, Oxford, OX1 4AU",
  "32 Station Road, Birmingham, B2 4QA",
  "Flat 6, Elm Court, 19 Riverside Drive, Nottingham, NG1 5FT",
  "74 George Street, Glasgow, G1 1RD",
];

const postcodeRegex = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/i;

export function parseAddress(raw: string): ParsedAddress {
  const result: ParsedAddress = {
    flatNumber: "",
    buildingName: "",
    streetNumber: "",
    streetName: "",
    town: "",
    postcodeStart: "",
    postcodeEnd: "",
  };

  let line = raw.trim();
  if (!line) return result;

  // Extract postcode
  const pcMatch = line.match(postcodeRegex);
  if (pcMatch) {
    result.postcodeStart = pcMatch[1].toUpperCase();
    result.postcodeEnd = pcMatch[2].toUpperCase();
    line = line.replace(pcMatch[0], "").trim().replace(/,\s*$/, "");
  }

  // Split remaining into parts
  const parts = line.split(/,\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);

  // Extract flat/apartment number
  const flatIdx = parts.findIndex(p => /^(flat|apt|apartment|suite|unit)\s/i.test(p));
  if (flatIdx !== -1) {
    result.flatNumber = parts[flatIdx].replace(/^(flat|apt|apartment|suite|unit)\s*/i, "").trim();
    parts.splice(flatIdx, 1);
  }

  // Last part is town
  if (parts.length > 0) {
    result.town = parts[parts.length - 1];
    parts.pop();
  }

  // Find street (part with a number)
  const streetIdx = parts.findIndex(p => /^\d/.test(p));
  if (streetIdx !== -1) {
    const streetPart = parts[streetIdx];
    const numMatch = streetPart.match(/^(\d+[a-zA-Z]?)\s+(.*)/);
    if (numMatch) {
      result.streetNumber = numMatch[1];
      result.streetName = numMatch[2];
    } else {
      result.streetName = streetPart;
    }
    parts.splice(streetIdx, 1);
  }

  // Remaining parts are building name
  if (parts.length > 0) {
    result.buildingName = parts.join(", ");
  }

  let flatPart = "";
  if (result.flatNumber) {
    const flatPhrase = raw.match(
      new RegExp(
        `\\b(Flat|Flt|Apartment|Apt|Suite|Unit)\\.?\\s+${result.flatNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ),
    )?.[0];
    flatPart = flatPhrase ?? `Flat ${result.flatNumber}`;
  }

  if (flatPart || result.buildingName) {
    result.flatAndBuilding = [flatPart, result.buildingName].filter(Boolean).join(", ");
  }

  const street =
    result.streetNumber && result.streetName
      ? `${result.streetNumber} ${result.streetName}`
      : result.streetName || result.streetNumber;
  const addressParts = [flatPart, result.buildingName, street].filter(Boolean);
  if (addressParts.length) {
    result.addressLine = addressParts.join(", ");
  }

  return result;
}

export type ColumnKey = keyof ParsedAddress;

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  flatNumber: "Flat Number",
  buildingName: "Building Name",
  streetNumber: "Street Number",
  streetName: "Street Name",
  town: "Town",
  postcodeStart: "Postcode Start",
  postcodeEnd: "Postcode End",
};
