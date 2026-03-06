/**
 * Liabilities Module
 *
 * Monthly liability calculations including:
 * - Principal & Interest: exact monthly amortisation
 *     M = P × [r(1+r)^n] / [(1+r)^n − 1]
 * - Interest-Only: payment = effective_balance × monthly_rate
 * - Auto-switch from IO to P&I when IO period expires
 * - Offset account: interest calculated on (balance − offset)
 * - Tax-deductible interest tracking for investment loans
 * - HECS/HELP: no monthly repayment — repaid via tax system at EOFY
 * - Asset-liability linking via secured_by_asset_id
 *
 * All functions are pure — no side effects.
 */

import type { Liability } from './models';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LiabilityMonthResult {
  liabilityId: string;
  openingBalance: number;
  interestCharged: number;
  principalPaid: number;
  totalRepayment: number;
  closingBalance: number;
  taxDeductibleInterest: number;
  deductiblePersonId: string;
  isPaidOff: boolean;
  offsetSavings: number;
}

// ── Monthly P&I Repayment ────────────────────────────────────────────────────

/**
 * Fixed monthly P&I repayment via the standard annuity formula.
 *
 * M = P × [r(1+r)^n] / [(1+r)^n − 1]
 *
 * where P = principal balance, r = annual_rate / 12, n = remaining months.
 * When rate is zero, falls back to straight-line (balance / remaining months).
 */
export function calculateMonthlyPIRepayment(
  balance: number,
  annualRate: number,
  remainingMonths: number,
): number {
  if (balance <= 0 || remainingMonths <= 0) return 0;
  if (annualRate <= 0) return balance / remainingMonths;

  const r = annualRate / 12;
  const n = remainingMonths;
  const compound = Math.pow(1 + r, n);
  return balance * (r * compound) / (compound - 1);
}

// ── Monthly Liability Calculation ────────────────────────────────────────────

/**
 * Calculate one month of liability repayment.
 *
 * For P&I loans the scheduled payment is calculated from the current balance
 * and remaining term (self-consistent with the annuity formula). If
 * `annual_repayment` is set on the liability it is used as an override
 * (divided by 12) to model extra repayments or fixed payment schedules.
 *
 * For offset accounts the effective balance (balance − offset) is used for
 * interest while the scheduled repayment stays based on the full balance.
 * This means more of each payment goes to principal — matching how Australian
 * offset mortgages work in practice.
 */
export function calculateLiabilityMonth(
  liability: Liability,
): LiabilityMonthResult {
  const result: LiabilityMonthResult = {
    liabilityId: liability.id,
    openingBalance: liability.current_balance,
    interestCharged: 0,
    principalPaid: 0,
    totalRepayment: 0,
    closingBalance: 0,
    taxDeductibleInterest: 0,
    deductiblePersonId: '',
    isPaidOff: false,
    offsetSavings: 0,
  };

  const balance = liability.current_balance;

  if (balance <= 0) {
    result.isPaidOff = true;
    return result;
  }

  // ── HECS/HELP ──────────────────────────────────────────────────────
  // No monthly repayment. Compulsory repayment handled via tax system.
  // CPI indexation applied at EOFY via applyHecsIndexation().
  if (liability.liability_type === 'hecs_help') {
    result.closingBalance = balance;
    return result;
  }

  const monthlyRate = liability.interest_rate / 12;

  // Effective balance for interest (reduced by offset account)
  const offset = Math.max(0, liability.offset_account_balance);
  const effectiveBalance = Math.max(0, balance - offset);

  const interestWithoutOffset = balance * monthlyRate;
  const interestWithOffset = effectiveBalance * monthlyRate;
  result.offsetSavings = interestWithoutOffset - interestWithOffset;

  // ── Interest-Only ──────────────────────────────────────────────────
  const isIO =
    liability.repayment_type === 'interest_only' ||
    liability.interest_only_remaining_years > 0;

  if (isIO) {
    result.interestCharged = interestWithOffset;
    result.principalPaid = 0;
    result.totalRepayment = result.interestCharged;
    result.closingBalance = balance;
  }

  // ── Principal & Interest ───────────────────────────────────────────
  else {
    const remainingMonths = Math.round(liability.remaining_term_years * 12);

    let monthlyRepayment: number;
    if (liability.annual_repayment != null && liability.annual_repayment > 0) {
      monthlyRepayment = liability.annual_repayment / 12;
    } else {
      monthlyRepayment = calculateMonthlyPIRepayment(
        balance,
        liability.interest_rate,
        remainingMonths,
      );
    }

    result.interestCharged = interestWithOffset;
    result.principalPaid = monthlyRepayment - result.interestCharged;

    if (result.principalPaid > balance) {
      result.principalPaid = balance;
    }
    if (result.principalPaid < 0) {
      result.principalPaid = 0;
    }

    result.totalRepayment = result.principalPaid + result.interestCharged;
    result.closingBalance = balance - result.principalPaid;
  }

  // ── Tax deductibility ──────────────────────────────────────────────
  if (liability.is_tax_deductible) {
    result.taxDeductibleInterest = result.interestCharged;
    result.deductiblePersonId = liability.deductible_person_id ?? '';
  }

  if (result.closingBalance <= 0.01) {
    result.closingBalance = 0;
    result.isPaidOff = true;
  }

  return result;
}

// ── Update Liability ─────────────────────────────────────────────────────────

/**
 * Return a copy of the liability with updated balance and term after one month.
 *
 * Remaining term decrements by 1/12 of a year. When an IO period expires the
 * repayment type is automatically switched to P&I for subsequent months.
 *
 * Note: remaining_term_years becomes fractional during projection — this is
 * expected for monthly granularity.
 */
export function updateLiability(
  liability: Liability,
  result: LiabilityMonthResult,
): Liability {
  if (liability.liability_type === 'hecs_help') {
    return { ...liability, current_balance: result.closingBalance };
  }

  const updated: Liability = {
    ...liability,
    current_balance: result.closingBalance,
    remaining_term_years: Math.max(0, liability.remaining_term_years - 1 / 12),
  };

  if (liability.interest_only_remaining_years > 0) {
    updated.interest_only_remaining_years = Math.max(
      0,
      liability.interest_only_remaining_years - 1 / 12,
    );

    if (updated.interest_only_remaining_years <= 1e-9) {
      updated.repayment_type = 'principal_and_interest';
      updated.interest_only_remaining_years = 0;
    }
  }

  return updated;
}

// ── HECS Indexation ──────────────────────────────────────────────────────────

/**
 * Apply annual CPI indexation to a HECS/HELP debt (called at EOFY).
 *
 * HECS debts are indexed on 1 June each year by the CPI rate.
 * Compulsory repayments are handled separately via the tax module based
 * on income thresholds.
 */
export function applyHecsIndexation(
  liability: Liability,
  cpiRate: number,
): Liability {
  if (liability.liability_type !== 'hecs_help') return { ...liability };

  return {
    ...liability,
    current_balance: liability.current_balance * (1 + cpiRate),
  };
}
