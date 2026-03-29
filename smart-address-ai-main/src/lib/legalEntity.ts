/** Companies House + ICO particulars — update `lastUpdated` when you change legal text. */
export type LegalEntity = {
  companyName: string;
  companyNumber: string;
  registeredOffice: string;
  tradingName: string;
  contactEmail: string;
  lastUpdated: string;
  /**
   * ICO data protection fee — your registration reference (e.g. ZA1234567).
   * From your payment confirmation or search: https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/
   * Paste here; the Privacy Policy shows a line only when this is non-empty.
   */
  icoRegistrationNumber: string;
};

export const LEGAL_ENTITY: LegalEntity = {
  companyName: "SMARTADDRESS LTD",
  companyNumber: "17057357",
  registeredOffice: "33 Barretts Grove, London, England, N16 8AP",
  tradingName: "Smart Address UK",
  contactEmail: "help@smartaddress.uk",
  lastUpdated: "29 March 2026",
  icoRegistrationNumber: "",
};
