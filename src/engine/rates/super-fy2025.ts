/**
 * Superannuation Rates and Thresholds for FY2024-25
 * 
 * Sources:
 * - SG rate: https://www.ato.gov.au/rates/key-superannuation-rates-and-thresholds/
 * - Contribution caps: https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-much-can-i-contribute/contribution-caps
 * - Bring-forward: https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-much-can-i-contribute/non-concessional-contributions-and-bring-forward-arrangements
 * - Preservation ages: https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/when-you-can-access-your-super
 * - Minimum drawdown: https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/income-streams/super-income-stream-payment-standards
 */

export interface SuperGuaranteeRate {
  financialYear: string;
  rate: number; // as decimal (e.g., 0.115 for 11.5%)
}

export interface ContributionCaps {
  concessional: number;
  nonConcessional: number;
  bringForwardMax: number;
  bringForwardTSBThreshold: number;
}

export interface PreservationAge {
  birthYearStart: number;
  birthYearEnd: number | null;
  age: number;
}

export interface MinimumDrawdownRate {
  ageStart: number;
  ageEnd: number | null;
  rate: number; // as decimal (e.g., 0.04 for 4%)
}

// Superannuation Guarantee rates
export const SG_RATES: SuperGuaranteeRate[] = [
  { financialYear: "2024-25", rate: 0.115 }, // 11.5%
  { financialYear: "2025-26", rate: 0.12 },  // 12%
];

// Contribution caps for FY2024-25
export const CONTRIBUTION_CAPS: ContributionCaps = {
  concessional: 30000,
  nonConcessional: 120000,
  bringForwardMax: 360000, // 3 years of NCC
  bringForwardTSBThreshold: 1900000,
};

// Preservation ages by birth year
export const PRESERVATION_AGES: PreservationAge[] = [
  { birthYearStart: 0, birthYearEnd: 1959, age: 55 },
  { birthYearStart: 1960, birthYearEnd: 1960, age: 56 },
  { birthYearStart: 1961, birthYearEnd: 1961, age: 57 },
  { birthYearStart: 1962, birthYearEnd: 1962, age: 58 },
  { birthYearStart: 1963, birthYearEnd: 1963, age: 59 },
  { birthYearStart: 1964, birthYearEnd: null, age: 60 },
];

// Minimum pension drawdown rates by age
export const MINIMUM_DRAWDOWN_RATES: MinimumDrawdownRate[] = [
  { ageStart: 0, ageEnd: 64, rate: 0.04 },    // 4%
  { ageStart: 65, ageEnd: 74, rate: 0.05 },   // 5%
  { ageStart: 75, ageEnd: 79, rate: 0.06 },   // 6%
  { ageStart: 80, ageEnd: 84, rate: 0.07 },   // 7%
  { ageStart: 85, ageEnd: 89, rate: 0.09 },   // 9%
  { ageStart: 90, ageEnd: 94, rate: 0.11 },   // 11%
  { ageStart: 95, ageEnd: null, rate: 0.14 }, // 14%
];

// Helper function to get SG rate for a financial year
export function getSGRate(financialYear: string): number {
  const rate = SG_RATES.find((r) => r.financialYear === financialYear);
  if (!rate) {
    throw new Error(`SG rate not found for financial year: ${financialYear}`);
  }
  return rate.rate;
}

// Helper function to get preservation age by birth year
export function getPreservationAge(birthYear: number): number {
  const entry = PRESERVATION_AGES.find(
    (p) => birthYear >= p.birthYearStart && (p.birthYearEnd === null || birthYear <= p.birthYearEnd)
  );
  if (!entry) {
    throw new Error(`Preservation age not found for birth year: ${birthYear}`);
  }
  return entry.age;
}

// Helper function to get minimum drawdown rate by age
export function getMinimumDrawdownRate(age: number): number {
  const entry = MINIMUM_DRAWDOWN_RATES.find(
    (d) => age >= d.ageStart && (d.ageEnd === null || age <= d.ageEnd)
  );
  if (!entry) {
    throw new Error(`Minimum drawdown rate not found for age: ${age}`);
  }
  return entry.rate;
}
