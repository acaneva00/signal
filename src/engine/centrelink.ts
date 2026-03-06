/**
 * Centrelink Age Pension Module
 *
 * Calculates fortnightly Age Pension entitlement at a household level.
 * Centrelink reassesses twice yearly (March and September); the engine
 * calls this at each reassessment point and applies the resulting
 * fortnightly payment for the subsequent 6-month period.
 *
 * Implements:
 * - Income Test (fortnightly free area, 50c taper)
 * - Assets Test (homeowner / non-homeowner thresholds, $3/fn per $1k taper)
 * - Deeming rates on financial assets (0.25% lower, 2.25% upper)
 * - Work Bonus ($300/fn employment income exemption, balance accrual)
 * - Energy Supplement
 * - Binding test: the LOWER pension from income and assets tests applies
 *
 * All rate constants come from centrelink-fy2025.ts via the resolver.
 * Functions are pure — no side effects.
 */

import type {
  PensionRates,
  IncomeTest,
  AssetsTest,
  DeemedIncomeRates,
  WorkBonus,
} from './rates/centrelink-fy2025';

// ── Constants ────────────────────────────────────────────────────────────────

export const AGE_PENSION_AGE = 67;
export const FORTNIGHTS_PER_YEAR = 26;

/** Energy supplement (fortnightly, September 2024) */
export const ENERGY_SUPPLEMENT_SINGLE_FN = 14.10;
export const ENERGY_SUPPLEMENT_COUPLE_EACH_FN = 10.60;

// ── Types ────────────────────────────────────────────────────────────────────

export type BindingTest = 'income' | 'assets' | 'none';

export interface CentrelinkRates {
  pensionRates: PensionRates;
  incomeTest: IncomeTest;
  assetsTest: AssetsTest;
  deemingRates: DeemedIncomeRates;
  workBonus: WorkBonus;
}

export interface CentrelinkInput {
  /** Ages of household members (1 or 2 entries) */
  ages: number[];
  isCouple: boolean;
  isHomeowner: boolean;

  /** Annual employment income (household total) */
  employmentIncomeAnnual: number;
  /** Annual other ordinary income (foreign pensions, business, etc.) */
  otherOrdinaryIncomeAnnual: number;
  /** Total financial assets subject to deeming (bank, shares, super in pension phase) */
  financialAssets: number;
  /** Total assessable assets for the assets test */
  assessableAssets: number;

  /** Accumulated Work Bonus balance from prior periods */
  workBonusBalance: number;
}

export interface CentrelinkResult {
  isEligible: boolean;

  /** Fortnightly pension from income test (before choosing binding test) */
  incomeTestPensionFn: number;
  /** Fortnightly pension from assets test (before choosing binding test) */
  assetsTestPensionFn: number;
  /** Fortnightly pension payable (lesser of the two tests) */
  pensionFn: number;
  /** Fortnightly energy supplement */
  energySupplementFn: number;
  /** Total fortnightly payment (pension + energy supplement) */
  totalPaymentFn: number;

  /** Annual equivalents (fortnightly × 26) */
  pensionAnnual: number;
  totalPaymentAnnual: number;

  /** Which test produced the lower (binding) result */
  bindingTest: BindingTest;

  /** Detail breakdown */
  deemedIncomeAnnual: number;
  assessableIncomeAnnual: number;
  assessableAssets: number;
  workBonusAppliedAnnual: number;

  /** Max fortnightly rate that applied (single or couple combined) */
  maxPensionFn: number;
}

// ── Deeming ──────────────────────────────────────────────────────────────────

/**
 * Calculate annual deemed income from financial assets.
 *
 * Financial assets (bank accounts, shares, managed funds, super in pension
 * phase post-2015) are deemed to earn income at legislated rates regardless
 * of actual returns.
 */
export function calculateDeemedIncome(
  financialAssets: number,
  isCouple: boolean,
  rates: DeemedIncomeRates,
): number {
  if (financialAssets <= 0) return 0;

  const threshold = isCouple ? rates.threshold.couple : rates.threshold.single;

  if (financialAssets <= threshold) {
    return financialAssets * rates.lowerRate;
  }

  return (
    threshold * rates.lowerRate +
    (financialAssets - threshold) * rates.upperRate
  );
}

// ── Income Test ──────────────────────────────────────────────────────────────

