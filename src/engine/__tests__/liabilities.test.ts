/**
 * Liabilities Module Tests
 *
 * Validates monthly amortisation for P&I and IO loans, offset account
 * mechanics, tax-deductible interest tracking, HECS/HELP behaviour,
 * auto-switch from IO to P&I, and the updateLiability state transition.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMonthlyPIRepayment,
  calculateLiabilityMonth,
  updateLiability,
  applyHecsIndexation,
} from '../liabilities';
import type { Liability } from '../models';
import type { LiabilityMonthResult } from '../liabilities';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLiability(overrides: Partial<Liability> & { id: string }): Liability {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    liability_type: overrides.liability_type ?? 'home_loan',
    current_balance: overrides.current_balance ?? 0,
    interest_rate: overrides.interest_rate ?? 0.06,
    repayment_type: overrides.repayment_type ?? 'principal_and_interest',
    annual_repayment: overrides.annual_repayment ?? null,
    remaining_term_years: overrides.remaining_term_years ?? 25,
    owner_id: overrides.owner_id ?? null,
    linked_asset_id: overrides.linked_asset_id ?? null,
    is_tax_deductible: overrides.is_tax_deductible ?? false,
    deductible_person_id: overrides.deductible_person_id ?? null,
    interest_only_remaining_years: overrides.interest_only_remaining_years ?? 0,
    secured_by_asset_id: overrides.secured_by_asset_id ?? null,
    offset_account_balance: overrides.offset_account_balance ?? 0,
  };
}

function simulateMonths(
  liability: Liability,
  months: number,
): { liability: Liability; results: LiabilityMonthResult[] } {
  let current = { ...liability };
  const results: LiabilityMonthResult[] = [];
  for (let i = 0; i < months; i++) {
    const result = calculateLiabilityMonth(current);
    results.push(result);
    current = updateLiability(current, result);
  }
  return { liability: current, results };
}

// ── calculateMonthlyPIRepayment ──────────────────────────────────────────────

describe('calculateMonthlyPIRepayment', () => {
  it('$500k at 6% over 30 years → ~$2,998', () => {
    const M = calculateMonthlyPIRepayment(500_000, 0.06, 360);
    expect(M).toBeCloseTo(2997.75, 0);
  });

  it('returns 0 for zero balance', () => {
    expect(calculateMonthlyPIRepayment(0, 0.06, 360)).toBe(0);
  });

  it('returns 0 for zero remaining months', () => {
    expect(calculateMonthlyPIRepayment(500_000, 0.06, 0)).toBe(0);
  });

  it('falls back to straight-line when rate is zero', () => {
    const M = calculateMonthlyPIRepayment(120_000, 0, 120);
    expect(M).toBe(1000);
  });
});

// ── P&I Mortgage — Month-by-Month ────────────────────────────────────────────

describe('P&I mortgage — $500k at 6% over 30 years', () => {
  const mortgage = makeLiability({
    id: 'mortgage_1',
    liability_type: 'home_loan',
    current_balance: 500_000,
    interest_rate: 0.06,
    remaining_term_years: 30,
  });

  it('monthly repayment ≈ $2,998', () => {
    const result = calculateLiabilityMonth(mortgage);
    expect(result.totalRepayment).toBeCloseTo(2997.75, 0);
  });

  it('month 1: interest ≈ $2,500, principal ≈ $498, balance ≈ $499,502', () => {
    const result = calculateLiabilityMonth(mortgage);

    expect(result.interestCharged).toBeCloseTo(2500, 2);
    expect(result.principalPaid).toBeCloseTo(497.75, 0);
    expect(result.closingBalance).toBeCloseTo(499_502.25, 0);
  });

  it('after 12 months: total interest + total principal = 12 × monthly repayment', () => {
    const { results } = simulateMonths(mortgage, 12);

    const totalInterest = results.reduce((s, r) => s + r.interestCharged, 0);
    const totalPrincipal = results.reduce((s, r) => s + r.principalPaid, 0);
    const totalRepayment = results.reduce((s, r) => s + r.totalRepayment, 0);

    expect(totalRepayment).toBeCloseTo(totalInterest + totalPrincipal, 2);
    expect(totalRepayment).toBeCloseTo(12 * 2997.75, 0);
  });

  it('after 12 months: balance decreasing each month', () => {
    const { results } = simulateMonths(mortgage, 12);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].openingBalance).toBeLessThan(results[i - 1].openingBalance);
    }
  });

  it('interest portion decreases over time as principal increases', () => {
    const { results } = simulateMonths(mortgage, 12);

    expect(results[11].interestCharged).toBeLessThan(results[0].interestCharged);
    expect(results[11].principalPaid).toBeGreaterThan(results[0].principalPaid);
  });

  it('zero-balance liability returns paid off immediately', () => {
    const paid = makeLiability({ id: 'done', current_balance: 0 });
    const result = calculateLiabilityMonth(paid);

    expect(result.isPaidOff).toBe(true);
    expect(result.totalRepayment).toBe(0);
  });
});

// ── Offset Account ───────────────────────────────────────────────────────────

describe('offset account', () => {
  const baseParams = {
    id: 'mortgage_offset',
    liability_type: 'home_loan' as const,
    current_balance: 500_000,
    interest_rate: 0.06,
    remaining_term_years: 30,
  };

  it('$50k offset: interest calculated on $450k, not $500k', () => {
    const mortgage = makeLiability({
      ...baseParams,
      offset_account_balance: 50_000,
    });

    const result = calculateLiabilityMonth(mortgage);

    expect(result.interestCharged).toBeCloseTo(450_000 * 0.06 / 12, 2);
    expect(result.interestCharged).toBeCloseTo(2250, 2);
  });

  it('offset savings tracked: $250 saved per month with $50k offset', () => {
    const mortgage = makeLiability({
      ...baseParams,
      offset_account_balance: 50_000,
    });

    const result = calculateLiabilityMonth(mortgage);

    expect(result.offsetSavings).toBeCloseTo(250, 2);
  });

  it('more principal paid with offset (same total repayment)', () => {
    const withoutOffset = calculateLiabilityMonth(
      makeLiability(baseParams),
    );
    const withOffset = calculateLiabilityMonth(
      makeLiability({ ...baseParams, offset_account_balance: 50_000 }),
    );

    expect(withOffset.totalRepayment).toBeCloseTo(withoutOffset.totalRepayment, 2);
    expect(withOffset.principalPaid).toBeGreaterThan(withoutOffset.principalPaid);
    expect(withOffset.interestCharged).toBeLessThan(withoutOffset.interestCharged);
  });

  it('after 12 months with offset: lower balance than without', () => {
    const without = simulateMonths(makeLiability(baseParams), 12);
    const withOff = simulateMonths(
      makeLiability({ ...baseParams, offset_account_balance: 50_000 }),
      12,
    );

    expect(withOff.liability.current_balance).toBeLessThan(
      without.liability.current_balance,
    );
  });

  it('offset equal to balance → zero interest', () => {
    const fullyOffset = makeLiability({
      ...baseParams,
      offset_account_balance: 500_000,
    });

    const result = calculateLiabilityMonth(fullyOffset);

    expect(result.interestCharged).toBe(0);
    expect(result.principalPaid).toBeCloseTo(result.totalRepayment, 2);
  });

  it('offset exceeding balance → clamped to zero effective balance', () => {
    const overOffset = makeLiability({
      ...baseParams,
      offset_account_balance: 600_000,
    });

    const result = calculateLiabilityMonth(overOffset);

    expect(result.interestCharged).toBe(0);
    expect(result.offsetSavings).toBeCloseTo(500_000 * 0.06 / 12, 2);
  });
});

// ── Interest-Only ────────────────────────────────────────────────────────────

describe('interest-only loan', () => {
  it('payment = balance × monthly rate, balance unchanged', () => {
    const io = makeLiability({
      id: 'io_loan',
      current_balance: 500_000,
      interest_rate: 0.06,
      repayment_type: 'interest_only',
    });

    const result = calculateLiabilityMonth(io);

    expect(result.totalRepayment).toBeCloseTo(2500, 2);
    expect(result.interestCharged).toBeCloseTo(2500, 2);
    expect(result.principalPaid).toBe(0);
    expect(result.closingBalance).toBe(500_000);
  });

  it('IO with offset: interest on effective balance', () => {
    const io = makeLiability({
      id: 'io_offset',
      current_balance: 500_000,
      interest_rate: 0.06,
      repayment_type: 'interest_only',
      offset_account_balance: 100_000,
    });

    const result = calculateLiabilityMonth(io);

    expect(result.interestCharged).toBeCloseTo(400_000 * 0.06 / 12, 2);
    expect(result.principalPaid).toBe(0);
    expect(result.closingBalance).toBe(500_000);
  });

  it('12 months IO: balance stays constant', () => {
    const io = makeLiability({
      id: 'io_12m',
      current_balance: 500_000,
      interest_rate: 0.06,
      repayment_type: 'interest_only',
    });

    const { liability } = simulateMonths(io, 12);

    expect(liability.current_balance).toBe(500_000);
  });
});

// ── IO → P&I Auto-Switch ─────────────────────────────────────────────────────

describe('IO to P&I auto-switch', () => {
  it('switches to P&I when IO period expires', () => {
    const loan = makeLiability({
      id: 'io_switch',
      current_balance: 500_000,
      interest_rate: 0.06,
      repayment_type: 'interest_only',
      interest_only_remaining_years: 1,
      remaining_term_years: 30,
    });

    // 12 months of IO (1 year)
    const { liability: afterIO, results: ioResults } = simulateMonths(loan, 12);

    expect(afterIO.repayment_type).toBe('principal_and_interest');
    expect(afterIO.interest_only_remaining_years).toBe(0);
    expect(afterIO.current_balance).toBe(500_000);

    // All IO months: zero principal
    for (const r of ioResults) {
      expect(r.principalPaid).toBe(0);
    }

    // Month 13 should be P&I with principal reduction
    const piResult = calculateLiabilityMonth(afterIO);
    expect(piResult.principalPaid).toBeGreaterThan(0);
    expect(piResult.closingBalance).toBeLessThan(500_000);
  });

  it('remaining term decreases during IO period', () => {
    const loan = makeLiability({
      id: 'io_term',
      current_balance: 400_000,
      interest_rate: 0.05,
      repayment_type: 'interest_only',
      interest_only_remaining_years: 2,
      remaining_term_years: 25,
    });

    const { liability } = simulateMonths(loan, 12);

    expect(liability.remaining_term_years).toBeCloseTo(24, 1);
    expect(liability.interest_only_remaining_years).toBeCloseTo(1, 1);
  });
});

// ── Tax-Deductible Interest ──────────────────────────────────────────────────

describe('tax-deductible interest', () => {
  it('tracks deductible interest for investment loans', () => {
    const investment = makeLiability({
      id: 'inv_loan',
      liability_type: 'investment_loan',
      current_balance: 400_000,
      interest_rate: 0.055,
      remaining_term_years: 25,
      is_tax_deductible: true,
      deductible_person_id: 'person_1',
    });

    const result = calculateLiabilityMonth(investment);

    expect(result.taxDeductibleInterest).toBeCloseTo(400_000 * 0.055 / 12, 2);
    expect(result.deductiblePersonId).toBe('person_1');
  });

  it('non-deductible loan has zero tax-deductible interest', () => {
    const home = makeLiability({
      id: 'home_loan',
      current_balance: 500_000,
      is_tax_deductible: false,
    });

    const result = calculateLiabilityMonth(home);

    expect(result.taxDeductibleInterest).toBe(0);
    expect(result.deductiblePersonId).toBe('');
  });

  it('deductible interest accumulates over 12 months', () => {
    const investment = makeLiability({
      id: 'inv_annual',
      liability_type: 'investment_loan',
      current_balance: 300_000,
      interest_rate: 0.06,
      remaining_term_years: 20,
      is_tax_deductible: true,
      deductible_person_id: 'person_2',
    });

    const { results } = simulateMonths(investment, 12);
    const totalDeductible = results.reduce((s, r) => s + r.taxDeductibleInterest, 0);
    const totalInterest = results.reduce((s, r) => s + r.interestCharged, 0);

    expect(totalDeductible).toBeCloseTo(totalInterest, 2);
    expect(totalDeductible).toBeGreaterThan(0);
  });
});

// ── HECS/HELP ────────────────────────────────────────────────────────────────

describe('HECS/HELP', () => {
  const hecs = makeLiability({
    id: 'hecs_1',
    liability_type: 'hecs_help',
    current_balance: 45_000,
    interest_rate: 0,
  });

  it('no monthly repayment', () => {
    const result = calculateLiabilityMonth(hecs);

    expect(result.totalRepayment).toBe(0);
    expect(result.interestCharged).toBe(0);
    expect(result.principalPaid).toBe(0);
    expect(result.closingBalance).toBe(45_000);
  });

  it('balance unchanged after 12 months', () => {
    const { liability } = simulateMonths(hecs, 12);

    expect(liability.current_balance).toBe(45_000);
  });

  it('annual CPI indexation: $45k at 3.5% → $46,575', () => {
    const indexed = applyHecsIndexation(hecs, 0.035);

    expect(indexed.current_balance).toBeCloseTo(46_575, 2);
  });

  it('indexation is a no-op for non-HECS liabilities', () => {
    const homeLoan = makeLiability({
      id: 'home',
      liability_type: 'home_loan',
      current_balance: 500_000,
    });

    const result = applyHecsIndexation(homeLoan, 0.035);
    expect(result.current_balance).toBe(500_000);
  });
});

// ── updateLiability ──────────────────────────────────────────────────────────

describe('updateLiability', () => {
  it('decrements remaining term by 1/12', () => {
    const loan = makeLiability({
      id: 'term_test',
      current_balance: 200_000,
      remaining_term_years: 20,
    });

    const result = calculateLiabilityMonth(loan);
    const updated = updateLiability(loan, result);

    expect(updated.remaining_term_years).toBeCloseTo(20 - 1 / 12, 6);
  });

  it('does not mutate the original liability', () => {
    const loan = makeLiability({
      id: 'immutable',
      current_balance: 300_000,
      remaining_term_years: 25,
    });

    const result = calculateLiabilityMonth(loan);
    updateLiability(loan, result);

    expect(loan.current_balance).toBe(300_000);
    expect(loan.remaining_term_years).toBe(25);
  });

  it('remaining term floors at zero', () => {
    const loan = makeLiability({
      id: 'short',
      current_balance: 1000,
      interest_rate: 0.05,
      remaining_term_years: 0,
    });

    const result = calculateLiabilityMonth(loan);
    const updated = updateLiability(loan, result);

    expect(updated.remaining_term_years).toBe(0);
  });

  it('HECS update preserves balance without changing term', () => {
    const hecs = makeLiability({
      id: 'hecs_update',
      liability_type: 'hecs_help',
      current_balance: 30_000,
      remaining_term_years: 0,
    });

    const result = calculateLiabilityMonth(hecs);
    const updated = updateLiability(hecs, result);

    expect(updated.current_balance).toBe(30_000);
    expect(updated.remaining_term_years).toBe(0);
  });
});

// ── Annual Repayment Override ─────────────────────────────────────────────────

describe('annual repayment override', () => {
  it('uses annual_repayment / 12 when set', () => {
    const loan = makeLiability({
      id: 'override',
      current_balance: 500_000,
      interest_rate: 0.06,
      remaining_term_years: 30,
      annual_repayment: 48_000,
    });

    const result = calculateLiabilityMonth(loan);

    expect(result.totalRepayment).toBeCloseTo(4000, 2);
    expect(result.interestCharged).toBeCloseTo(2500, 2);
    expect(result.principalPaid).toBeCloseTo(1500, 2);
  });

  it('extra repayments pay down loan faster', () => {
    const standard = makeLiability({
      id: 'std',
      current_balance: 500_000,
      interest_rate: 0.06,
      remaining_term_years: 30,
    });

    const extra = makeLiability({
      id: 'extra',
      current_balance: 500_000,
      interest_rate: 0.06,
      remaining_term_years: 30,
      annual_repayment: 48_000,
    });

    const stdResult = simulateMonths(standard, 12);
    const extraResult = simulateMonths(extra, 12);

    expect(extraResult.liability.current_balance).toBeLessThan(
      stdResult.liability.current_balance,
    );
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('loan fully repaid mid-simulation triggers isPaidOff', () => {
    const small = makeLiability({
      id: 'tiny_loan',
      current_balance: 100,
      interest_rate: 0.06,
      remaining_term_years: 1,
    });

    const { results } = simulateMonths(small, 24);
    const paidOffMonth = results.findIndex((r) => r.isPaidOff);

    expect(paidOffMonth).toBeGreaterThan(0);
    expect(paidOffMonth).toBeLessThan(13);
  });

  it('secured_by_asset_id is preserved through updates', () => {
    const loan = makeLiability({
      id: 'secured',
      current_balance: 400_000,
      secured_by_asset_id: 'property_1',
    });

    const result = calculateLiabilityMonth(loan);
    const updated = updateLiability(loan, result);

    expect(updated.secured_by_asset_id).toBe('property_1');
  });

  it('negative balance treated as paid off', () => {
    const loan = makeLiability({ id: 'neg', current_balance: -100 });
    const result = calculateLiabilityMonth(loan);

    expect(result.isPaidOff).toBe(true);
    expect(result.totalRepayment).toBe(0);
  });
});
