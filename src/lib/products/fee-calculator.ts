export type { InvestmentOption } from './investment-options';
import type { InvestmentOption } from './investment-options';

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
  member_fee_monthly?: number;
  advice_fee_pct?: number;
  indirect_cost_ratio?: number;
  performance_fee_pct?: number;
  buy_spread_pct?: number;
  sell_spread_pct?: number;
  total_fee_at_50k?: number;
  orfr_pct?: number;
  expense_recovery_pct?: number;
  notes?: string;
  investment_options?: InvestmentOption[];
}

export interface FeeComponentCalc {
  label: string;
  annual_dollar: number;
  basis: string;
  type: 'flat' | 'percentage';
}

export interface FeeDecomposition {
  components: FeeComponentCalc[];
  resolvedOptionName: string | undefined;
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

interface ResolvedOption {
  pct: number;
  optionName: string;
}

/**
 * Resolve the investment fee percentage for a named option.
 * Returns both the fee percentage and the matched option name so the
 * label and the number always come from the same resolution.
 *
 * For Lifestage-style options (names containing year ranges), birthYear
 * is required to select the correct cohort.
 */
function resolveInvestmentOption(
  options: InvestmentOption[],
  optionName: string,
  adminFeePct: number,
  birthYear?: number,
): ResolvedOption {
  const lower = optionName.toLowerCase();

  const exactMatch = options.find(
    (o) => o.name.toLowerCase() === lower,
  );
  if (exactMatch) {
    return {
      pct: exactMatch.investment_fee_pct ?? deriveInvestmentFee(exactMatch, adminFeePct),
      optionName: exactMatch.name,
    };
  }

  const lifestageMatches = options.filter((o) => isLifestageOption(o.name));
  const hasLifestageOptions = lifestageMatches.length > 0;

  const partialMatch = options.find(
    (o) => o.name.toLowerCase().startsWith(lower) ||
           o.name.toLowerCase().includes(`${lower} `) ||
           o.name.toLowerCase().includes(`${lower}(`),
  );

  if (partialMatch && !isLifestageOption(partialMatch.name)) {
    return {
      pct: partialMatch.investment_fee_pct ?? deriveInvestmentFee(partialMatch, adminFeePct),
      optionName: partialMatch.name,
    };
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
    return {
      pct: cohort.investment_fee_pct ?? deriveInvestmentFee(cohort, adminFeePct),
      optionName: cohort.name,
    };
  }

  if (partialMatch) {
    return {
      pct: partialMatch.investment_fee_pct ?? deriveInvestmentFee(partialMatch, adminFeePct),
      optionName: partialMatch.name,
    };
  }

  throw new Error(`Investment option "${optionName}" not found`);
}

/**
 * When no explicit investment option is requested, auto-detect Lifestage
 * funds and resolve the correct cohort based on birthYear. Returns null
 * if the fund doesn't have Lifestage options or no cohort matches.
 */
function autoResolveLifestageOption(
  options: InvestmentOption[],
  adminFeePct: number,
  birthYear: number,
): ResolvedOption | null {
  const lifestageOptions = options.filter((o) => isLifestageOption(o.name));
  if (lifestageOptions.length === 0) return null;

  const cohort = lifestageOptions.find((o) => matchesBirthYear(o.name, birthYear));
  if (!cohort) return null;

  return {
    pct: cohort.investment_fee_pct ?? deriveInvestmentFee(cohort, adminFeePct),
    optionName: cohort.name,
  };
}

function deriveInvestmentFee(option: InvestmentOption, adminFeePct: number): number {
  if (option.total_fee_pct != null) {
    return Math.max(option.total_fee_pct - adminFeePct, 0);
  }
  return 0;
}

// ── Formatting helpers (local — avoids coupling to canvas layer) ──────────

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(pctPoints: number): string {
  return `${pctPoints.toFixed(2).replace(/\.?0+$/, '')}%`;
}

// ── Fee Decomposition (single source of truth for all fee math) ──────────

/**
 * Break a FeeStructure into labelled components with dollar amounts and
 * human-readable basis strings.  Every percentage field is stored as
 * percentage points (e.g. 0.67 = 0.67%) and divided by 100 here — this
 * is the ONLY place that conversion happens.
 *
 * Returns both the components and the resolved investment option name.
 * The option name and fee rate are always resolved in the same call so
 * they cannot drift — the label and the number refer to the same cohort.
 *
 * Both calculateAnnualFee (chat totals) and the FeeBreakdownChart (canvas)
 * derive their numbers from this function.
 */
export function decomposeFeeComponents(
  feeStructure: FeeStructure,
  balance: number,
  investmentOption?: string,
  birthYear?: number,
): FeeDecomposition {
  const components: FeeComponentCalc[] = [];
  let resolvedOptionName: string | undefined;

  // 1. Fixed admin fee
  const adminFeePA = feeStructure.admin_fee_pa ?? 0;
  if (adminFeePA > 0) {
    components.push({
      label: 'Administration Fee',
      annual_dollar: adminFeePA,
      basis: `$${adminFeePA} flat`,
      type: 'flat',
    });
  }

  // 2. Percentage-based admin fee — tiered takes precedence over flat
  if (feeStructure.admin_fee_tiers?.length) {
    let tieredTotal = 0;
    for (const tier of feeStructure.admin_fee_tiers) {
      if (balance <= tier.balance_from) break;
      const ceiling = tier.balance_to ?? Infinity;
      const applicable = Math.min(balance, ceiling) - tier.balance_from;
      tieredTotal += (tier.rate_pct / 100) * applicable;
    }
    if (tieredTotal > 0) {
      components.push({
        label: 'Administration Fee (tiered)',
        annual_dollar: tieredTotal,
        basis: `Tiered rate on ${fmtCurrency(balance)}`,
        type: 'percentage',
      });
    }
  } else if (feeStructure.admin_fee_pct != null && feeStructure.admin_fee_pct > 0) {
    let dollar = (feeStructure.admin_fee_pct / 100) * balance;
    let basisStr = `${fmtPct(feeStructure.admin_fee_pct)} × ${fmtCurrency(balance)}`;
    if (feeStructure.admin_fee_cap_pa != null && dollar > feeStructure.admin_fee_cap_pa) {
      basisStr += ` → capped at ${fmtCurrency(feeStructure.admin_fee_cap_pa)}`;
      dollar = feeStructure.admin_fee_cap_pa;
    }
    components.push({
      label: 'Administration Fee (%)',
      annual_dollar: dollar,
      basis: basisStr,
      type: 'percentage',
    });
  }

  // 3. Investment fee — explicit option > Lifestage auto-resolve > default
  let investmentFeePct = feeStructure.investment_fee_default_pct;

  if (investmentOption && feeStructure.investment_options?.length) {
    const resolved = resolveInvestmentOption(
      feeStructure.investment_options,
      investmentOption,
      feeStructure.admin_fee_pct ?? 0,
      birthYear,
    );
    investmentFeePct = resolved.pct;
    resolvedOptionName = resolved.optionName;
  } else if (birthYear != null && feeStructure.investment_options?.length) {
    const autoResolved = autoResolveLifestageOption(
      feeStructure.investment_options,
      feeStructure.admin_fee_pct ?? 0,
      birthYear,
    );
    if (autoResolved) {
      investmentFeePct = autoResolved.pct;
      resolvedOptionName = autoResolved.optionName;
    }
  }

  if (investmentFeePct != null && investmentFeePct > 0) {
    const dollar = (investmentFeePct / 100) * balance;
    components.push({
      label: 'Investment Fee',
      annual_dollar: dollar,
      basis: `${fmtPct(investmentFeePct)} × ${fmtCurrency(balance)}`,
      type: 'percentage',
    });
  }

  // 4. Member fee (monthly → annual)
  if (feeStructure.member_fee_monthly != null && feeStructure.member_fee_monthly > 0) {
    const annual = feeStructure.member_fee_monthly * 12;
    components.push({
      label: 'Member Fee',
      annual_dollar: annual,
      basis: `$${feeStructure.member_fee_monthly}/mo × 12`,
      type: 'flat',
    });
  }

  // 5. Advice fee
  if (feeStructure.advice_fee_pct != null && feeStructure.advice_fee_pct > 0) {
    const dollar = (feeStructure.advice_fee_pct / 100) * balance;
    components.push({
      label: 'Advice Fee',
      annual_dollar: dollar,
      basis: `${fmtPct(feeStructure.advice_fee_pct)} × ${fmtCurrency(balance)}`,
      type: 'percentage',
    });
  }

  // 6. Indirect Cost Ratio / ORFR
  const icrPct = feeStructure.indirect_cost_ratio ?? feeStructure.orfr_pct;
  if (icrPct != null && icrPct > 0) {
    const dollar = (icrPct / 100) * balance;
    components.push({
      label: 'Indirect Cost Ratio',
      annual_dollar: dollar,
      basis: `${fmtPct(icrPct)} × ${fmtCurrency(balance)}`,
      type: 'percentage',
    });
  }

  return {
    components: components.filter((c) => c.annual_dollar > 0),
    resolvedOptionName,
  };
}

/**
 * Total annual dollar fee at a given balance.
 *
 * Delegates to decomposeFeeComponents so the chat total and chart total
 * are mathematically identical — they are the same code path.
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
  const { components } = decomposeFeeComponents(feeStructure, balance, investmentOption, birthYear);
  const total = components.reduce((sum, c) => sum + c.annual_dollar, 0);
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

export interface EngineFeeParams {
  flat: number;
  percent: number;
}

/**
 * Convert a full FeeStructure into the engine's simplified two-param format
 * (admin_fee_flat in dollars p.a., admin_fee_percent as a decimal e.g. 0.007).
 *
 * Delegates to decomposeFeeComponents so the resolution cascade is reused:
 *   1. Explicit investmentOption → resolveInvestmentOption
 *   2. No option + birthYear + Lifestage fund → autoResolveLifestageOption
 *   3. Otherwise → investment_fee_default_pct
 *
 * When is_default_investment is true, pass undefined for investmentOption.
 */
export function convertToEngineFees(
  feeStructure: FeeStructure,
  balance: number,
  investmentOption?: string,
  birthYear?: number,
): EngineFeeParams {
  const { components } = decomposeFeeComponents(
    feeStructure, balance, investmentOption, birthYear,
  );

  let flat = 0;
  let percentDollars = 0;

  for (const c of components) {
    if (c.type === 'flat') {
      flat += c.annual_dollar;
    } else {
      percentDollars += c.annual_dollar;
    }
  }

  const percent = balance > 0 ? percentDollars / balance : 0;

  return { flat, percent };
}
