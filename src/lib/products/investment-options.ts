/**
 * Centralised Investment Option Module
 *
 * Single source of truth for investment option types, default/MySuper
 * detection, and growth-profile matching across funds.
 *
 * All consumers (fee-calculator, orchestrator, scenario-builder, canvas)
 * import from this module rather than defining their own option types.
 */

// ── Canonical Type ───────────────────────────────────────────────────────────

export interface InvestmentOption {
  name: string;
  investment_fee_pct?: number;
  total_fee_pct?: number;
  description?: string;
  /** Percentage of growth assets, e.g. 70 = 70% growth / 30% defensive */
  growth_pct?: number;
  /** True for the fund's MySuper / default option */
  is_default?: boolean;
}

// ── Default Option Detection ─────────────────────────────────────────────────

/**
 * Whether the fund has a designated default (MySuper) investment option.
 * Wrap platforms and funds without a flagged default return false.
 */
export function hasDefaultOption(options: InvestmentOption[]): boolean {
  return options.some((o) => o.is_default === true);
}

/**
 * Return the fund's default (MySuper) investment option, or undefined if
 * no option is flagged as default.
 */
export function findDefaultOption(
  options: InvestmentOption[],
): InvestmentOption | undefined {
  return options.find((o) => o.is_default === true);
}

// ── Growth-Profile Matching ──────────────────────────────────────────────────

/**
 * Effective investment fee for an option, accounting for both
 * `investment_fee_pct` and `total_fee_pct` (minus admin component).
 */
function effectiveFee(option: InvestmentOption, adminFeePct: number): number {
  if (option.investment_fee_pct != null) return option.investment_fee_pct;
  if (option.total_fee_pct != null) return Math.max(option.total_fee_pct - adminFeePct, 0);
  return Infinity;
}

/**
 * Find the investment option whose growth allocation is closest to
 * `targetGrowthPct`. When multiple options tie on growth distance,
 * the one with the lowest effective fee wins.
 *
 * Only considers options that have `growth_pct` defined.
 * `adminFeePct` is the fund-level admin fee in percentage points
 * (used to derive investment fee from `total_fee_pct` when needed).
 */
export function findClosestOption(
  options: InvestmentOption[],
  targetGrowthPct: number,
  adminFeePct: number = 0,
): InvestmentOption | undefined {
  const candidates = options.filter((o) => o.growth_pct != null);
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    const distA = Math.abs(a.growth_pct! - targetGrowthPct);
    const distB = Math.abs(b.growth_pct! - targetGrowthPct);
    if (distA !== distB) return distA - distB;
    return effectiveFee(a, adminFeePct) - effectiveFee(b, adminFeePct);
  });

  return candidates[0];
}

/**
 * Resolve the growth_pct for the user's current investment option.
 *
 * When the user is in the default option, returns the default option's
 * growth_pct. When a named option is provided, returns its growth_pct.
 * Falls back to 70 (balanced) when the option cannot be resolved.
 */
export function resolveOptionGrowthPct(
  options: InvestmentOption[],
  optionName: string | undefined,
  isDefault: boolean,
): number {
  const DEFAULT_GROWTH_PCT = 70;

  if (isDefault) {
    const def = findDefaultOption(options);
    return def?.growth_pct ?? DEFAULT_GROWTH_PCT;
  }

  if (optionName) {
    const lower = optionName.toLowerCase();
    const match = options.find((o) => o.name.toLowerCase() === lower)
      ?? options.find((o) => o.name.toLowerCase().includes(lower));
    return match?.growth_pct ?? DEFAULT_GROWTH_PCT;
  }

  return DEFAULT_GROWTH_PCT;
}
