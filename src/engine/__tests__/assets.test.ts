/**
 * Assets Module Tests
 *
 * Validates monthly asset performance calculations including growth,
 * income attribution, lifestyle depreciation, franking credits,
 * Centrelink assessability, net equity, drawdown, and disposal.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAssetMonth,
  growAsset,
  getOwnershipSplits,
  isFinancialAsset,
  calculateCentrelinkAssetValue,
  calculateNetEquity,
  applyDrawdown,
  disposeAsset,
} from '../assets';
import type { Asset, Liability } from '../models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    asset_class: overrides.asset_class ?? 'cash',
    current_value: overrides.current_value ?? 0,
    cost_base: overrides.cost_base ?? 0,
    ownership_type: overrides.ownership_type ?? 'individual',
    owner_id: overrides.owner_id ?? null,
    ownership_split: overrides.ownership_split ?? {},
    growth_rate: overrides.growth_rate ?? 0,
    income_yield: overrides.income_yield ?? 0,
    franking_rate: overrides.franking_rate ?? 0,
    expense_ratio: overrides.expense_ratio ?? 0,
    is_centrelink_assessable: overrides.is_centrelink_assessable ?? true,
    is_deemed: overrides.is_deemed ?? true,
    is_primary_residence: overrides.is_primary_residence ?? false,
    funded_by_liability_id: overrides.funded_by_liability_id ?? null,
    is_lifestyle_asset: overrides.is_lifestyle_asset ?? false,
    depreciation_rate: overrides.depreciation_rate ?? 0,
  };
}

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

function simulateMonths(asset: Asset, months: number): Asset {
  let current = { ...asset };
  for (let i = 0; i < months; i++) {
    const result = calculateAssetMonth(current);
    current = growAsset(current, result);
  }
  return current;
}

// ── Capital Growth (Compound Monthly) ────────────────────────────────────────

describe('calculateAssetMonth — capital growth', () => {
  it('compounds monthly: $100k at 7% for 12 months → ~$107,229', () => {
    const asset = makeAsset({
      id: 'shares_1',
      asset_class: 'australian_shares',
      current_value: 100_000,
      growth_rate: 0.07,
    });

    const final = simulateMonths(asset, 12);

    const expected = 100_000 * Math.pow(1 + 0.07 / 12, 12);
    expect(final.current_value).toBeCloseTo(expected, 2);
    expect(final.current_value).toBeCloseTo(107_229, 0);
  });

  it('applies net growth rate after expense ratio', () => {
    const asset = makeAsset({
      id: 'managed_fund',
      asset_class: 'mixed_balanced',
      current_value: 100_000,
      growth_rate: 0.07,
      expense_ratio: 0.01,
    });

    const result = calculateAssetMonth(asset);

    const expectedMonthlyGrowth = 100_000 * (0.07 - 0.01) / 12;
    expect(result.capitalGrowth).toBeCloseTo(expectedMonthlyGrowth, 2);
    expect(result.expensesDeducted).toBeCloseTo(100_000 * 0.01 / 12, 2);
  });

  it('returns zero growth for zero-value asset', () => {
    const asset = makeAsset({
      id: 'empty',
      current_value: 0,
      growth_rate: 0.07,
    });

    const result = calculateAssetMonth(asset);

    expect(result.capitalGrowth).toBe(0);
    expect(result.closingValue).toBe(0);
  });

  it('tracks cost base upward with growth', () => {
    const asset = makeAsset({
      id: 'shares_1',
      current_value: 100_000,
      cost_base: 80_000,
      growth_rate: 0.07,
    });

    const result = calculateAssetMonth(asset);
    const updated = growAsset(asset, result);

    expect(updated.cost_base).toBeGreaterThan(80_000);
    expect(updated.cost_base).toBeCloseTo(80_000 + result.capitalGrowth, 2);
  });
});

// ── Income & Franking ────────────────────────────────────────────────────────

describe('calculateAssetMonth — income and franking', () => {
  it('generates monthly income from annual yield', () => {
    const asset = makeAsset({
      id: 'shares_1',
      asset_class: 'australian_shares',
      current_value: 100_000,
      income_yield: 0.04,
      owner_id: 'person_1',
    });

    const result = calculateAssetMonth(asset);

    expect(result.incomeGenerated).toBeCloseTo(100_000 * 0.04 / 12, 2);
    expect(result.incomeGenerated).toBeCloseTo(333.33, 0);
  });

  it('calculates franking credits on Australian shares', () => {
    const asset = makeAsset({
      id: 'aus_shares',
      asset_class: 'australian_shares',
      current_value: 100_000,
      income_yield: 0.04,
      franking_rate: 0.80,
      owner_id: 'person_1',
    });

    const result = calculateAssetMonth(asset);
    const monthlyIncome = 100_000 * 0.04 / 12;
    const frankedPortion = monthlyIncome * 0.80;
    const expectedFranking = (frankedPortion * 0.30) / (1 - 0.30);

    expect(result.frankingCredits).toBeCloseTo(expectedFranking, 2);
    expect(result.frankingCredits).toBeGreaterThan(0);
  });

  it('produces zero franking when franking_rate is 0', () => {
    const asset = makeAsset({
      id: 'intl_shares',
      asset_class: 'international_shares',
      current_value: 100_000,
      income_yield: 0.03,
      franking_rate: 0,
      owner_id: 'person_1',
    });

    const result = calculateAssetMonth(asset);

    expect(result.frankingCredits).toBe(0);
    expect(result.incomeGenerated).toBeGreaterThan(0);
  });

  it('produces no income when yield is 0', () => {
    const asset = makeAsset({
      id: 'growth_only',
      current_value: 100_000,
      growth_rate: 0.07,
      income_yield: 0,
      owner_id: 'person_1',
    });

    const result = calculateAssetMonth(asset);

    expect(result.incomeGenerated).toBe(0);
    expect(result.frankingCredits).toBe(0);
  });
});

// ── Ownership Splits & Income Attribution ────────────────────────────────────

describe('ownership splits and income attribution', () => {
  it('attributes 100% to sole owner', () => {
    const asset = makeAsset({
      id: 'sole',
      current_value: 100_000,
      income_yield: 0.04,
      owner_id: 'person_1',
    });

    const result = calculateAssetMonth(asset);

    expect(result.incomeByPerson['person_1']).toBeCloseTo(result.incomeGenerated, 2);
  });

  it('attributes income correctly for 60/40 joint split', () => {
    const asset = makeAsset({
      id: 'joint_shares',
      asset_class: 'australian_shares',
      current_value: 200_000,
      income_yield: 0.05,
      franking_rate: 0.70,
      ownership_type: 'joint',
      ownership_split: { person_1: 0.60, person_2: 0.40 },
    });

    const result = calculateAssetMonth(asset);
    const monthlyIncome = 200_000 * 0.05 / 12;

    expect(result.incomeGenerated).toBeCloseTo(monthlyIncome, 2);
    expect(result.incomeByPerson['person_1']).toBeCloseTo(monthlyIncome * 0.60, 2);
    expect(result.incomeByPerson['person_2']).toBeCloseTo(monthlyIncome * 0.40, 2);

    expect(result.frankingByPerson['person_1']).toBeCloseTo(
      result.frankingCredits * 0.60,
      2,
    );
    expect(result.frankingByPerson['person_2']).toBeCloseTo(
      result.frankingCredits * 0.40,
      2,
    );
  });

  it('returns empty splits when no owner is set', () => {
    const asset = makeAsset({ id: 'orphan', current_value: 50_000 });
    const splits = getOwnershipSplits(asset);
    expect(Object.keys(splits)).toHaveLength(0);
  });
});

// ── Lifestyle Asset Depreciation ─────────────────────────────────────────────

describe('lifestyle asset depreciation', () => {
  it('depreciates: $50k car at 15% for 12 months (diminishing value)', () => {
    const car = makeAsset({
      id: 'car_1',
      asset_class: 'other',
      current_value: 50_000,
      is_lifestyle_asset: true,
      depreciation_rate: 0.15,
    });

    const final = simulateMonths(car, 12);

    const expected = 50_000 * Math.pow(1 - 0.15 / 12, 12);
    expect(final.current_value).toBeCloseTo(expected, 2);
    expect(final.current_value).toBeLessThan(43_100);
    expect(final.current_value).toBeGreaterThan(42_500);
  });

  it('does not add growth when lifestyle asset depreciates', () => {
    const boat = makeAsset({
      id: 'boat_1',
      asset_class: 'other',
      current_value: 80_000,
      growth_rate: 0.05, // should be ignored
      is_lifestyle_asset: true,
      depreciation_rate: 0.20,
    });

    const result = calculateAssetMonth(boat);

    expect(result.capitalGrowth).toBeLessThan(0);
    expect(result.capitalGrowth).toBeCloseTo(-(80_000 * 0.20 / 12), 2);
  });

  it('does not increase cost base for depreciating assets', () => {
    const car = makeAsset({
      id: 'car_1',
      current_value: 50_000,
      cost_base: 50_000,
      is_lifestyle_asset: true,
      depreciation_rate: 0.15,
    });

    const result = calculateAssetMonth(car);
    const updated = growAsset(car, result);

    expect(updated.cost_base).toBe(50_000);
  });
});

// ── Net Equity (Asset-Liability Linking) ─────────────────────────────────────

describe('calculateNetEquity', () => {
  it('$800k property with $400k linked mortgage = $400k equity', () => {
    const property = makeAsset({
      id: 'home_1',
      asset_class: 'property_home',
      current_value: 800_000,
      funded_by_liability_id: 'mortgage_1',
    });

    const liabilities = [
      makeLiability({
        id: 'mortgage_1',
        current_balance: 400_000,
        secured_by_asset_id: 'home_1',
      }),
    ];

    const equity = calculateNetEquity(property, liabilities);
    expect(equity).toBe(400_000);
  });

  it('returns full value when no linked liability', () => {
    const shares = makeAsset({
      id: 'shares_1',
      current_value: 150_000,
    });

    const equity = calculateNetEquity(shares, []);
    expect(equity).toBe(150_000);
  });

  it('returns negative equity when liability exceeds asset value', () => {
    const property = makeAsset({
      id: 'investment',
      current_value: 500_000,
      funded_by_liability_id: 'loan_1',
    });

    const liabilities = [
      makeLiability({ id: 'loan_1', current_balance: 600_000 }),
    ];

    expect(calculateNetEquity(property, liabilities)).toBe(-100_000);
  });
});

// ── Centrelink Assessability ─────────────────────────────────────────────────

describe('calculateCentrelinkAssetValue', () => {
  it('classifies financial and non-financial assets correctly', () => {
    const assets = [
      makeAsset({
        id: 'cash',
        asset_class: 'cash',
        current_value: 50_000,
        is_deemed: true,
      }),
      makeAsset({
        id: 'shares',
        asset_class: 'australian_shares',
        current_value: 200_000,
        is_deemed: true,
      }),
      makeAsset({
        id: 'rental',
        asset_class: 'property_investment',
        current_value: 500_000,
        is_deemed: false,
      }),
    ];

    const { financial, nonFinancial } = calculateCentrelinkAssetValue(assets);

    expect(financial).toBe(250_000);
    expect(nonFinancial).toBe(500_000);
  });

  it('excludes primary residence', () => {
    const assets = [
      makeAsset({
        id: 'home',
        asset_class: 'property_home',
        current_value: 1_200_000,
        is_primary_residence: true,
      }),
      makeAsset({
        id: 'cash',
        asset_class: 'cash',
        current_value: 30_000,
        is_deemed: true,
      }),
    ];

    const { financial, nonFinancial } = calculateCentrelinkAssetValue(assets);

    expect(financial).toBe(30_000);
    expect(nonFinancial).toBe(0);
  });

  it('excludes non-assessable assets', () => {
    const assets = [
      makeAsset({
        id: 'exempt',
        current_value: 100_000,
        is_centrelink_assessable: false,
      }),
    ];

    const { financial, nonFinancial } = calculateCentrelinkAssetValue(assets);

    expect(financial).toBe(0);
    expect(nonFinancial).toBe(0);
  });
});

// ── isFinancialAsset ─────────────────────────────────────────────────────────

describe('isFinancialAsset', () => {
  it('returns true for deemed cash', () => {
    expect(isFinancialAsset(makeAsset({ id: '1', asset_class: 'cash', is_deemed: true }))).toBe(true);
  });

  it('returns true for deemed Australian shares', () => {
    expect(isFinancialAsset(makeAsset({ id: '1', asset_class: 'australian_shares', is_deemed: true }))).toBe(true);
  });

  it('returns false for property (non-financial)', () => {
    expect(isFinancialAsset(makeAsset({ id: '1', asset_class: 'property_investment', is_deemed: false }))).toBe(false);
  });

  it('returns false when is_deemed is false even for cash', () => {
    expect(isFinancialAsset(makeAsset({ id: '1', asset_class: 'cash', is_deemed: false }))).toBe(false);
  });
});

// ── Drawdown ─────────────────────────────────────────────────────────────────

describe('applyDrawdown', () => {
  it('draws the requested amount when sufficient balance', () => {
    const asset = makeAsset({ id: 'cash', current_value: 50_000 });
    const { asset: updated, actualAmount } = applyDrawdown(asset, 10_000);

    expect(actualAmount).toBe(10_000);
    expect(updated.current_value).toBe(40_000);
  });

  it('caps drawdown at current value', () => {
    const asset = makeAsset({ id: 'cash', current_value: 5_000 });
    const { asset: updated, actualAmount } = applyDrawdown(asset, 10_000);

    expect(actualAmount).toBe(5_000);
    expect(updated.current_value).toBe(0);
  });

  it('does not mutate the original asset', () => {
    const asset = makeAsset({ id: 'cash', current_value: 50_000 });
    applyDrawdown(asset, 10_000);
    expect(asset.current_value).toBe(50_000);
  });
});

// ── Asset Disposal ───────────────────────────────────────────────────────────

describe('disposeAsset', () => {
  it('repays linked liability from sale proceeds', () => {
    const property = makeAsset({
      id: 'investment',
      current_value: 600_000,
      funded_by_liability_id: 'loan_1',
    });

    const liabilities = [
      makeLiability({ id: 'loan_1', current_balance: 200_000 }),
    ];

    const { saleProceeds, netProceeds, updatedLiability } = disposeAsset(
      property,
      liabilities,
    );

    expect(saleProceeds).toBe(600_000);
    expect(netProceeds).toBe(400_000);
    expect(updatedLiability).not.toBeNull();
    expect(updatedLiability!.current_balance).toBe(0);
  });

  it('handles partial repayment when sale < liability', () => {
    const property = makeAsset({
      id: 'underwater',
      current_value: 300_000,
      funded_by_liability_id: 'loan_1',
    });

    const liabilities = [
      makeLiability({ id: 'loan_1', current_balance: 500_000 }),
    ];

    const { saleProceeds, netProceeds, updatedLiability } = disposeAsset(
      property,
      liabilities,
    );

    expect(saleProceeds).toBe(300_000);
    expect(netProceeds).toBe(0);
    expect(updatedLiability!.current_balance).toBe(200_000);
  });

  it('returns full proceeds when no linked liability', () => {
    const shares = makeAsset({
      id: 'shares',
      current_value: 100_000,
    });

    const { saleProceeds, netProceeds, updatedLiability } = disposeAsset(shares, []);

    expect(saleProceeds).toBe(100_000);
    expect(netProceeds).toBe(100_000);
    expect(updatedLiability).toBeNull();
  });
});
