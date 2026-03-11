export interface AdminFeeTier {
  balance_from: number;
  balance_to: number | null;
  rate_pct: number;
}

export interface FeeStructure {
  admin_fee_pa?: number;
  admin_fee_pct?: number;
  admin_fee_cap_pa?: number;
  admin_fee_min_pa?: number;
  admin_fee_tiers?: AdminFeeTier[];
  investment_fee_default_pct?: number;
  performance_fee_pct?: number;
  buy_spread_pct?: number;
  sell_spread_pct?: number;
  total_fee_at_50k?: number;
  orfr_pct?: number;
  expense_recovery_pct?: number;
  notes?: string;
}

/**
 * Total annual dollar fee at a given balance.
 *
 * Components:
 *   1. Fixed admin_fee_pa
 *   2. Percentage-based admin fee — either flat (admin_fee_pct, capped at
 *      admin_fee_cap_pa) or tiered (admin_fee_tiers). Tiers take precedence.
 *   3. Investment fee (investment_fee_default_pct × balance)
 */
export function calculateAnnualFee(feeStructure: FeeStructure, balance: number): number {
  let total = 0;

  total += feeStructure.admin_fee_pa ?? 0;

  if (feeStructure.admin_fee_tiers?.length) {
    for (const tier of feeStructure.admin_fee_tiers) {
      if (balance <= tier.balance_from) break;
      const ceiling = tier.balance_to ?? Infinity;
      const applicable = Math.min(balance, ceiling) - tier.balance_from;
      total += (tier.rate_pct / 100) * applicable;
    }
  } else if (feeStructure.admin_fee_pct != null) {
    let pctFee = (feeStructure.admin_fee_pct / 100) * balance;
    if (feeStructure.admin_fee_cap_pa != null) {
      pctFee = Math.min(pctFee, feeStructure.admin_fee_cap_pa);
    }
    total += pctFee;
  }

  if (feeStructure.investment_fee_default_pct != null) {
    total += (feeStructure.investment_fee_default_pct / 100) * balance;
  }

  return Math.max(total, 0);
}

/**
 * Positive = a is more expensive than b at the given balance.
 */
export function feeGapAtBalance(
  a: FeeStructure,
  b: FeeStructure,
  balance: number,
): number {
  return calculateAnnualFee(a, balance) - calculateAnnualFee(b, balance);
}

const INDUSTRY_AVG_ADMIN_PA = 78;
const INDUSTRY_AVG_TOTAL_PCT = 0.85;

/**
 * Hardcoded industry benchmark: $78 p.a. + 0.85% p.a. (no cap).
 * Disclosed to users as the default assumption when fund is unknown.
 */
export function industryAverageFee(balance: number): number {
  return INDUSTRY_AVG_ADMIN_PA + (INDUSTRY_AVG_TOTAL_PCT / 100) * balance;
}
