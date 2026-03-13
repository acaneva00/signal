/**
 * Superannuation Module
 *
 * Monthly calculations for Australian super: SG contributions, voluntary
 * concessional/NCC, cap enforcement (cumulative across FY), earnings tax,
 * fees, pension drawdown, and advanced strategies.
 *
 * Strategies:
 * - Catch-up concessional: unused cap from previous 5 FYs carried forward (balance < $500k)
 * - Bring-forward NCC: up to 3× annual NCC cap in one year (balance < $1.9M)
 * - Spouse contributions: up to $3k for tax offset if receiving spouse income < $40k
 * - Downsizer: up to $300k per person from primary residence sale (age 55+, owned 10+ years)
 * - Div 293: additional 15% on concessional contributions if income + contributions > $250k
 */

import type { SuperFund, SuperPhase } from './models';
import {
  getMinimumDrawdownRate,
  CONTRIBUTIONS_TAX_RATE,
  EARNINGS_TAX_RATE_ACCUMULATION,
  EARNINGS_TAX_RATE_PENSION,
  MAX_TTR_DRAWDOWN_RATE,
} from './rates/super-fy2025';

export { CONTRIBUTIONS_TAX_RATE, EARNINGS_TAX_RATE_ACCUMULATION, EARNINGS_TAX_RATE_PENSION, MAX_TTR_DRAWDOWN_RATE };

export const CATCH_UP_BALANCE_THRESHOLD = 500_000;
export const CATCH_UP_LOOKBACK_YEARS = 5;
export const BRING_FORWARD_YEARS = 3;

export const SPOUSE_CONTRIBUTION_MAX = 3_000;
export const SPOUSE_INCOME_THRESHOLD = 40_000;
export const SPOUSE_TAX_OFFSET_MAX = 540;
export const SPOUSE_OFFSET_SHADE_OUT_START = 37_000;

export const DOWNSIZER_MAX_PER_PERSON = 300_000;
export const DOWNSIZER_MIN_AGE = 55;
export const DOWNSIZER_MIN_OWNERSHIP_YEARS = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SuperMonthResult {
  personId: string;
  month: number;
  year: number;
  financialYear: number;
  openingBalance: number;

  employerSG: number;
  salarySacrifice: number;
  voluntaryConcessional: number;
  totalConcessional: number;
  concessionalCapExcess: number;
  voluntaryNonConcessional: number;
  nccCapExcess: number;
  spouseContribution: number;
  downsizer: number;

  contributionsTax: number;
  grossEarnings: number;
  earningsTax: number;
  adminFees: number;
  insurancePremium: number;

  pensionDrawdown: number;
  closingBalance: number;
  phase: SuperPhase;
}

/** Cumulative FY contribution tracking — reset at each FY boundary. */
export interface FYContributionState {
  financialYear: number;
  concessionalUsed: number;
  nonConcessionalUsed: number;
}

/** Catch-up concessional state — persists across FYs. */
export interface CatchUpState {
  unusedCapByFY: Record<number, number>;
}

/** Bring-forward NCC window state — persists across FYs within a 3-year window. */
export interface BringForwardState {
  triggeredInFY: number | null;
  totalUsedInWindow: number;
}

/** One-off downsizer contribution event. */
export interface DownsizerEvent {
  amount: number;
  personAge: number;
  yearsOwned: number;
}

export interface SuperMonthParams {
  fund: SuperFund;
  age: number;
  year: number;
  month: number; // 1–12
  monthlyEmploymentIncome: number;
  monthlySalarySacrifice: number;
  sgRate: number;
  concessionalCap: number;
  nonConcessionalCap: number;
  bringForwardTSBThreshold: number;
  isRetired: boolean;
  preservationAge: number;
  fyContributions: FYContributionState;
  fyStartBalance: number;
  catchUpState?: CatchUpState;
  bringForwardState?: BringForwardState;
  downsizer?: DownsizerEvent;
}

