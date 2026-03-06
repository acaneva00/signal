/**
 * Assets Module
 *
 * Monthly asset performance calculations including:
 * - Capital growth (compound monthly, nominal rate / 12)
 * - Income generation (dividends, rent, interest)
 * - Franking credits on Australian shares
 * - Ownership splits (individual and joint)
 * - Centrelink assessability (financial vs non-financial)
 * - Lifestyle asset depreciation (diminishing value monthly)
 * - Net equity calculation with linked liabilities
 * - Asset disposal with automatic liability repayment
 *
 * All functions are pure — no side effects.
 */

import type { Asset, AssetClass, Liability } from './models';

// ── Constants ────────────────────────────────────────────────────────────────

const CORPORATE_TAX_RATE = 0.30;

const FINANCIAL_ASSET_CLASSES: AssetClass[] = [
  'cash',
  'australian_shares',
  'international_shares',
  'fixed_interest',
  'mixed_balanced',
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface AssetMonthResult {
  assetId: string;
  openingValue: number;
  capitalGrowth: number;
  incomeGenerated: number;
  frankingCredits: number;
  expensesDeducted: number;
  closingValue: number;

  incomeByPerson: Record<string, number>;
  frankingByPerson: Record<string, number>;
}

export interface DisposalResult {
  saleProceeds: number;
  netProceeds: number;
  updatedLiability: Liability | null;
}

// ── Ownership ────────────────────────────────────────────────────────────────

/**
 * Determine ownership percentages per person.
 *
 * Joint assets use the explicit split; individual assets attribute 100%
 * to the owner. Returns empty object if no owner is set.
 */
export function getOwnershipSplits(asset: Asset): Record<string, number> {
  if (asset.ownership_type === 'joint' && Object.keys(asset.ownership_split).length > 0) {
    return asset.ownership_split;
  }
  if (asset.owner_id) {
    return { [asset.owner_id]: 1.0 };
  }
  return {};
}

// ── Financial vs Non-Financial ───────────────────────────────────────────────

/**
 * Determine if an asset is a financial asset (subject to Centrelink deeming)
 * vs a non-financial asset (assessed at actual value for assets test).
 *
 * Financial: cash, shares, managed funds, bonds.
 * Non-financial: real property (investment), personal effects, vehicles.
 */
export function isFinancialAsset(asset: Asset): boolean {
  if (!asset.is_deemed) return false;
  return FINANCIAL_ASSET_CLASSES.includes(asset.asset_class);
}

// ── Monthly Calculation ──────────────────────────────────────────────────────

/**
 * Calculate one month of asset performance.
 *
 * - Lifestyle assets: depreciation applied (diminishing value, rate / 12)
 * - Growth assets: capital growth net of expense ratio, compound monthly
 * - Income: annual yield / 12 on opening value, distributed (not reinvested)
 * - Franking: corporate tax gross-up on franked portion of income
 * - Income and franking attributed by ownership split
 */
export function calculateAssetMonth(asset: Asset): AssetMonthResult {
  const result: AssetMonthResult = {
    assetId: asset.id,
    openingValue: asset.current_value,
    capitalGrowth: 0,
    incomeGenerated: 0,
    frankingCredits: 0,
    expensesDeducted: 0,
    closingValue: 0,
    incomeByPerson: {},
    frankingByPerson: {},
  };

  const value = asset.current_value;

  if (value <= 0) {
    result.closingValue = 0;
    return result;
  }

  // Monthly income on opening balance
  result.incomeGenerated = (value * asset.income_yield) / 12;

  // Franking credits (Australian imputation system)
  if (asset.franking_rate > 0 && result.incomeGenerated > 0) {
    const frankedPortion = result.incomeGenerated * asset.franking_rate;
    result.frankingCredits =
      (frankedPortion * CORPORATE_TAX_RATE) / (1 - CORPORATE_TAX_RATE);
  }

  // Capital growth or depreciation
  if (asset.is_lifestyle_asset && asset.depreciation_rate > 0) {
    const monthlyDepRate = asset.depreciation_rate / 12;
    result.capitalGrowth = -(value * monthlyDepRate);
  } else {
    const netGrowthRate = asset.growth_rate - asset.expense_ratio;
    const monthlyGrowth = netGrowthRate / 12;
    result.capitalGrowth = value * monthlyGrowth;
    result.expensesDeducted = (value * asset.expense_ratio) / 12;
  }

  // Closing value — income is distributed to cash, not reinvested
  result.closingValue = value + result.capitalGrowth;

  // Attribute income to owners
  const splits = getOwnershipSplits(asset);
  for (const [personId, pct] of Object.entries(splits)) {
    result.incomeByPerson[personId] = result.incomeGenerated * pct;
    result.frankingByPerson[personId] = result.frankingCredits * pct;
  }

  return result;
}

// ── Centrelink Asset Assessment ──────────────────────────────────────────────

/**
 * Calculate total assessable assets for Centrelink, split into financial
 * (subject to deeming) and non-financial categories.
 *
 * Excludes primary residence (exempt from assets test) and non-assessable assets.
 */
export function calculateCentrelinkAssetValue(
  assets: Asset[],
): { financial: number; nonFinancial: number } {
  let financial = 0;
  let nonFinancial = 0;

  for (const asset of assets) {
    if (asset.is_primary_residence) continue;
    if (!asset.is_centrelink_assessable) continue;

    if (isFinancialAsset(asset)) {
      financial += asset.current_value;
    } else {
      nonFinancial += asset.current_value;
    }
  }

  return { financial, nonFinancial };
}

// ── Net Equity (Asset-Liability Linking) ─────────────────────────────────────

/**
 * Calculate net equity for an asset by subtracting the linked liability balance.
 *
 * Uses `funded_by_liability_id` on the asset to find the matching liability.
 * If no linked liability exists, net equity equals the asset's current value.
 */
export function calculateNetEquity(
  asset: Asset,
  liabilities: Liability[],
): number {
  const linkedLiability = asset.funded_by_liability_id
    ? liabilities.find((l) => l.id === asset.funded_by_liability_id)
    : null;

  const liabilityBalance = linkedLiability?.current_balance ?? 0;
  return asset.current_value - liabilityBalance;
}

// ── Grow Asset ───────────────────────────────────────────────────────────────

/**
 * Return a copy of the asset with updated value after one month.
 * Cost base tracks upward growth only (for CGT calculations).
 */
export function growAsset(asset: Asset, result: AssetMonthResult): Asset {
  return {
    ...asset,
    current_value: result.closingValue,
    cost_base: asset.cost_base + Math.max(0, result.capitalGrowth),
  };
}

// ── Drawdown ─────────────────────────────────────────────────────────────────

/**
 * Draw down from an asset. Cannot draw more than current value.
 * Returns updated asset and the actual amount drawn.
 */
export function applyDrawdown(
  asset: Asset,
  amount: number,
): { asset: Asset; actualAmount: number } {
  const actual = Math.min(amount, asset.current_value);
  return {
    asset: {
      ...asset,
      current_value: asset.current_value - actual,
    },
    actualAmount: actual,
  };
}

// ── Asset Disposal ───────────────────────────────────────────────────────────

/**
 * Dispose of an asset and automatically repay the linked liability from
 * sale proceeds.
 *
 * Returns gross sale proceeds, net proceeds after liability repayment,
 * and the updated liability (if any). If sale proceeds don't fully cover
 * the liability, the remaining balance is preserved.
 */
export function disposeAsset(
  asset: Asset,
  liabilities: Liability[],
): DisposalResult {
  const saleProceeds = asset.current_value;

  const linkedLiability = asset.funded_by_liability_id
    ? liabilities.find((l) => l.id === asset.funded_by_liability_id)
    : null;

  let netProceeds = saleProceeds;
  let updatedLiability: Liability | null = null;

  if (linkedLiability) {
    const repaymentAmount = Math.min(saleProceeds, linkedLiability.current_balance);
    netProceeds = saleProceeds - repaymentAmount;
    updatedLiability = {
      ...linkedLiability,
      current_balance: linkedLiability.current_balance - repaymentAmount,
    };
  }

  return { saleProceeds, netProceeds, updatedLiability };
}
