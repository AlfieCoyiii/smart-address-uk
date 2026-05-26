const STORAGE_KEY = "smartaddressuk-require-valid-postcode";

export function loadRequireValidPostcode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveRequireValidPostcode(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore private mode / blocked storage
  }
}