export interface SuperMonthOutput {
  result: SuperMonthResult;
  updatedFYContributions: FYContributionState;
  updatedBringForwardState: BringForwardState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Australian FY: Jul 2025–Jun 2026 = FY2026. */
export function getFinancialYear(year: number, month: number): number {
  return month >= 7 ? year + 1 : year;
}

/** Convert annual return to compound monthly return. */
export function monthlyReturnRate(annualReturn: number): number {
  return Math.pow(1 + annualReturn, 1 / 12) - 1;
}

/** Monthly SG contribution = annual income × SG rate ÷ 12. */
export function calculateMonthlySG(annualIncome: number, sgRate: number): number {
  return (annualIncome * sgRate) / 12;
}

/**
 * Available catch-up concessional: sum of unused cap from previous 5 FYs.
 * Only available if total super balance at FY start < $500k.
 */
export function getAvailableCatchUp(
  catchUpState: CatchUpState,
  currentFY: number,
  fyStartBalance: number,
): number {
  if (fyStartBalance >= CATCH_UP_BALANCE_THRESHOLD) return 0;

  let available = 0;
  for (let fy = currentFY - CATCH_UP_LOOKBACK_YEARS; fy < currentFY; fy++) {
    available += catchUpState.unusedCapByFY[fy] ?? 0;
  }
  return available;
}

/**
 * Maximum NCC available including bring-forward.
 *
 * - Active window: remaining = 3 × cap − total used in window
 * - No window, balance < threshold: full 3 × cap (potential trigger)
 * - No window, balance ≥ threshold: annual cap only
 */
export function getAvailableBringForward(
  bringForwardState: BringForwardState,
  currentFY: number,
  fyStartBalance: number,
  annualNCCCap: number,
  tsbThreshold: number,
): number {
  if (bringForwardState.triggeredInFY !== null) {
    const yearsElapsed = currentFY - bringForwardState.triggeredInFY;
    if (yearsElapsed < BRING_FORWARD_YEARS) {
      return Math.max(
        0,
        annualNCCCap * BRING_FORWARD_YEARS - bringForwardState.totalUsedInWindow,
      );
    }
  }

  if (fyStartBalance >= tsbThreshold) return annualNCCCap;
  return annualNCCCap * BRING_FORWARD_YEARS;
}

/**
 * Tax offset for contributing spouse.
 * 18% of eligible contribution (up to $3k), max $540.
 * Reduces by $1 for each $1 that receiving spouse income exceeds $37k.
 */
export function calculateSpouseTaxOffset(
  contributionAmount: number,
  receivingSpouseIncome: number,
): number {
  if (receivingSpouseIncome >= SPOUSE_INCOME_THRESHOLD) return 0;

  const eligible = Math.min(contributionAmount, SPOUSE_CONTRIBUTION_MAX);
  const incomeReduction = Math.max(0, receivingSpouseIncome - SPOUSE_OFFSET_SHADE_OUT_START);
  const reducedBase = Math.max(0, eligible - incomeReduction);

  return Math.min(reducedBase * 0.18, SPOUSE_TAX_OFFSET_MAX);
}

export function isDownsizerEligible(personAge: number, yearsOwned: number): boolean {
  return personAge >= DOWNSIZER_MIN_AGE && yearsOwned >= DOWNSIZER_MIN_OWNERSHIP_YEARS;
}

export function isSuperAccessible(age: number, preservationAge: number, isRetired: boolean): boolean {
  if (age >= 65) return true;
  return age >= preservationAge && isRetired;
}

// ── Main Monthly Calculation ─────────────────────────────────────────────────

export function calculateSuperMonth(params: SuperMonthParams): SuperMonthOutput {
  const {
    fund,
    age,
    year,
    month,
    monthlyEmploymentIncome,
    monthlySalarySacrifice,
    sgRate,
    concessionalCap,
    nonConcessionalCap,
    bringForwardTSBThreshold,
    isRetired,
    preservationAge,
    fyContributions,
    fyStartBalance,
    catchUpState,
    bringForwardState = { triggeredInFY: null, totalUsedInWindow: 0 },
    downsizer,
  } = params;

  const fy = getFinancialYear(year, month);

  const result: SuperMonthResult = {
    personId: fund.person_id,
    month,
    year,
    financialYear: fy,
    openingBalance: fund.balance,
    employerSG: 0,
    salarySacrifice: 0,
    voluntaryConcessional: 0,
    totalConcessional: 0,
    concessionalCapExcess: 0,
    voluntaryNonConcessional: 0,
    nccCapExcess: 0,
    spouseContribution: 0,
    downsizer: 0,
    contributionsTax: 0,
    grossEarnings: 0,
    earningsTax: 0,
    adminFees: 0,
    insurancePremium: 0,
    pensionDrawdown: 0,
    closingBalance: 0,
    phase: fund.phase,
  };

  let balance = fund.balance;

  // ── FY boundary handling ───────────────────────────────────────────
  const updatedFY: FYContributionState = fy !== fyContributions.financialYear
    ? { financialYear: fy, concessionalUsed: 0, nonConcessionalUsed: 0 }
    : { ...fyContributions };

  const updatedBF = { ...bringForwardState };

  // Expire bring-forward window at FY transition
  if (fy !== fyContributions.financialYear
      && updatedBF.triggeredInFY !== null
      && fy - updatedBF.triggeredInFY >= BRING_FORWARD_YEARS) {
    updatedBF.triggeredInFY = null;
    updatedBF.totalUsedInWindow = 0;
  }

  // ── Phase transition ───────────────────────────────────────────────
  if (isRetired && age >= preservationAge && fund.phase === 'accumulation') {
    result.phase = 'pension';
  }
  const phase = result.phase;

  // ── Contributions (accumulation / TTR only) ────────────────────────
  if (phase === 'accumulation' || phase === 'transition') {
    // Employer SG
    if (fund.employer_sg_included && monthlyEmploymentIncome > 0 && !isRetired) {
      result.employerSG = monthlyEmploymentIncome * sgRate;
    }

    // Salary sacrifice
    if (monthlySalarySacrifice > 0 && !isRetired) {
      result.salarySacrifice = monthlySalarySacrifice;
    }

    // Voluntary concessional (annual amount ÷ 12)
    result.voluntaryConcessional = fund.voluntary_concessional / 12;

    // ── Concessional cap enforcement ─────────────────────────────────
    let monthlyConcessional =
      result.employerSG + result.salarySacrifice + result.voluntaryConcessional;

    let effectiveConcessionalCap = concessionalCap;
    if (catchUpState) {
      effectiveConcessionalCap += getAvailableCatchUp(catchUpState, fy, fyStartBalance);
    }

    const concessionalRoom = Math.max(0, effectiveConcessionalCap - updatedFY.concessionalUsed);
    if (monthlyConcessional > concessionalRoom) {
      result.concessionalCapExcess = monthlyConcessional - concessionalRoom;
      monthlyConcessional = concessionalRoom;
    }

    result.totalConcessional = monthlyConcessional;
    updatedFY.concessionalUsed += monthlyConcessional;

    result.contributionsTax = result.totalConcessional * CONTRIBUTIONS_TAX_RATE;

    // ── NCC + spouse contribution cap enforcement ────────────────────
    let monthlyNCC = fund.voluntary_non_concessional / 12;
    const monthlySpouse = fund.spouse_contribution / 12;
    let totalMonthlyNCC = monthlyNCC + monthlySpouse;

    let nccRoom: number;

    if (updatedBF.triggeredInFY !== null && fy - updatedBF.triggeredInFY < BRING_FORWARD_YEARS) {
      // Active bring-forward window
      nccRoom = Math.max(
        0,
        nonConcessionalCap * BRING_FORWARD_YEARS - updatedBF.totalUsedInWindow,
      );
    } else {
      // Standard annual cap
      nccRoom = Math.max(0, nonConcessionalCap - updatedFY.nonConcessionalUsed);

      // Trigger bring-forward if NCC would exceed annual cap and eligible
      if (totalMonthlyNCC > nccRoom && fyStartBalance < bringForwardTSBThreshold) {
        updatedBF.triggeredInFY = fy;
        updatedBF.totalUsedInWindow = updatedFY.nonConcessionalUsed;
        nccRoom = Math.max(
          0,
          nonConcessionalCap * BRING_FORWARD_YEARS - updatedBF.totalUsedInWindow,
        );
      }
    }

    if (totalMonthlyNCC > nccRoom) {
      result.nccCapExcess = totalMonthlyNCC - nccRoom;
      const voluntaryApplied = Math.min(monthlyNCC, nccRoom);
      const spouseApplied = Math.min(monthlySpouse, nccRoom - voluntaryApplied);
      monthlyNCC = voluntaryApplied;
      totalMonthlyNCC = voluntaryApplied + spouseApplied;
    }

    result.voluntaryNonConcessional = monthlyNCC;
    result.spouseContribution = totalMonthlyNCC - monthlyNCC;

    updatedFY.nonConcessionalUsed += totalMonthlyNCC;
    if (updatedBF.triggeredInFY !== null) {
      updatedBF.totalUsedInWindow += totalMonthlyNCC;
    }

    // Net contributions into balance
    balance +=
      result.totalConcessional
      - result.contributionsTax
      + result.voluntaryNonConcessional
      + result.spouseContribution;
  }

  // ── Downsizer (not subject to contribution caps) ───────────────────
  if (downsizer && isDownsizerEligible(downsizer.personAge, downsizer.yearsOwned)) {
    result.downsizer = Math.min(downsizer.amount, DOWNSIZER_MAX_PER_PERSON);
    balance += result.downsizer;
  }

  // ── Earnings ───────────────────────────────────────────────────────
  const effectiveReturn = phase === 'pension'
    ? fund.retirement_investment_return
    : fund.investment_return;
  const monthReturn = monthlyReturnRate(effectiveReturn);
  result.grossEarnings = balance * monthReturn;

  if (phase === 'accumulation' || phase === 'transition') {
    result.earningsTax = Math.max(0, result.grossEarnings) * EARNINGS_TAX_RATE_ACCUMULATION;
  } else {
    result.earningsTax = Math.max(0, result.grossEarnings) * EARNINGS_TAX_RATE_PENSION;
  }

  balance += result.grossEarnings - result.earningsTax;

  // ── Fees (annualised ÷ 12) ────────────────────────────────────────
  result.adminFees = fund.admin_fee_flat / 12 + balance * (fund.admin_fee_percent / 12);
  result.insurancePremium = fund.insurance_premium / 12;
  balance -= result.adminFees + result.insurancePremium;

  // ── Pension drawdown ───────────────────────────────────────────────
  if (phase === 'pension' && balance > 0) {
    const minRate = getMinimumDrawdownRate(age);
    const annualRate = fund.pension_drawdown_rate !== null
      ? Math.max(fund.pension_drawdown_rate, minRate)
      : minRate;
    result.pensionDrawdown = Math.min((balance * annualRate) / 12, balance);
    balance -= result.pensionDrawdown;
  } else if (phase === 'transition' && balance > 0) {
    const minRate = getMinimumDrawdownRate(age);
    const annualRate = Math.min(
      MAX_TTR_DRAWDOWN_RATE,
      Math.max(minRate, fund.pension_drawdown_rate ?? minRate),
    );
    result.pensionDrawdown = Math.min((balance * annualRate) / 12, balance);
    balance -= result.pensionDrawdown;
  }

  result.closingBalance = Math.max(0, balance);

  return {
    result,
    updatedFYContributions: updatedFY,
    updatedBringForwardState: updatedBF,
  };
}

// ── FY-End Processing ────────────────────────────────────────────────────────

/**
 * Update catch-up state at end of financial year.
 * Records unused concessional cap and consumes catch-up from oldest FYs first.
 */
export function updateCatchUpStateAtFYEnd(
  catchUpState: CatchUpState,
  completedFY: number,
  concessionalCap: number,
  concessionalUsed: number,
): CatchUpState {
  const updated: CatchUpState = {
    unusedCapByFY: { ...catchUpState.unusedCapByFY },
  };

  // Consume catch-up from oldest FY entries first
  let remaining = Math.max(0, concessionalUsed - concessionalCap);
  const sortedFYs = Object.keys(updated.unusedCapByFY)
    .map(Number)
    .filter(fy => fy < completedFY)
    .sort((a, b) => a - b);

  for (const fy of sortedFYs) {
    if (remaining <= 0) break;
    const available = updated.unusedCapByFY[fy];
    const consumed = Math.min(available, remaining);
    updated.unusedCapByFY[fy] -= consumed;
    remaining -= consumed;
    if (updated.unusedCapByFY[fy] <= 0) {
      delete updated.unusedCapByFY[fy];
    }
  }

  // Record unused for the completed FY
  const unused = Math.max(0, concessionalCap - concessionalUsed);
  if (unused > 0) {
    updated.unusedCapByFY[completedFY] = unused;
  }

  // Prune entries beyond the lookback window
  for (const fyStr of Object.keys(updated.unusedCapByFY)) {
    const fy = Number(fyStr);
    if (fy <= completedFY - CATCH_UP_LOOKBACK_YEARS) {
      delete updated.unusedCapByFY[fy];
    }
  }

  return updated;
}
