/**
 * Australian Capital Gains Tax Tests
 *
 * Covers CGT discount eligibility, primary residence exemption,
 * capital loss carry-forward, and disposal proceeds netting.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCapitalGain,
  applyCapitalLosses,
  calculateDisposalProceeds,
} from '../cgt';
import type { Asset, Liability } from '../models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    asset_class: overrides.asset_class ?? 'property_investment',
    current_value: overrides.current_value ?? 0,
    cost_base: overrides.cost_base ?? 0,
    ownership_type: overrides.ownership_type ?? 'individual',
    owner_id: overrides.owner_id ?? 'person_1',
    ownership_split: overrides.ownership_split ?? {},
    growth_rate: overrides.growth_rate ?? 0,
    income_yield: overrides.income_yield ?? 0,
    franking_rate: overrides.franking_rate ?? 0,
    expense_ratio: overrides.expense_ratio ?? 0,
    is_centrelink_assessable: overrides.is_centrelink_assessable ?? true,
    is_deemed: overrides.is_deemed ?? false,
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
    liability_type: overrides.liability_type ?? 'investment_loan',
    current_balance: overrides.current_balance ?? 0,
    interest_rate: overrides.interest_rate ?? 0.06,
    repayment_type: overrides.repayment_type ?? 'principal_and_interest',
    annual_repayment: overrides.annual_repayment ?? null,
    remaining_term_years: overrides.remaining_term_years ?? 25,
    owner_id: overrides.owner_id ?? 'person_1',
    linked_asset_id: overrides.linked_asset_id ?? null,
    is_tax_deductible: overrides.is_tax_deductible ?? false,
    deductible_person_id: overrides.deductible_person_id ?? null,
    interest_only_remaining_years: overrides.interest_only_remaining_years ?? 0,
    secured_by_asset_id: overrides.secured_by_asset_id ?? null,
    offset_account_balance: overrides.offset_account_balance ?? 0,
  };
}

// ── calculateCapitalGain ─────────────────────────────────────────────────────

describe('calculateCapitalGain', () => {
  it('calculates gross gain and applies 50% discount when held > 12 months', () => {
    const result = calculateCapitalGain(350_000, 200_000, 24, false);

    expect(result.grossGain).toBe(150_000);
    expect(result.discountApplied).toBe(true);
    expect(result.netCapitalGain).toBe(75_000);
    expect(result.isExempt).toBe(false);
  });

  it('does not apply discount when held <= 12 months', () => {
    const result = calculateCapitalGain(350_000, 200_000, 6, false);

    expect(result.grossGain).toBe(150_000);
    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(150_000);
    expect(result.isExempt).toBe(false);
  });

  it('does not apply discount at exactly 12 months', () => {
    const result = calculateCapitalGain(350_000, 200_000, 12, false);

    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(150_000);
  });

  it('returns zero gain for primary residence regardless of profit', () => {
    const result = calculateCapitalGain(800_000, 400_000, 120, true);

    expect(result.grossGain).toBe(0);
    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(0);
    expect(result.isExempt).toBe(true);
  });

  it('does not apply discount for companies', () => {
    const result = calculateCapitalGain(350_000, 200_000, 24, false, 'company');

    expect(result.grossGain).toBe(150_000);
    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(150_000);
  });

  it('does not apply discount for super funds in accumulation', () => {
    const result = calculateCapitalGain(350_000, 200_000, 24, false, 'super_accumulation');

    expect(result.grossGain).toBe(150_000);
    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(150_000);
  });

  it('returns zero gain when disposal proceeds equal cost base', () => {
    const result = calculateCapitalGain(200_000, 200_000, 24, false);

    expect(result.grossGain).toBe(0);
    expect(result.discountApplied).toBe(false);
    expect(result.netCapitalGain).toBe(0);
  });

  it('treats a capital loss as zero gain (losses tracked separately)', () => {
    const result = calculateCapitalGain(150_000, 200_000, 24, false);

    expect(result.grossGain).toBe(0);
    expect(result.netCapitalGain).toBe(0);
  });
});

// ── applyCapitalLosses ───────────────────────────────────────────────────────

describe('applyCapitalLosses', () => {
  it('offsets $30k losses against $100k gain leaving $70k taxable', () => {
    const result = applyCapitalLosses(100_000, 30_000);

    expect(result.taxableGain).toBe(70_000);
    expect(result.remainingLosses).toBe(0);
  });

  it('offsets $50k losses against $20k gain, carrying $30k forward', () => {
    const result = applyCapitalLosses(20_000, 50_000);

    expect(result.taxableGain).toBe(0);
    expect(result.remainingLosses).toBe(30_000);
  });

  it('returns full gain when no carried losses', () => {
    const result = applyCapitalLosses(75_000, 0);

    expect(result.taxableGain).toBe(75_000);
    expect(result.remainingLosses).toBe(0);
  });

  it('preserves all losses when gain is zero', () => {
    const result = applyCapitalLosses(0, 40_000);

    expect(result.taxableGain).toBe(0);
    expect(result.remainingLosses).toBe(40_000);
  });

  it('exactly offsets when losses equal gain', () => {
    const result = applyCapitalLosses(50_000, 50_000);

    expect(result.taxableGain).toBe(0);
    expect(result.remainingLosses).toBe(0);
  });
});

// ── calculateDisposalProceeds ────────────────────────────────────────────────

describe('calculateDisposalProceeds', () => {
  it('reduces proceeds by linked mortgage balance', () => {
    const asset = makeAsset({ id: 'prop_1', current_value: 500_000 });
    const mortgage = makeLiability({ id: 'loan_1', current_balance: 300_000 });

    const result = calculateDisposalProceeds(asset, mortgage);

    expect(result.grossProceeds).toBe(500_000);
    expect(result.liabilityRepayment).toBe(300_000);
    expect(result.netProceeds).toBe(200_000);
  });

  it('returns full proceeds when no linked liability', () => {
    const asset = makeAsset({ id: 'prop_2', current_value: 400_000 });

    const result = calculateDisposalProceeds(asset, null);

    expect(result.grossProceeds).toBe(400_000);
    expect(result.liabilityRepayment).toBe(0);
    expect(result.netProceeds).toBe(400_000);
  });

  it('caps repayment at sale proceeds when liability exceeds value', () => {
    const asset = makeAsset({ id: 'prop_3', current_value: 200_000 });
    const mortgage = makeLiability({ id: 'loan_2', current_balance: 350_000 });

    const result = calculateDisposalProceeds(asset, mortgage);

    expect(result.grossProceeds).toBe(200_000);
    expect(result.liabilityRepayment).toBe(200_000);
    expect(result.netProceeds).toBe(0);
  });

  it('handles zero-value asset disposal', () => {
    const asset = makeAsset({ id: 'prop_4', current_value: 0 });
    const mortgage = makeLiability({ id: 'loan_3', current_balance: 100_000 });

    const result = calculateDisposalProceeds(asset, mortgage);

    expect(result.grossProceeds).toBe(0);
    expect(result.liabilityRepayment).toBe(0);
    expect(result.netProceeds).toBe(0);
  });
});