/**
 * Calculate fortnightly pension under the income test.
 *
 * Steps:
 * 1. Apply Work Bonus to employment income
 * 2. Sum assessable income (adjusted employment + deemed + other ordinary)
 * 3. Convert to fortnightly
 * 4. Reduce max pension by 50c per $1 over the free area
 */
export function calculateIncomeTestPension(
  maxPensionFn: number,
  employmentIncomeAnnual: number,
  deemedIncomeAnnual: number,
  otherOrdinaryIncomeAnnual: number,
  workBonusBalance: number,
  incomeTest: IncomeTest,
  workBonus: WorkBonus,
  isCouple: boolean,
): { pensionFn: number; assessableIncomeAnnual: number; workBonusAppliedAnnual: number } {
  const workBonusAnnualAccrual = workBonus.perFortnight * FORTNIGHTS_PER_YEAR;
  const workBonusApplied = Math.min(
    employmentIncomeAnnual,
    workBonusAnnualAccrual + workBonusBalance,
  );
  const adjustedEmployment = Math.max(0, employmentIncomeAnnual - workBonusApplied);

  const assessableIncomeAnnual =
    adjustedEmployment + deemedIncomeAnnual + otherOrdinaryIncomeAnnual;

  const assessableIncomeFn = assessableIncomeAnnual / FORTNIGHTS_PER_YEAR;
  const freeArea = isCouple ? incomeTest.freeArea.couple : incomeTest.freeArea.single;

  const excessIncome = Math.max(0, assessableIncomeFn - freeArea);
  const reduction = excessIncome * incomeTest.taperRate;
  const pensionFn = Math.max(0, maxPensionFn - reduction);

  return { pensionFn, assessableIncomeAnnual, workBonusAppliedAnnual: workBonusApplied };
}

// ── Assets Test ──────────────────────────────────────────────────────────────

/**
 * Calculate fortnightly pension under the assets test.
 *
 * Reduction: $3 per fortnight for every $1,000 of assets above the threshold.
 */
export function calculateAssetsTestPension(
  maxPensionFn: number,
  assessableAssets: number,
  isCouple: boolean,
  isHomeowner: boolean,
  assetsTest: AssetsTest,
): number {
  const threshold = isHomeowner
    ? (isCouple ? assetsTest.homeowner.couple : assetsTest.homeowner.single)
    : (isCouple ? assetsTest.nonHomeowner.couple : assetsTest.nonHomeowner.single);

  if (assessableAssets <= threshold) return maxPensionFn;

  const excessAssets = assessableAssets - threshold;
  const reduction = (excessAssets / 1000) * assetsTest.taperRate;
  return Math.max(0, maxPensionFn - reduction);
}

// ── Main Calculation ─────────────────────────────────────────────────────────

/**
 * Calculate Age Pension entitlement for a household.
 *
 * For couples, both must be pension age for the full couple rate.
 * If only one member qualifies, they receive the couple-each rate
 * (simplified — in practice the other may receive a different allowance).
 *
 * Returns fortnightly amounts suitable for direct use by the engine,
 * plus annual equivalents for reporting.
 */
