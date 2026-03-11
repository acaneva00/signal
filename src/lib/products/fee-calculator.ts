export interface AdminFeeTier {
  balance_from: number;
  balance_to: number | null;
  rate_pct: number;
}

export interface InvestmentOption {
  name: string;
  investment_fee_pct?: number;
  total_fee_pct?: number;
  description?: string;
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
  investment_options?: InvestmentOption[];
}

const YEAR_PATTERN = /\d{4}[–\-+s]/;
const BORN_PATTERN = /born\s+\d{4}/i;

function isLifestageOption(name: string): boolean {
  return YEAR_PATTERN.test(name) || BORN_PATTERN.test(name);
}

function matchesBirthYear(optionName: string, birthYear: number): boolean {
  const decadeMatch = optionName.match(/(\d{4})s\b/);
  if (decadeMatch) {
    const start = parseInt(decadeMatch[1]);
    return birthYear >= start && birthYear <= start + 9;
  }

  const rangeMatch = optionName.match(/(\d{4})[–\-](\d{2,4})/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    let end = parseInt(rangeMatch[2]);
    if (end < 100) end += Math.floor(start / 100) * 100;
    return birthYear >= start && birthYear <= end;
  }

  const plusMatch = optionName.match(/(\d{4})\+/);
  if (plusMatch) {
    return birthYear >= parseInt(plusMatch[1]);
  }

  return false;
}

/**
 * Resolve the investment fee percentage for a named option.
 * For Lifestage-style options (names containing year ranges), birthYear
 * is required to select the correct cohort.
 */
function resolveInvestmentFeePct(
  options: InvestmentOption[],
  optionName: string,
  adminFeePct: number,
  birthYear?: number,
): number {
  const lower = optionName.toLowerCase();

  const exactMatch = options.find(
    (o) => o.name.toLowerCase() === lower,
  );
  if (exactMatch) {
    return exactMatch.investment_fee_pct ?? deriveInvestmentFee(exactMatch, adminFeePct);
  }

  const lifestageMatches = options.filter((o) => isLifestageOption(o.name));
  const hasLifestageOptions = lifestageMatches.length > 0;

  const partialMatch = options.find(
    (o) => o.name.toLowerCase().startsWith(lower) ||
           o.name.toLowerCase().includes(`${lower} `) ||
           o.name.toLowerCase().includes(`${lower}(`),
  );

  if (partialMatch && !isLifestageOption(partialMatch.name)) {
    return partialMatch.investment_fee_pct ?? deriveInvestmentFee(partialMatch, adminFeePct);
  }

  if (hasLifestageOptions && lifestageMatches.some(
    (o) => o.name.toLowerCase().startsWith(lower),
  )) {
    if (birthYear == null) {
      throw new Error(
        `birthYear is required to select the correct Lifestage cohort for "${optionName}"`,
      );
    }
    const cohort = lifestageMatches.find((o) => matchesBirthYear(o.name, birthYear));
    if (!cohort) {
      throw new Error(
        `No Lifestage cohort matches birth year ${birthYear} for "${optionName}"`,
      );
    }
    return cohort.investment_fee_pct ?? deriveInvestmentFee(cohort, adminFeePct);
  }

  if (partialMatch) {
    return partialMatch.investment_fee_pct ?? deriveInvestmentFee(partialMatch, adminFeePct);
  }

  throw new Error(`Investment option "${optionName}" not found`);
}

function deriveInvestmentFee(option: InvestmentOption, adminFeePct: number): number {
  if (option.total_fee_pct != null) {
    return Math.max(option.total_fee_pct - adminFeePct, 0);
  }
  return 0;
}

/**
 * Total annual dollar fee at a given balance.
 *
 * Components:
 *   1. Fixed admin_fee_pa
 *   2. Percentage-based admin fee — either flat (admin_fee_pct, capped at
 *      admin_fee_cap_pa) or tiered (admin_fee_tiers). Tiers take precedence.
 *   3. Investment fee (investment_fee_default_pct × balance)
 *
 * When investmentOption is specified, the investment fee is resolved from
 * the matching entry in investment_options instead of the default. For
 * Lifestage-style funds (options with year ranges in names), birthYear
 * is required to select the correct cohort — omitting it throws.
 */
export function calculateAnnualFee(
  feeStructure: FeeStructure,
  balance: number,
  investmentOption?: string,
  birthYear?: number,
): number {
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

  let investmentFeePct = feeStructure.investment_fee_default_pct;

  if (investmentOption && feeStructure.investment_options?.length) {
    investmentFeePct = resolveInvestmentFeePct(
      feeStructure.investment_options,
      investmentOption,
      feeStructure.admin_fee_pct ?? 0,
      birthYear,
    );
  }

  if (investmentFeePct != null) {
    total += (investmentFeePct / 100) * balance;
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
