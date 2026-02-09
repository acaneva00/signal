/**
 * ASFA Retirement Standard
 * 
 * The ASFA Retirement Standard benchmarks the annual budget needed by Australians
 * to fund a comfortable or modest standard of living in retirement.
 * 
 * Source: https://www.superannuation.asn.au/resources/retirement-standard/
 * 
 * Rates effective: March 2024 quarter
 * Updated: Quarterly
 */

export interface RetirementStandardBudget {
  modest: {
    single: number; // annual amount
    couple: number; // annual amount (combined)
  };
  comfortable: {
    single: number; // annual amount
    couple: number; // annual amount (combined)
  };
}

export interface RetirementStandardLumpSums {
  comfortable: {
    single: number; // lump sum at age 67
    couple: number; // lump sum at age 67 (combined)
  };
}

// ASFA Retirement Standard budgets (March 2024 quarter)
// These are annual amounts required to fund retirement lifestyle
export const RETIREMENT_STANDARD: RetirementStandardBudget = {
  modest: {
    single: 32417,    // $32,417 per year
    couple: 46620,    // $46,620 per year (combined)
  },
  comfortable: {
    single: 52085,    // $52,085 per year
    couple: 73337,    // $73,337 per year (combined)
  },
};

// ASFA lump sum estimates at retirement (age 67)
// These assume part Age Pension for modest, no Age Pension for comfortable
export const LUMP_SUM_AT_RETIREMENT: RetirementStandardLumpSums = {
  comfortable: {
    single: 595000,   // $595,000 at age 67
    couple: 690000,   // $690,000 at age 67 (combined)
  },
};

/**
 * What's included in each standard:
 * 
 * MODEST STANDARD:
 * - Covers basic activities with occasional leisure activities
 * - Holiday travel in Australia
 * - Older car
 * - Some recreational activities
 * - Health insurance
 * - Assumes home ownership with no mortgage
 * 
 * COMFORTABLE STANDARD:
 * - Broader range of leisure activities
 * - Regular dining out
 * - Domestic and occasional international travel
 * - Private health insurance
 * - Reasonable car
 * - Good clothes
 * - Range of electronic equipment
 * - Home improvements
 * - Assumes home ownership with no mortgage
 */

// Helper function to get annual budget requirement
export function getAnnualBudget(
  standard: 'modest' | 'comfortable',
  isCouple: boolean
): number {
  if (standard === 'modest') {
    return isCouple ? RETIREMENT_STANDARD.modest.couple : RETIREMENT_STANDARD.modest.single;
  } else {
    return isCouple ? RETIREMENT_STANDARD.comfortable.couple : RETIREMENT_STANDARD.comfortable.single;
  }
}

// Helper function to get lump sum target at retirement
export function getLumpSumTarget(isCouple: boolean): number {
  return isCouple
    ? LUMP_SUM_AT_RETIREMENT.comfortable.couple
    : LUMP_SUM_AT_RETIREMENT.comfortable.single;
}

// Helper function to calculate monthly budget
export function getMonthlyBudget(
  standard: 'modest' | 'comfortable',
  isCouple: boolean
): number {
  const annual = getAnnualBudget(standard, isCouple);
  return annual / 12;
}

// Helper function to calculate fortnightly budget
export function getFortnightlyBudget(
  standard: 'modest' | 'comfortable',
  isCouple: boolean
): number {
  const annual = getAnnualBudget(standard, isCouple);
  return annual / 26; // 26 fortnights per year
}
