/**
 * Superannuation Module Tests
 *
 * Covers SG calculation, cap enforcement, earnings tax, minimum drawdown,
 * catch-up concessional, bring-forward NCC, spouse offset, downsizer,
 * and FY-end state updates.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMonthlySG,
  calculateSuperMonth,
  getAvailableCatchUp,
  getAvailableBringForward,
  calculateSpouseTaxOffset,
  isDownsizerEligible,
  isSuperAccessible,
  getFinancialYear,
  monthlyReturnRate,
  updateCatchUpStateAtFYEnd,
  CONTRIBUTIONS_TAX_RATE,
  CATCH_UP_BALANCE_THRESHOLD,
  DOWNSIZER_MAX_PER_PERSON,
  SPOUSE_TAX_OFFSET_MAX,
  type FYContributionState,
  type CatchUpState,
  type BringForwardState,
  type SuperMonthParams,
} from '../super';
import type { SuperFund } from '../models';

function makeFund(overrides: Partial<SuperFund> = {}): SuperFund {
  return {
    person_id: 'person_1',
    balance: 200_000,
    phase: 'accumulation',
    investment_return: 0.07,
    admin_fee_flat: 500,
    admin_fee_percent: 0.005,
    insurance_premium: 0,
    employer_sg_included: true,
    voluntary_concessional: 0,
    voluntary_non_concessional: 0,
    spouse_contribution: 0,
    pension_drawdown_rate: null,
    ...overrides,
  };
}

function makeFYState(fy: number, overrides: Partial<FYContributionState> = {}): FYContributionState {
  return { financialYear: fy, concessionalUsed: 0, nonConcessionalUsed: 0, ...overrides };
}

function makeBaseParams(overrides: Partial<SuperMonthParams> = {}): SuperMonthParams {
  return {
    fund: makeFund(),
    age: 40,
    year: 2025,
    month: 7,
    monthlyEmploymentIncome: 0,
    monthlySalarySacrifice: 0,
    sgRate: 0.115,
    concessionalCap: 30_000,
    nonConcessionalCap: 120_000,
    bringForwardTSBThreshold: 1_900_000,
    isRetired: false,
    preservationAge: 60,
    fyContributions: makeFYState(2026),
    fyStartBalance: 200_000,
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

describe('getFinancialYear', () => {
  it('returns next calendar year for Jul–Dec', () => {
    expect(getFinancialYear(2025, 7)).toBe(2026);
    expect(getFinancialYear(2025, 12)).toBe(2026);
  });

  it('returns same calendar year for Jan–Jun', () => {
    expect(getFinancialYear(2026, 1)).toBe(2026);
    expect(getFinancialYear(2026, 6)).toBe(2026);
  });
});

describe('monthlyReturnRate', () => {
  it('converts 7% annual to correct monthly compound rate', () => {
    const monthly = monthlyReturnRate(0.07);
    const recomposed = Math.pow(1 + monthly, 12);
    expect(recomposed).toBeCloseTo(1.07, 6);
  });

  it('returns 0 for 0% annual return', () => {
    expect(monthlyReturnRate(0)).toBe(0);
  });
});

// ── SG Calculation ───────────────────────────────────────────────────────────

describe('calculateMonthlySG', () => {
  it('calculates SG at 11.5% of $100,000 = $958.33/month', () => {
    const monthly = calculateMonthlySG(100_000, 0.115);
    expect(monthly).toBeCloseTo(958.33, 2);
    expect(monthly * 12).toBeCloseTo(11_500, 0);
  });

  it('calculates SG at 12% of $100,000 = $1,000/month', () => {
    expect(calculateMonthlySG(100_000, 0.12)).toBeCloseTo(1_000, 2);
  });

  it('returns 0 for zero income', () => {
    expect(calculateMonthlySG(0, 0.115)).toBe(0);
  });
});

// ── Concessional Cap ─────────────────────────────────────────────────────────

describe('concessional cap enforcement', () => {
  it('enforces $30,000 annual concessional cap', () => {
    const fund = makeFund({ voluntary_concessional: 12_000 });
    const { result, updatedFYContributions } = calculateSuperMonth(makeBaseParams({
      fund,
      fyContributions: makeFYState(2026, { concessionalUsed: 29_500 }),
    }));

    expect(result.totalConcessional).toBe(500);
    expect(result.concessionalCapExcess).toBe(500);
    expect(updatedFYContributions.concessionalUsed).toBe(30_000);
  });

  it('allows contributions below the cap without excess', () => {
    const fund = makeFund({ voluntary_concessional: 6_000 });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      monthlyEmploymentIncome: 100_000 / 12,
    }));

    expect(result.totalConcessional).toBeGreaterThan(0);
    expect(result.concessionalCapExcess).toBe(0);
  });

  it('tracks cumulative concessional across months in same FY', () => {
    const fund = makeFund({ voluntary_concessional: 24_000 });
    const params = makeBaseParams({
      fund,
      monthlyEmploymentIncome: 100_000 / 12,
      sgRate: 0.115,
    });

    let fyState = makeFYState(2026);
    let totalConcessional = 0;

    for (let m = 7; m <= 12; m++) {
      const { result, updatedFYContributions } = calculateSuperMonth({
        ...params,
        month: m,
        fyContributions: fyState,
      });
      totalConcessional += result.totalConcessional;
      fyState = updatedFYContributions;
    }

    expect(fyState.concessionalUsed).toBeLessThanOrEqual(30_000);
  });
});

// ── Contributions Tax ────────────────────────────────────────────────────────

describe('contributions tax', () => {
  it('applies 15% contributions tax in accumulation', () => {
    const { result } = calculateSuperMonth(makeBaseParams({
      monthlyEmploymentIncome: 100_000 / 12,
    }));

    expect(result.employerSG).toBeCloseTo(958.33, 2);
    expect(result.contributionsTax).toBeCloseTo(958.33 * CONTRIBUTIONS_TAX_RATE, 2);
  });

  it('applies 15% on total concessional (SG + voluntary)', () => {
    const fund = makeFund({ voluntary_concessional: 6_000 });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      monthlyEmploymentIncome: 100_000 / 12,
    }));

    const expectedTotal = result.employerSG + result.voluntaryConcessional;
    expect(result.contributionsTax).toBeCloseTo(expectedTotal * 0.15, 2);
  });
});

// ── Earnings Tax ─────────────────────────────────────────────────────────────

describe('earnings tax', () => {
  it('applies 15% earnings tax in accumulation phase', () => {
    const fund = makeFund({ balance: 500_000 });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      fyStartBalance: 500_000,
    }));

    expect(result.grossEarnings).toBeGreaterThan(0);
    expect(result.earningsTax).toBeCloseTo(result.grossEarnings * 0.15, 2);
  });

  it('applies 0% earnings tax in pension phase', () => {
    const fund = makeFund({ balance: 500_000, phase: 'pension' });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 67,
      isRetired: true,
      fyStartBalance: 500_000,
    }));

    expect(result.grossEarnings).toBeGreaterThan(0);
    expect(result.earningsTax).toBe(0);
    expect(result.phase).toBe('pension');
  });

  it('applies 15% earnings tax in TTR phase', () => {
    const fund = makeFund({ balance: 500_000, phase: 'transition' });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 60,
      fyStartBalance: 500_000,
    }));

    expect(result.earningsTax).toBeCloseTo(result.grossEarnings * 0.15, 2);
  });
});

// ── Minimum Drawdown Rates ───────────────────────────────────────────────────

describe('minimum drawdown rates by age', () => {
  const drawdownCases = [
    { age: 60, expectedRate: 0.04 },
    { age: 65, expectedRate: 0.05 },
    { age: 75, expectedRate: 0.06 },
    { age: 80, expectedRate: 0.07 },
    { age: 85, expectedRate: 0.09 },
    { age: 90, expectedRate: 0.11 },
    { age: 95, expectedRate: 0.14 },
  ];

  it.each(drawdownCases)(
    'applies $expectedRate drawdown rate at age $age',
    ({ age, expectedRate }) => {
      const fund = makeFund({
        balance: 1_000_000,
        phase: 'pension',
        pension_drawdown_rate: null,
        admin_fee_flat: 0,
        admin_fee_percent: 0,
        insurance_premium: 0,
        investment_return: 0,
      });

      const { result } = calculateSuperMonth(makeBaseParams({
        fund,
        age,
        isRetired: true,
        fyStartBalance: 1_000_000,
      }));

      // With 0% return and no fees, drawdown = balance × rate / 12
      const expectedMonthly = 1_000_000 * expectedRate / 12;
      expect(result.pensionDrawdown).toBeCloseTo(expectedMonthly, 2);
    },
  );

  it('uses specified rate when higher than minimum', () => {
    const fund = makeFund({
      balance: 1_000_000,
      phase: 'pension',
      pension_drawdown_rate: 0.08,
      admin_fee_flat: 0,
      admin_fee_percent: 0,
      insurance_premium: 0,
      investment_return: 0,
    });

    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 60, // min rate = 4%, specified = 8%
      isRetired: true,
      fyStartBalance: 1_000_000,
    }));

    expect(result.pensionDrawdown).toBeCloseTo(1_000_000 * 0.08 / 12, 2);
  });

  it('overrides specified rate with minimum when specified is lower', () => {
    const fund = makeFund({
      balance: 1_000_000,
      phase: 'pension',
      pension_drawdown_rate: 0.02,
      admin_fee_flat: 0,
      admin_fee_percent: 0,
      insurance_premium: 0,
      investment_return: 0,
    });

    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 65, // min rate = 5%, specified = 2% → use 5%
      isRetired: true,
      fyStartBalance: 1_000_000,
    }));

    expect(result.pensionDrawdown).toBeCloseTo(1_000_000 * 0.05 / 12, 2);
  });
});

// ── Catch-Up Concessional ────────────────────────────────────────────────────

describe('catch-up concessional', () => {
  it('makes $30k unused from prior year available when balance < $500k', () => {
    const catchUpState: CatchUpState = { unusedCapByFY: { 2025: 30_000 } };
    const available = getAvailableCatchUp(catchUpState, 2026, 400_000);
    expect(available).toBe(30_000);
  });

  it('accumulates unused from multiple prior years', () => {
    const catchUpState: CatchUpState = {
      unusedCapByFY: { 2022: 10_000, 2023: 15_000, 2024: 5_000, 2025: 30_000 },
    };
    const available = getAvailableCatchUp(catchUpState, 2026, 400_000);
    expect(available).toBe(60_000);
  });

  it('returns 0 when balance >= $500k', () => {
    const catchUpState: CatchUpState = { unusedCapByFY: { 2025: 30_000 } };
    expect(getAvailableCatchUp(catchUpState, 2026, 500_000)).toBe(0);
    expect(getAvailableCatchUp(catchUpState, 2026, 600_000)).toBe(0);
  });

  it('only looks back 5 years', () => {
    const catchUpState: CatchUpState = {
      unusedCapByFY: { 2020: 30_000, 2021: 30_000 },
    };
    expect(getAvailableCatchUp(catchUpState, 2026, 400_000)).toBe(30_000);
  });

  it('allows higher concessional cap in monthly calculation with catch-up', () => {
    const fund = makeFund({ voluntary_concessional: 48_000 }); // $4k/month
    const catchUpState: CatchUpState = { unusedCapByFY: { 2025: 30_000 } };

    const { result, updatedFYContributions } = calculateSuperMonth(makeBaseParams({
      fund,
      fyContributions: makeFYState(2026, { concessionalUsed: 28_000 }),
      fyStartBalance: 400_000,
      catchUpState,
    }));

    // Effective cap = $30k + $30k catch-up = $60k
    // Room = $60k - $28k = $32k, monthly = $4k → no excess
    expect(result.totalConcessional).toBe(4_000);
    expect(result.concessionalCapExcess).toBe(0);
    expect(updatedFYContributions.concessionalUsed).toBe(32_000);
  });
});

// ── Bring-Forward NCC ────────────────────────────────────────────────────────

describe('bring-forward NCC', () => {
  it('makes $360k available when balance < $1.9M and no active window', () => {
    const bfState: BringForwardState = { triggeredInFY: null, totalUsedInWindow: 0 };
    const available = getAvailableBringForward(bfState, 2026, 500_000, 120_000, 1_900_000);
    expect(available).toBe(360_000);
  });

  it('returns only annual cap when balance >= $1.9M', () => {
    const bfState: BringForwardState = { triggeredInFY: null, totalUsedInWindow: 0 };
    const available = getAvailableBringForward(bfState, 2026, 1_900_000, 120_000, 1_900_000);
    expect(available).toBe(120_000);
  });

  it('tracks remaining in active window', () => {
    const bfState: BringForwardState = { triggeredInFY: 2025, totalUsedInWindow: 200_000 };
    const available = getAvailableBringForward(bfState, 2026, 500_000, 120_000, 1_900_000);
    expect(available).toBe(160_000);
  });

  it('resets after 3-year window expires', () => {
    const bfState: BringForwardState = { triggeredInFY: 2023, totalUsedInWindow: 300_000 };
    const available = getAvailableBringForward(bfState, 2026, 500_000, 120_000, 1_900_000);
    // Window expired (2026 - 2023 = 3 >= BRING_FORWARD_YEARS), treat as new
    expect(available).toBe(360_000);
  });

  it('triggers bring-forward in monthly calc when NCC exceeds annual cap', () => {
    const fund = makeFund({
      balance: 500_000,
      voluntary_non_concessional: 180_000, // $15k/month
    });

    const { result, updatedFYContributions, updatedBringForwardState } = calculateSuperMonth(
      makeBaseParams({
        fund,
        fyContributions: makeFYState(2026, { nonConcessionalUsed: 110_000 }),
        fyStartBalance: 500_000,
      }),
    );

    // Annual cap = $120k, already used $110k → room = $10k
    // Monthly NCC = $15k → exceeds room → triggers BF
    // BF room = $360k - $110k = $250k → $15k fits
    expect(result.voluntaryNonConcessional).toBeCloseTo(15_000, 2);
    expect(result.nccCapExcess).toBe(0);
    expect(updatedBringForwardState.triggeredInFY).toBe(2026);
  });
});

// ── Spouse Tax Offset ────────────────────────────────────────────────────────

describe('spouse tax offset', () => {
  it('returns max $540 offset for $3k contribution when spouse income < $37k', () => {
    const offset = calculateSpouseTaxOffset(3_000, 30_000);
    expect(offset).toBe(540);
  });

  it('reduces offset when spouse income between $37k and $40k', () => {
    const offset = calculateSpouseTaxOffset(3_000, 38_000);
    // Base reduces: $3k - ($38k - $37k) = $2k, offset = 18% × $2k = $360
    expect(offset).toBe(360);
  });

  it('returns 0 when spouse income >= $40k', () => {
    expect(calculateSpouseTaxOffset(3_000, 40_000)).toBe(0);
    expect(calculateSpouseTaxOffset(3_000, 50_000)).toBe(0);
  });

  it('caps eligible contribution at $3k', () => {
    const offset = calculateSpouseTaxOffset(10_000, 30_000);
    expect(offset).toBe(540); // 18% of $3k cap
  });
});

// ── Downsizer ────────────────────────────────────────────────────────────────

describe('downsizer contributions', () => {
  it('is eligible at age 55+ with 10+ years ownership', () => {
    expect(isDownsizerEligible(55, 10)).toBe(true);
    expect(isDownsizerEligible(65, 20)).toBe(true);
  });

  it('is not eligible below age 55', () => {
    expect(isDownsizerEligible(54, 15)).toBe(false);
  });

  it('is not eligible with < 10 years ownership', () => {
    expect(isDownsizerEligible(60, 9)).toBe(false);
  });

  it('caps at $300k per person', () => {
    const fund = makeFund({ balance: 500_000 });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 60,
      fyStartBalance: 500_000,
      downsizer: { amount: 400_000, personAge: 60, yearsOwned: 15 },
    }));

    expect(result.downsizer).toBe(DOWNSIZER_MAX_PER_PERSON);
  });

  it('adds full amount when within limit', () => {
    const fund = makeFund({ balance: 500_000 });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 60,
      fyStartBalance: 500_000,
      downsizer: { amount: 250_000, personAge: 60, yearsOwned: 15 },
    }));

    expect(result.downsizer).toBe(250_000);
  });

  it('does not count against concessional or NCC caps', () => {
    const fund = makeFund({ balance: 500_000, voluntary_concessional: 12_000 });
    const { result, updatedFYContributions } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 60,
      monthlyEmploymentIncome: 100_000 / 12,
      fyStartBalance: 500_000,
      downsizer: { amount: 200_000, personAge: 60, yearsOwned: 15 },
    }));

    expect(result.downsizer).toBe(200_000);
    // Concessional tracking unaffected by downsizer
    expect(updatedFYContributions.concessionalUsed).toBeLessThan(30_000);
  });
});

// ── Phase Transitions ────────────────────────────────────────────────────────

describe('phase transitions', () => {
  it('transitions from accumulation to pension at retirement past preservation age', () => {
    const fund = makeFund({ phase: 'accumulation' });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 62,
      isRetired: true,
      preservationAge: 60,
    }));

    expect(result.phase).toBe('pension');
  });

  it('stays in accumulation when not retired', () => {
    const fund = makeFund({ phase: 'accumulation' });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 62,
      isRetired: false,
      preservationAge: 60,
    }));

    expect(result.phase).toBe('accumulation');
  });

  it('stays in accumulation when below preservation age', () => {
    const fund = makeFund({ phase: 'accumulation' });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 55,
      isRetired: true,
      preservationAge: 60,
    }));

    expect(result.phase).toBe('accumulation');
  });

  it('no contributions in pension phase', () => {
    const fund = makeFund({
      balance: 500_000,
      phase: 'pension',
      voluntary_concessional: 10_000,
    });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 67,
      monthlyEmploymentIncome: 100_000 / 12,
      isRetired: true,
      fyStartBalance: 500_000,
    }));

    expect(result.employerSG).toBe(0);
    expect(result.totalConcessional).toBe(0);
    expect(result.contributionsTax).toBe(0);
  });
});

// ── Super Accessibility ──────────────────────────────────────────────────────

describe('isSuperAccessible', () => {
  it('accessible at age 65+ regardless of retirement status', () => {
    expect(isSuperAccessible(65, 60, false)).toBe(true);
    expect(isSuperAccessible(70, 60, true)).toBe(true);
  });

  it('accessible at preservation age when retired', () => {
    expect(isSuperAccessible(60, 60, true)).toBe(true);
  });

  it('not accessible before preservation age', () => {
    expect(isSuperAccessible(55, 60, true)).toBe(false);
    expect(isSuperAccessible(59, 60, false)).toBe(false);
  });

  it('not accessible at preservation age when not retired', () => {
    expect(isSuperAccessible(60, 60, false)).toBe(false);
  });
});

// ── FY-End Catch-Up State Updates ────────────────────────────────────────────

describe('updateCatchUpStateAtFYEnd', () => {
  it('records unused cap for the completed FY', () => {
    const state: CatchUpState = { unusedCapByFY: {} };
    const updated = updateCatchUpStateAtFYEnd(state, 2026, 30_000, 20_000);

    expect(updated.unusedCapByFY[2026]).toBe(10_000);
  });

  it('records nothing when cap fully used', () => {
    const state: CatchUpState = { unusedCapByFY: {} };
    const updated = updateCatchUpStateAtFYEnd(state, 2026, 30_000, 30_000);

    expect(updated.unusedCapByFY[2026]).toBeUndefined();
  });

  it('consumes catch-up from oldest FYs first', () => {
    const state: CatchUpState = {
      unusedCapByFY: { 2024: 10_000, 2025: 20_000 },
    };
    // Used $45k against $30k cap → consumed $15k of catch-up
    const updated = updateCatchUpStateAtFYEnd(state, 2026, 30_000, 45_000);

    // $10k from 2024 consumed fully, $5k from 2025 consumed
    expect(updated.unusedCapByFY[2024]).toBeUndefined();
    expect(updated.unusedCapByFY[2025]).toBe(15_000);
    expect(updated.unusedCapByFY[2026]).toBeUndefined(); // fully used
  });

  it('prunes entries older than 5 years', () => {
    const state: CatchUpState = {
      unusedCapByFY: { 2020: 30_000, 2021: 30_000, 2025: 10_000 },
    };
    const updated = updateCatchUpStateAtFYEnd(state, 2026, 30_000, 25_000);

    // 2020 pruned (2026 - 5 = 2021, prune <= 2021)
    expect(updated.unusedCapByFY[2020]).toBeUndefined();
    expect(updated.unusedCapByFY[2021]).toBeUndefined();
    expect(updated.unusedCapByFY[2025]).toBe(10_000);
    expect(updated.unusedCapByFY[2026]).toBe(5_000);
  });
});

// ── Monthly Earnings & Fees ──────────────────────────────────────────────────

describe('monthly earnings and fees', () => {
  it('calculates monthly compound earnings on balance', () => {
    const fund = makeFund({
      balance: 1_000_000,
      investment_return: 0.07,
      admin_fee_flat: 0,
      admin_fee_percent: 0,
    });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      fyStartBalance: 1_000_000,
    }));

    const expectedMonthlyReturn = Math.pow(1.07, 1 / 12) - 1;
    expect(result.grossEarnings).toBeCloseTo(1_000_000 * expectedMonthlyReturn, 2);
  });

  it('deducts monthly admin fees', () => {
    const fund = makeFund({
      balance: 500_000,
      admin_fee_flat: 600,
      admin_fee_percent: 0.006,
      investment_return: 0,
    });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      fyStartBalance: 500_000,
    }));

    // Flat: $600/12 = $50, Percent: $500k × 0.6%/12 = $250
    expect(result.adminFees).toBeCloseTo(50 + 250, 0);
    expect(result.closingBalance).toBeLessThan(500_000);
  });

  it('deducts monthly insurance premium', () => {
    const fund = makeFund({
      balance: 500_000,
      insurance_premium: 1_200,
      investment_return: 0,
      admin_fee_flat: 0,
      admin_fee_percent: 0,
    });
    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      fyStartBalance: 500_000,
    }));

    expect(result.insurancePremium).toBeCloseTo(100, 0);
  });
});

// ── TTR Phase ────────────────────────────────────────────────────────────────

describe('transition to retirement (TTR)', () => {
  it('caps drawdown at 10% in TTR phase', () => {
    const fund = makeFund({
      balance: 1_000_000,
      phase: 'transition',
      pension_drawdown_rate: 0.15,
      admin_fee_flat: 0,
      admin_fee_percent: 0,
      insurance_premium: 0,
      investment_return: 0,
    });

    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 58,
      fyStartBalance: 1_000_000,
    }));

    // Min rate at 58 = 4%, specified 15%, capped at 10%
    expect(result.pensionDrawdown).toBeCloseTo(1_000_000 * 0.10 / 12, 2);
  });

  it('allows contributions in TTR phase', () => {
    const fund = makeFund({
      balance: 500_000,
      phase: 'transition',
      voluntary_concessional: 6_000,
    });

    const { result } = calculateSuperMonth(makeBaseParams({
      fund,
      age: 58,
      monthlyEmploymentIncome: 100_000 / 12,
      fyStartBalance: 500_000,
    }));

    expect(result.employerSG).toBeGreaterThan(0);
    expect(result.voluntaryConcessional).toBeCloseTo(500, 2);
  });
});
