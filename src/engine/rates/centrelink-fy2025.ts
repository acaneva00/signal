/**
 * Centrelink Rates for FY2024-25
 * 
 * Sources:
 * - Age Pension rates: https://www.servicesaustralia.gov.au/how-much-age-pension-you-can-get
 * - Income test: https://www.servicesaustralia.gov.au/income-test-for-age-pension
 * - Assets test: https://www.servicesaustralia.gov.au/assets-test-for-age-pension
 * - Deeming rates: https://www.servicesaustralia.gov.au/deeming-rates
 * - Work Bonus: https://www.servicesaustralia.gov.au/work-bonus
 * 
 * Rates effective from 20 September 2024
 */

export interface PensionRates {
  single: {
    perFortnight: number;
    perYear: number;
  };
  couple: {
    perFortnight: number; // per person
    perYear: number; // per person
  };
}

export interface IncomeTest {
  freeArea: {
    single: number; // per fortnight
    couple: number; // combined per fortnight
  };
  taperRate: number; // as decimal (e.g., 0.50 for 50c per dollar)
}

export interface AssetsTest {
  homeowner: {
    single: number;
    couple: number;
  };
  nonHomeowner: {
    single: number;
    couple: number;
  };
  taperRate: number; // dollars per fortnight per $1,000 over threshold
}

export interface DeemedIncomeRates {
  lowerRate: number; // as decimal
  upperRate: number; // as decimal
  threshold: {
    single: number;
    couple: number; // combined
  };
}

export interface WorkBonus {
  perFortnight: number;
  annualAccrual: number;
  maxBalance: number;
}

// Age Pension maximum rates (September 2024)
export const AGE_PENSION_RATES: PensionRates = {
  single: {
    perFortnight: 1144.40,
    perYear: 29714.40, // 26 fortnights
  },
  couple: {
    perFortnight: 862.60, // each
    perYear: 22427.60, // each
  },
};

// Income test for Age Pension
export const INCOME_TEST: IncomeTest = {
  freeArea: {
    single: 212, // per fortnight
    couple: 372, // combined per fortnight
  },
  taperRate: 0.50, // 50c reduction per dollar over free area
};

// Assets test for Age Pension (September 2024)
export const ASSETS_TEST: AssetsTest = {
  homeowner: {
    single: 314000,
    couple: 470000,
  },
  nonHomeowner: {
    single: 566500,
    couple: 722500,
  },
  taperRate: 3.00, // $3 per fortnight per $1,000 over threshold
};

// Deeming rates (November 2024)
export const DEEMING_RATES: DeemedIncomeRates = {
  lowerRate: 0.0025, // 0.25%
  upperRate: 0.0225, // 2.25%
  threshold: {
    single: 62600,
    couple: 103800, // combined
  },
};

// Work Bonus (from 1 December 2022)
export const WORK_BONUS: WorkBonus = {
  perFortnight: 300,
  annualAccrual: 7800, // 26 fortnights
  maxBalance: 11800,
};

// Helper function to calculate deemed income
export function calculateDeemedIncome(
  financialAssets: number,
  isCouple: boolean
): number {
  const threshold = isCouple
    ? DEEMING_RATES.threshold.couple
    : DEEMING_RATES.threshold.single;

  if (financialAssets <= threshold) {
    return financialAssets * DEEMING_RATES.lowerRate;
  } else {
    const lowerPortion = threshold * DEEMING_RATES.lowerRate;
    const upperPortion = (financialAssets - threshold) * DEEMING_RATES.upperRate;
    return lowerPortion + upperPortion;
  }
}

// Helper function to calculate pension under income test
export function calculatePensionIncomeTest(
  income: number,
  isCouple: boolean
): number {
  const maxRate = isCouple
    ? AGE_PENSION_RATES.couple.perFortnight
    : AGE_PENSION_RATES.single.perFortnight;

  const freeArea = isCouple
    ? INCOME_TEST.freeArea.couple
    : INCOME_TEST.freeArea.single;

  if (income <= freeArea) {
    return maxRate;
  }

  const reduction = (income - freeArea) * INCOME_TEST.taperRate;
  return Math.max(0, maxRate - reduction);
}

// Helper function to calculate pension under assets test
export function calculatePensionAssetsTest(
  assets: number,
  isCouple: boolean,
  isHomeowner: boolean
): number {
  const maxRate = isCouple
    ? AGE_PENSION_RATES.couple.perFortnight
    : AGE_PENSION_RATES.single.perFortnight;

  let threshold: number;
  if (isHomeowner) {
    threshold = isCouple
      ? ASSETS_TEST.homeowner.couple
      : ASSETS_TEST.homeowner.single;
  } else {
    threshold = isCouple
      ? ASSETS_TEST.nonHomeowner.couple
      : ASSETS_TEST.nonHomeowner.single;
  }

  if (assets <= threshold) {
    return maxRate;
  }

  const excessAssets = assets - threshold;
  const reduction = (excessAssets / 1000) * ASSETS_TEST.taperRate;
  return Math.max(0, maxRate - reduction);
}

// Helper function to calculate final pension (lower of income and assets test)
export function calculateAgePension(
  income: number,
  assets: number,
  isCouple: boolean,
  isHomeowner: boolean
): number {
  const incomeTestPension = calculatePensionIncomeTest(income, isCouple);
  const assetsTestPension = calculatePensionAssetsTest(assets, isCouple, isHomeowner);
  return Math.min(incomeTestPension, assetsTestPension);
}
