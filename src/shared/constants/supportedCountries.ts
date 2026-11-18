/**
 * Countries where an account can be opened.
 *
 * Accounts are region-locked to North America and Europe, where a business
 * address can be verified against postal data. This list mirrors
 * SUPPORTED_COUNTRIES in the backend's utils/address_verification.py and is
 * used as a fallback when GET /auth/supported-countries is unreachable — the
 * backend remains the authority and re-checks every submission.
 */

export type SupportedCountry = {
  code: string;
  name: string;
  region: string;
};

export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: "AT", name: "Austria", region: "Europe" },
  { code: "BE", name: "Belgium", region: "Europe" },
  { code: "BG", name: "Bulgaria", region: "Europe" },
  { code: "CA", name: "Canada", region: "North America" },
  { code: "HR", name: "Croatia", region: "Europe" },
  { code: "CY", name: "Cyprus", region: "Europe" },
  { code: "CZ", name: "Czechia", region: "Europe" },
  { code: "DK", name: "Denmark", region: "Europe" },
  { code: "EE", name: "Estonia", region: "Europe" },
  { code: "FI", name: "Finland", region: "Europe" },
  { code: "FR", name: "France", region: "Europe" },
  { code: "DE", name: "Germany", region: "Europe" },
  { code: "GR", name: "Greece", region: "Europe" },
  { code: "HU", name: "Hungary", region: "Europe" },
  { code: "IS", name: "Iceland", region: "Europe" },
  { code: "IE", name: "Ireland", region: "Europe" },
  { code: "IT", name: "Italy", region: "Europe" },
  { code: "LV", name: "Latvia", region: "Europe" },
  { code: "LT", name: "Lithuania", region: "Europe" },
  { code: "LU", name: "Luxembourg", region: "Europe" },
  { code: "MT", name: "Malta", region: "Europe" },
  { code: "MX", name: "Mexico", region: "North America" },
  { code: "NL", name: "Netherlands", region: "Europe" },
  { code: "NO", name: "Norway", region: "Europe" },
  { code: "PL", name: "Poland", region: "Europe" },
  { code: "PT", name: "Portugal", region: "Europe" },
  { code: "PR", name: "Puerto Rico", region: "North America" },
  { code: "RO", name: "Romania", region: "Europe" },
  { code: "SK", name: "Slovakia", region: "Europe" },
  { code: "SI", name: "Slovenia", region: "Europe" },
  { code: "ES", name: "Spain", region: "Europe" },
  { code: "SE", name: "Sweden", region: "Europe" },
  { code: "CH", name: "Switzerland", region: "Europe" },
  { code: "GB", name: "United Kingdom", region: "Europe" },
  { code: "US", name: "United States", region: "North America" }
];

/** Label for the state/province field, which differs by country. */
export function regionFieldLabel(countryCode: string): string {
  switch (countryCode) {
    case "US":
    case "PR":
      return "State";
    case "CA":
      return "Province";
    case "MX":
      return "State";
    case "IE":
      return "County";
    default:
      return "Region / Province";
  }
}

/** Whether the state/province field is required for a given country. */
export function isRegionFieldRequired(countryCode: string): boolean {
  return ["US", "PR", "CA", "MX"].includes(countryCode);
}

export function countryName(code: string): string {
  return SUPPORTED_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}
