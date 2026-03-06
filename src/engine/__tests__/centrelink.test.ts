/**
 * Centrelink Age Pension Module Tests
 *
 * Covers: income test, assets test, deeming calculation, Work Bonus,
 * homeowner/non-homeowner thresholds, single/couple rates, binding test
 * selection, energy supplement, and eligibility rules.
 *
 * Uses FY2024-25 rates from centrelink-fy2025.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDeemedIncome,
  calculateIncomeTestPension,
  calculateAssetsTestPension,
  calculateAgePension,
  indexCentrelinkRates,
  AGE_PENSION_AGE,
  FORTNIGHTS_PER_YEAR,
  ENERGY_SUPPLEMENT_SINGLE_FN,
  ENERGY_SUPPLEMENT_COUPLE_EACH_FN,
  type CentrelinkInput,
  type CentrelinkRates,
} from '../centrelink';
import {
  AGE_PENSION_RATES,
  INCOME_TEST,
  ASSETS_TEST,
  DEEMING_RATES,
  WORK_BONUS,
} from '../rates/centrelink-fy2025';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRates(): CentrelinkRates {
  return {
    pensionRates: AGE_PENSION_RATES,
    incomeTest: INCOME_TEST,
    assetsTest: ASSETS_TEST,
    deemingRates: DEEMING_RATES,
    workBonus: WORK_BONUS,
  };
}

function makeInput(overrides: Partial<CentrelinkInput> = {}): CentrelinkInput {
  return {
    ages: [70],
    isCouple: false,
    isHomeowner: true,
    employmentIncomeAnnual: 0,
    otherOrdinaryIncomeAnnual: 0,
    financialAssets: 0,
    assessableAssets: 0,
    workBonusBalance: 0,
    ...overrides,
  };
}

const rates = makeRates();

// ── Eligibility ──────────────────────────────────────────────────────────────

describe('eligibility', () => {
  it('is eligible when at least one member is 67+', () => {
    const result = calculateAgePension(makeInput({ ages: [67] }), rates);
    expect(result.isEligible).toBe(true);
  });

  it('is not eligible when all members are under 67', () => {
    const result = calculateAgePension(makeInput({ ages: [66] }), rates);
    expect(result.isEligible).toBe(false);
    expect(result.pensionFn).toBe(0);
  });

  it('couple: eligible when one member is 67+, one is under', () => {
    const result = calculateAgePension(
      makeInput({ ages: [70, 60], isCouple: true }),
      rates,
    );
    expect(result.isEligible).toBe(true);
  });
});

// ── Maximum Pension Rates ────────────────────────────────────────────────────

describe('max pension rates', () => {
  it('single gets single rate ($1,144.40/fn)', () => {
    const result = calculateAgePension(makeInput(), rates);
    expect(result.maxPensionFn).toBeCloseTo(AGE_PENSION_RATES.single.perFortnight, 2);
    expect(result.pensionFn).toBeCloseTo(1144.40, 2);
  });

  it('couple (both eligible) gets combined rate ($862.60 × 2/fn)', () => {
    const result = calculateAgePension(
      makeInput({ ages: [70, 68], isCouple: true }),
      rates,
    );
    expect(result.maxPensionFn).toBeCloseTo(862.60 * 2, 2);
    expect(result.pensionFn).toBeCloseTo(862.60 * 2, 2);
  });

  it('couple (one eligible) gets per-person rate ($862.60/fn)', () => {
    const result = calculateAgePension(
      makeInput({ ages: [70, 60], isCouple: true }),
      rates,
    );
    expect(result.maxPensionFn).toBeCloseTo(862.60, 2);
  });
});

// ── Deeming Rates ────────────────────────────────────────────────────────────

describe('deeming calculation', () => {
  it('applies 0.25% on first $62,600 for single', () => {
    const deemed = calculateDeemedIncome(50_000, false, DEEMING_RATES);
    expect(deemed).toBeCloseTo(50_000 * 0.0025, 2);
  });

  it('applies 0.25% below threshold + 2.25% above for single', () => {
    const deemed = calculateDeemedIncome(100_000, false, DEEMING_RATES);
    const expected =
      62_600 * 0.0025 + (100_000 - 62_600) * 0.0225;
    expect(deemed).toBeCloseTo(expected, 2);
  });

  it('uses couple threshold ($103,800) for couples', () => {
    const deemed = calculateDeemedIncome(103_800, true, DEEMING_RATES);
    expect(deemed).toBeCloseTo(103_800 * 0.0025, 2);

    const deemedAbove = calculateDeemedIncome(200_000, true, DEEMING_RATES);
    const expected =
      103_800 * 0.0025 + (200_000 - 103_800) * 0.0225;
    expect(deemedAbove).toBeCloseTo(expected, 2);
  });

  it('returns 0 for zero or negative financial assets', () => {
    expect(calculateDeemedIncome(0, false, DEEMING_RATES)).toBe(0);
    expect(calculateDeemedIncome(-5000, false, DEEMING_RATES)).toBe(0);
  });
});

// ── Assets Test ──────────────────────────────────────────────────────────────

describe('assets test', () => {
  it('single homeowner with $300k assets → full pension (below $314k threshold)', () => {
    const result = calculateAgePension(
      makeInput({ assessableAssets: 300_000 }),
      rates,
    );
    expect(result.assetsTestPensionFn).toBeCloseTo(AGE_PENSION_RATES.single.perFortnight, 2);
  });

  it('single homeowner with $300k → correct pension after reduction', () => {
    // $300k is below $314k threshold, so full pension
    const result = calculateAgePension(
      makeInput({ assessableAssets: 300_000 }),
      rates,
    );
    expect(result.assetsTestPensionFn).toBeCloseTo(1144.40, 2);
  });

  it('single homeowner with $400k → reduced pension', () => {
    const result = calculateAgePension(
      makeInput({ assessableAssets: 400_000 }),
      rates,
    );
    // Excess = $400k - $314k = $86k → reduction = 86 × $3 = $258/fn
    const expectedFn = 1144.40 - 258;
    expect(result.assetsTestPensionFn).toBeCloseTo(expectedFn, 2);
  });

  it('couple homeowner with $500k assets → reduced pension', () => {
    const result = calculateAgePension(
      makeInput({
        ages: [70, 68],
        isCouple: true,
        assessableAssets: 500_000,
      }),
      rates,
    );
    // Couple homeowner threshold = $470k
    // Excess = $500k - $470k = $30k → reduction = 30 × $3 = $90/fn
    const maxCoupleFn = 862.60 * 2;
    const expectedFn = maxCoupleFn - 90;
    expect(result.assetsTestPensionFn).toBeCloseTo(expectedFn, 2);
  });

  it('non-homeowner gets higher threshold than homeowner', () => {
    const homeownerPension = calculateAssetsTestPension(
      1144.40,
      400_000,
      false,
      true,
      ASSETS_TEST,
    );
    const nonHomeownerPension = calculateAssetsTestPension(
      1144.40,
      400_000,
      false,
      false,
      ASSETS_TEST,
    );
    // Non-homeowner threshold ($566,500) > homeowner ($314,000)
    // So non-homeowner gets higher pension at same asset level
    expect(nonHomeownerPension).toBeGreaterThan(homeownerPension);
  });

  it('non-homeowner single with $400k → full pension (below $566.5k threshold)', () => {
    const result = calculateAgePension(
      makeInput({ assessableAssets: 400_000, isHomeowner: false }),
      rates,
    );
    expect(result.assetsTestPensionFn).toBeCloseTo(1144.40, 2);
  });

  it('assets well above cut-off → pension reduces to zero', () => {
    const result = calculateAgePension(
      makeInput({ assessableAssets: 1_000_000 }),
      rates,
    );
    expect(result.assetsTestPensionFn).toBe(0);
  });
});

// ── Income Test ──────────────────────────────────────────────────────────────

describe('income test', () => {
  it('zero income → full pension', () => {
    const result = calculateAgePension(makeInput(), rates);
    expect(result.incomeTestPensionFn).toBeCloseTo(1144.40, 2);
  });

  it('income below free area → full pension', () => {
    // Single free area = $212/fn = $5,512/yr
    const result = calculateAgePension(
      makeInput({ financialAssets: 50_000 }),
      rates,
    );
    // Deemed income = $50k × 0.25% = $125/yr → $4.81/fn, well under $212
    expect(result.incomeTestPensionFn).toBeCloseTo(1144.40, 2);
  });

  it('income above free area → reduced pension', () => {
    // Large financial assets to create meaningful deemed income
    const result = calculateAgePension(
      makeInput({ financialAssets: 500_000 }),
      rates,
    );
    // Deemed = $62,600 × 0.0025 + ($500k - $62,600) × 0.0225
    //        = $156.50 + $9,841.50 = $9,998/yr → $384.54/fn
    // Excess over $212 free area = $172.54
    // Reduction = $172.54 × 0.50 = $86.27
    // Pension = $1,144.40 - $86.27 = $1,058.13
    expect(result.incomeTestPensionFn).toBeGreaterThan(0);
    expect(result.incomeTestPensionFn).toBeLessThan(1144.40);
  });

  it('very high income → pension reduces to zero', () => {
    const result = calculateAgePension(
      makeInput({ otherOrdinaryIncomeAnnual: 200_000 }),
      rates,
    );
    expect(result.incomeTestPensionFn).toBe(0);
  });
});

// ── Income Test vs Assets Test (Binding Test) ────────────────────────────────

describe('binding test selection', () => {
  it('uses whichever test produces the LOWER pension', () => {
    // Low income but high assets → assets test binds
    const assetsBinding = calculateAgePension(
      makeInput({ assessableAssets: 500_000 }),
      rates,
    );
    expect(assetsBinding.bindingTest).toBe('assets');
    expect(assetsBinding.pensionFn).toBe(assetsBinding.assetsTestPensionFn);
    expect(assetsBinding.pensionFn).toBeLessThanOrEqual(assetsBinding.incomeTestPensionFn);

    // High income but low assets → income test binds
    const incomeBinding = calculateAgePension(
      makeInput({
        financialAssets: 500_000,
        assessableAssets: 50_000,
        otherOrdinaryIncomeAnnual: 30_000,
      }),
      rates,
    );
    expect(incomeBinding.bindingTest).toBe('income');
    expect(incomeBinding.pensionFn).toBe(incomeBinding.incomeTestPensionFn);
    expect(incomeBinding.pensionFn).toBeLessThanOrEqual(incomeBinding.assetsTestPensionFn);
  });

  it('both tests at max → still full pension', () => {
    const result = calculateAgePension(makeInput(), rates);
    expect(result.incomeTestPensionFn).toBeCloseTo(1144.40, 2);
    expect(result.assetsTestPensionFn).toBeCloseTo(1144.40, 2);
    expect(result.pensionFn).toBeCloseTo(1144.40, 2);
  });
});

// ── Work Bonus ───────────────────────────────────────────────────────────────

describe('Work Bonus', () => {
  it('exempts first $300/fn ($7,800/yr) of employment income', () => {
    // $7,800 employment income should be fully exempt
    const result = calculateAgePension(
      makeInput({ employmentIncomeAnnual: 7_800 }),
      rates,
    );
    expect(result.workBonusAppliedAnnual).toBe(7_800);
    expect(result.incomeTestPensionFn).toBeCloseTo(1144.40, 2);
  });

  it('employment income above Work Bonus is assessable', () => {
    const result = calculateAgePension(
      makeInput({ employmentIncomeAnnual: 20_000 }),
      rates,
    );
    expect(result.workBonusAppliedAnnual).toBe(7_800);
    // Remaining $12,200/yr assessable → $469.23/fn
    // Excess over $212 free area = $257.23
    // Reduction = $257.23 × 0.50 = $128.62
    expect(result.incomeTestPensionFn).toBeLessThan(1144.40);
    expect(result.incomeTestPensionFn).toBeGreaterThan(0);
  });

  it('accumulated Work Bonus balance adds to exemption', () => {
    const withBalance = calculateAgePension(
      makeInput({ employmentIncomeAnnual: 15_000, workBonusBalance: 5_000 }),
      rates,
    );
    const withoutBalance = calculateAgePension(
      makeInput({ employmentIncomeAnnual: 15_000, workBonusBalance: 0 }),
      rates,
    );
    // More Work Bonus → more exemption → higher pension
    expect(withBalance.workBonusAppliedAnnual).toBeGreaterThan(
      withoutBalance.workBonusAppliedAnnual,
    );
    expect(withBalance.incomeTestPensionFn).toBeGreaterThanOrEqual(
      withoutBalance.incomeTestPensionFn,
    );
  });
});

// ── Energy Supplement ────────────────────────────────────────────────────────

describe('energy supplement', () => {
  it('single receives $14.10/fn when pension > 0', () => {
    const result = calculateAgePension(makeInput(), rates);
    expect(result.energySupplementFn).toBeCloseTo(ENERGY_SUPPLEMENT_SINGLE_FN, 2);
  });

  it('couple receives $10.60 each ($21.20 combined)/fn when pension > 0', () => {
    const result = calculateAgePension(
      makeInput({ ages: [70, 68], isCouple: true }),
      rates,
    );
    expect(result.energySupplementFn).toBeCloseTo(ENERGY_SUPPLEMENT_COUPLE_EACH_FN * 2, 2);
  });

  it('no energy supplement when pension is zero', () => {
    const result = calculateAgePension(
      makeInput({ assessableAssets: 1_000_000 }),
      rates,
    );
    expect(result.pensionFn).toBe(0);
    expect(result.energySupplementFn).toBe(0);
  });
});

// ── Annual Equivalents ───────────────────────────────────────────────────────

describe('annual equivalents', () => {
  it('annual pension = fortnightly × 26', () => {
    const result = calculateAgePension(makeInput(), rates);
    expect(result.pensionAnnual).toBeCloseTo(result.pensionFn * FORTNIGHTS_PER_YEAR, 2);
    expect(result.totalPaymentAnnual).toBeCloseTo(
      result.totalPaymentFn * FORTNIGHTS_PER_YEAR, 2,
    );
  });
});

// ── Scenario: Single Homeowner with $300k ────────────────────────────────────

describe('scenario: single homeowner, $300k assessable assets', () => {
  it('receives full pension (assets below threshold, no income)', () => {
    const result = calculateAgePension(
      makeInput({
        ages: [70],
        isCouple: false,
        isHomeowner: true,
        assessableAssets: 300_000,
        financialAssets: 100_000,
      }),
      rates,
    );

    expect(result.isEligible).toBe(true);

    // Assets test: $300k < $314k threshold → full pension
    expect(result.assetsTestPensionFn).toBeCloseTo(1144.40, 2);

    // Income test: deemed income on $100k financial assets
    const expectedDeemed = 62_600 * 0.0025 + (100_000 - 62_600) * 0.0225;
    expect(result.deemedIncomeAnnual).toBeCloseTo(expectedDeemed, 2);

    // Both tests yield pension, binding is whichever is lower
    expect(result.pensionFn).toBeGreaterThan(0);
    expect(result.totalPaymentFn).toBeGreaterThan(result.pensionFn);
  });
});

// ── Scenario: Couple Homeowner with $500k ────────────────────────────────────

describe('scenario: couple homeowner, $500k combined assets', () => {
  it('receives reduced pension (assets above $470k couple threshold)', () => {
    const result = calculateAgePension(
      makeInput({
        ages: [70, 68],
        isCouple: true,
        isHomeowner: true,
        assessableAssets: 500_000,
        financialAssets: 200_000,
      }),
      rates,
    );

    expect(result.isEligible).toBe(true);

    // Assets test: excess = $500k - $470k = $30k → reduction = 30 × $3 = $90/fn
    const maxCoupleFn = 862.60 * 2;
    expect(result.assetsTestPensionFn).toBeCloseTo(maxCoupleFn - 90, 2);

    // Income test: deemed on $200k with couple threshold
    const expectedDeemed = 103_800 * 0.0025 + (200_000 - 103_800) * 0.0225;
    expect(result.deemedIncomeAnnual).toBeCloseTo(expectedDeemed, 2);

    expect(result.pensionFn).toBeGreaterThan(0);
    expect(result.bindingTest).toBeDefined();
  });
});

// ── Indexation ────────────────────────────────────────────────────────────────

describe('indexCentrelinkRates', () => {
  it('indexes thresholds by CPI factor over multiple years', () => {
    const indexed = indexCentrelinkRates(rates, 0.025, 5);
    const factor = Math.pow(1.025, 5);

    expect(indexed.assetsTest.homeowner.single).toBe(
      Math.round(ASSETS_TEST.homeowner.single * factor),
    );
    expect(indexed.incomeTest.freeArea.single).toBe(
      Math.round(INCOME_TEST.freeArea.single * factor),
    );
    expect(indexed.deemingRates.threshold.single).toBe(
      Math.round(DEEMING_RATES.threshold.single * factor),
    );
  });

  it('preserves taper rates (not indexed)', () => {
    const indexed = indexCentrelinkRates(rates, 0.03, 10);
    expect(indexed.incomeTest.taperRate).toBe(INCOME_TEST.taperRate);
    expect(indexed.assetsTest.taperRate).toBe(ASSETS_TEST.taperRate);
    expect(indexed.deemingRates.lowerRate).toBe(DEEMING_RATES.lowerRate);
    expect(indexed.deemingRates.upperRate).toBe(DEEMING_RATES.upperRate);
  });

  it('zero years returns rates unchanged', () => {
    const indexed = indexCentrelinkRates(rates, 0.025, 0);
    expect(indexed.assetsTest.homeowner.single).toBe(ASSETS_TEST.homeowner.single);
    expect(indexed.pensionRates.single.perFortnight).toBeCloseTo(
      AGE_PENSION_RATES.single.perFortnight, 2,
    );
  });
});