export function calculateAgePension(
  input: CentrelinkInput,
  rates: CentrelinkRates,
): CentrelinkResult {
  const result: CentrelinkResult = {
    isEligible: false,
    incomeTestPensionFn: 0,
    assetsTestPensionFn: 0,
    pensionFn: 0,
    energySupplementFn: 0,
    totalPaymentFn: 0,
    pensionAnnual: 0,
    totalPaymentAnnual: 0,
    bindingTest: 'none',
    deemedIncomeAnnual: 0,
    assessableIncomeAnnual: 0,
    assessableAssets: input.assessableAssets,
    workBonusAppliedAnnual: 0,
    maxPensionFn: 0,
  };

  const eligibleCount = input.ages.filter(a => a >= AGE_PENSION_AGE).length;
  if (eligibleCount === 0) return result;

  result.isEligible = true;

  // Determine max pension rate and energy supplement
  let maxPensionFn: number;
  let energySupplementFn: number;

  if (input.isCouple && eligibleCount === 2) {
    maxPensionFn = rates.pensionRates.couple.perFortnight * 2;
    energySupplementFn = ENERGY_SUPPLEMENT_COUPLE_EACH_FN * 2;
  } else if (input.isCouple && eligibleCount === 1) {
    maxPensionFn = rates.pensionRates.couple.perFortnight;
    energySupplementFn = ENERGY_SUPPLEMENT_COUPLE_EACH_FN;
  } else {
    maxPensionFn = rates.pensionRates.single.perFortnight;
    energySupplementFn = ENERGY_SUPPLEMENT_SINGLE_FN;
  }

  result.maxPensionFn = maxPensionFn;

  // Deeming
  const deemedIncomeAnnual = calculateDeemedIncome(
    input.financialAssets,
    input.isCouple,
    rates.deemingRates,
  );
  result.deemedIncomeAnnual = deemedIncomeAnnual;

  // Income test
  const incomeResult = calculateIncomeTestPension(
    maxPensionFn,
    input.employmentIncomeAnnual,
    deemedIncomeAnnual,
    input.otherOrdinaryIncomeAnnual,
    input.workBonusBalance,
    rates.incomeTest,
    rates.workBonus,
    input.isCouple,
  );
  result.incomeTestPensionFn = incomeResult.pensionFn;
  result.assessableIncomeAnnual = incomeResult.assessableIncomeAnnual;
  result.workBonusAppliedAnnual = incomeResult.workBonusAppliedAnnual;

  // Assets test
  result.assetsTestPensionFn = calculateAssetsTestPension(
    maxPensionFn,
    input.assessableAssets,
    input.isCouple,
    input.isHomeowner,
    rates.assetsTest,
  );

  // Binding test: whichever produces the LOWER pension
  if (result.incomeTestPensionFn <= result.assetsTestPensionFn) {
    result.pensionFn = result.incomeTestPensionFn;
    result.bindingTest = 'income';
  } else {
    result.pensionFn = result.assetsTestPensionFn;
    result.bindingTest = 'assets';
  }

  // Energy supplement only paid if pension > 0
  result.energySupplementFn = result.pensionFn > 0 ? energySupplementFn : 0;
  result.totalPaymentFn = result.pensionFn + result.energySupplementFn;

  // Annual equivalents
  result.pensionAnnual = result.pensionFn * FORTNIGHTS_PER_YEAR;
  result.totalPaymentAnnual = result.totalPaymentFn * FORTNIGHTS_PER_YEAR;

  return result;
}

// ── Threshold Indexation ─────────────────────────────────────────────────────

/**
 * Return CPI-indexed Centrelink rates for projection years.
 * In practice thresholds are indexed March/September each year.
 */
export function indexCentrelinkRates(
  baseRates: CentrelinkRates,
  inflationRate: number,
  years: number,
): CentrelinkRates {
  const factor = Math.pow(1 + inflationRate, years);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  return {
    pensionRates: {
      single: {
        perFortnight: r2(baseRates.pensionRates.single.perFortnight * factor),
        perYear: r2(baseRates.pensionRates.single.perYear * factor),
      },
      couple: {
        perFortnight: r2(baseRates.pensionRates.couple.perFortnight * factor),
        perYear: r2(baseRates.pensionRates.couple.perYear * factor),
      },
    },
    incomeTest: {
      freeArea: {
        single: Math.round(baseRates.incomeTest.freeArea.single * factor),
        couple: Math.round(baseRates.incomeTest.freeArea.couple * factor),
      },
      taperRate: baseRates.incomeTest.taperRate,
    },
    assetsTest: {
      homeowner: {
        single: Math.round(baseRates.assetsTest.homeowner.single * factor),
        couple: Math.round(baseRates.assetsTest.homeowner.couple * factor),
      },
      nonHomeowner: {
        single: Math.round(baseRates.assetsTest.nonHomeowner.single * factor),
        couple: Math.round(baseRates.assetsTest.nonHomeowner.couple * factor),
      },
      taperRate: baseRates.assetsTest.taperRate,
    },
    deemingRates: {
      lowerRate: baseRates.deemingRates.lowerRate,
      upperRate: baseRates.deemingRates.upperRate,
      threshold: {
        single: Math.round(baseRates.deemingRates.threshold.single * factor),
        couple: Math.round(baseRates.deemingRates.threshold.couple * factor),
      },
    },
    workBonus: {
      perFortnight: Math.round(baseRates.workBonus.perFortnight * factor),
      annualAccrual: Math.round(baseRates.workBonus.annualAccrual * factor),
      maxBalance: Math.round(baseRates.workBonus.maxBalance * factor),
    },
  };
}
