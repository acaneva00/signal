/**
 * Surplus Allocation & Deficit Drawdown Tests (PRD 8.6)
 *
 * Validates configurable surplus distribution and deficit drawdown
 * priority logic including emergency buffer, avalanche/snowball debt
 * strategies, property disposal with CGT, and linked liability repayment.
 */

import { describe, it, expect } from 'vitest';
import {
  allocateSurplus,
  processDeficit,
  DEFAULT_SURPLUS_RULES,
  DEFAULT_DRAWDOWN_RULES,
} from '../allocation';
import type { Asset, Liability, SurplusRule, DrawdownRule } from '../models';

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

function makeLiability(
  overrides: Partial<Liability> & { id: string },
): Liability {
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

// ── Surplus Allocation ───────────────────────────────────────────────────────

describe('allocateSurplus', () => {
  it('fills emergency buffer before anything else ($5k target, $3k current → $2k to buffer)', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 3_000 }),
    ];
    const liabilities = [
      makeLiability({
        id: 'mortgage',
        interest_rate: 0.06,
        current_balance: 200_000,
      }),
    ];
    const rules: SurplusRule[] = [
      { type: 'emergency_buffer', target_amount: 5_000 },
      { type: 'extra_debt_repayment', strategy: 'avalanche' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, liabilities);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      action: 'add_to_buffer',
      target_id: 'savings',
      amount: 2_000,
    });
  });

  it('routes surplus to highest-interest debt when buffer is full (avalanche)', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 10_000 }),
    ];
    const liabilities = [
      makeLiability({
        id: 'personal_loan',
        liability_type: 'personal_loan',
        interest_rate: 0.12,
        current_balance: 5_000,
      }),
      makeLiability({
        id: 'mortgage',
        interest_rate: 0.06,
        current_balance: 300_000,
      }),
    ];
    const rules: SurplusRule[] = [
      { type: 'emergency_buffer', target_amount: 5_000 },
      { type: 'extra_debt_repayment', strategy: 'avalanche' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, liabilities);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      action: 'extra_debt_repayment',
      target_id: 'personal_loan',
      amount: 2_000,
    });
  });

  it('sends surplus to cash/savings when no debt exists', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 10_000 }),
    ];

    const actions = allocateSurplus(
      2_000,
      DEFAULT_SURPLUS_RULES,
      assets,
      [],
      2_000,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      action: 'remainder_to_cash',
      target_id: 'savings',
      amount: 2_000,
    });
  });

  it('partially fills buffer then allocates remainder to debt', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 4_000 }),
    ];
    const liabilities = [
      makeLiability({
        id: 'credit_card',
        liability_type: 'credit_card',
        interest_rate: 0.20,
        current_balance: 3_000,
      }),
    ];
    const rules: SurplusRule[] = [
      { type: 'emergency_buffer', target_amount: 5_000 },
      { type: 'extra_debt_repayment', strategy: 'avalanche' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, liabilities);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      action: 'add_to_buffer',
      target_id: 'savings',
      amount: 1_000,
    });
    expect(actions[1]).toEqual({
      action: 'extra_debt_repayment',
      target_id: 'credit_card',
      amount: 1_000,
    });
  });

  it('snowball strategy targets smallest balance first', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 20_000 }),
    ];
    const liabilities = [
      makeLiability({
        id: 'mortgage',
        interest_rate: 0.06,
        current_balance: 300_000,
      }),
      makeLiability({
        id: 'credit_card',
        liability_type: 'credit_card',
        interest_rate: 0.20,
        current_balance: 1_500,
      }),
    ];
    const rules: SurplusRule[] = [
      { type: 'extra_debt_repayment', strategy: 'snowball' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, liabilities);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      action: 'extra_debt_repayment',
      target_id: 'credit_card',
      amount: 1_500,
    });
    expect(actions[1]).toEqual({
      action: 'extra_debt_repayment',
      target_id: 'mortgage',
      amount: 500,
    });
  });

  it('uses 3× monthly expenses as default buffer target', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 0 }),
    ];
    const rules: SurplusRule[] = [{ type: 'emergency_buffer' }];

    const actions = allocateSurplus(5_000, rules, assets, [], 2_000);

    expect(actions).toHaveLength(1);
    expect(actions[0].amount).toBe(5_000);
  });

  it('allocates to super and investment when configured', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 20_000 }),
    ];
    const rules: SurplusRule[] = [
      { type: 'super_contribution', monthly_amount: 500 },
      { type: 'investment_contribution', monthly_amount: 300, target_asset_id: 'etf_portfolio' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, []);

    expect(actions).toHaveLength(3);
    expect(actions[0]).toEqual({
      action: 'super_contribution',
      target_id: 'super',
      amount: 500,
    });
    expect(actions[1]).toEqual({
      action: 'investment_contribution',
      target_id: 'etf_portfolio',
      amount: 300,
    });
    expect(actions[2]).toEqual({
      action: 'remainder_to_cash',
      target_id: 'savings',
      amount: 1_200,
    });
  });

  it('returns empty actions for zero surplus', () => {
    const actions = allocateSurplus(0, DEFAULT_SURPLUS_RULES, [], []);
    expect(actions).toHaveLength(0);
  });

  it('excludes HECS/HELP from extra debt repayment', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 20_000 }),
    ];
    const liabilities = [
      makeLiability({
        id: 'hecs',
        liability_type: 'hecs_help',
        interest_rate: 0,
        current_balance: 30_000,
      }),
    ];
    const rules: SurplusRule[] = [
      { type: 'extra_debt_repayment', strategy: 'avalanche' },
      { type: 'remainder_to_cash' },
    ];

    const actions = allocateSurplus(2_000, rules, assets, liabilities);

    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe('remainder_to_cash');
  });
});

// ── Deficit Drawdown ─────────────────────────────────────────────────────────

describe('processDeficit', () => {
  it('draws from cash first, then investments when cash is insufficient', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 1_000 }),
      makeAsset({
        id: 'shares',
        asset_class: 'australian_shares',
        current_value: 10_000,
        cost_base: 8_000,
      }),
    ];

    const result = processDeficit(
      3_000,
      DEFAULT_DRAWDOWN_RULES,
      assets,
      [],
    );

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({
      action: 'draw_cash',
      source_id: 'savings',
      amount: 1_000,
    });
    expect(result.actions[1]).toEqual({
      action: 'draw_shares',
      source_id: 'shares',
      amount: 2_000,
    });

    expect(result.cgt_events).toHaveLength(1);
    expect(result.cgt_events[0].asset_id).toBe('shares');
    expect(result.cgt_events[0].disposal_proceeds).toBe(2_000);
    expect(result.cgt_events[0].cost_base).toBeCloseTo(1_600);
    expect(result.cgt_events[0].gross_gain).toBeCloseTo(400);
    expect(result.cgt_events[0].net_gain).toBeCloseTo(200);
  });

  it('disposes property as last resort with CGT and linked liability repayment', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 500 }),
      makeAsset({
        id: 'rental',
        asset_class: 'property_investment',
        current_value: 500_000,
        cost_base: 350_000,
      }),
    ];
    const liabilities = [
      makeLiability({
        id: 'investment_loan',
        liability_type: 'investment_loan',
        current_balance: 200_000,
        linked_asset_id: 'rental',
      }),
    ];
    const rules: DrawdownRule[] = [
      { type: 'cash' },
      { type: 'property' },
    ];

    const result = processDeficit(100_000, rules, assets, liabilities);

    const cashDraw = result.actions.find((a) => a.action === 'draw_cash');
    expect(cashDraw).toEqual({
      action: 'draw_cash',
      source_id: 'savings',
      amount: 500,
    });

    const propertyDispose = result.actions.find(
      (a) => a.action === 'dispose_property',
    );
    expect(propertyDispose).toBeDefined();
    expect(propertyDispose!.source_id).toBe('rental');
    expect(propertyDispose!.amount).toBe(500_000);

    const liabilityRepay = result.actions.find(
      (a) => a.action === 'repay_linked_liability',
    );
    expect(liabilityRepay).toBeDefined();
    expect(liabilityRepay!.source_id).toBe('investment_loan');
    expect(liabilityRepay!.amount).toBe(200_000);

    expect(result.cgt_events).toHaveLength(1);
    expect(result.cgt_events[0]).toEqual({
      asset_id: 'rental',
      disposal_proceeds: 500_000,
      cost_base: 350_000,
      gross_gain: 150_000,
      net_gain: 75_000,
    });
  });

  it('skips super when preservation age not reached', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 500 }),
    ];
    const rules: DrawdownRule[] = [
      { type: 'cash' },
      { type: 'super' },
    ];

    const result = processDeficit(2_000, rules, assets, [], {
      superAccessible: false,
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].amount).toBe(500);
  });

  it('returns empty result for zero deficit', () => {
    const result = processDeficit(0, DEFAULT_DRAWDOWN_RULES, [], []);
    expect(result.actions).toHaveLength(0);
    expect(result.cgt_events).toHaveLength(0);
  });

  it('draws through multiple asset types in priority order', () => {
    const assets = [
      makeAsset({ id: 'savings', asset_class: 'cash', current_value: 1_000 }),
      makeAsset({
        id: 'bonds',
        asset_class: 'fixed_interest',
        current_value: 2_000,
      }),
      makeAsset({
        id: 'shares',
        asset_class: 'australian_shares',
        current_value: 5_000,
        cost_base: 5_000,
      }),
    ];

    const result = processDeficit(4_000, DEFAULT_DRAWDOWN_RULES, assets, []);

    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]).toEqual({
      action: 'draw_cash',
      source_id: 'savings',
      amount: 1_000,
    });
    expect(result.actions[1]).toEqual({
      action: 'draw_fixed_interest',
      source_id: 'bonds',
      amount: 2_000,
    });
    expect(result.actions[2]).toEqual({
      action: 'draw_shares',
      source_id: 'shares',
      amount: 1_000,
    });

    // No CGT when sold at cost base
    expect(result.cgt_events).toHaveLength(0);
  });

  it('property with no linked liability returns full proceeds', () => {
    const assets = [
      makeAsset({
        id: 'rental',
        asset_class: 'property_investment',
        current_value: 300_000,
        cost_base: 250_000,
      }),
    ];
    const rules: DrawdownRule[] = [{ type: 'property' }];

    const result = processDeficit(100_000, rules, assets, []);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({
      action: 'dispose_property',
      source_id: 'rental',
      amount: 300_000,
    });
    expect(result.cgt_events).toHaveLength(1);
    expect(result.cgt_events[0].gross_gain).toBe(50_000);
    expect(result.cgt_events[0].net_gain).toBe(25_000);
  });
});

// ── Default Rules ────────────────────────────────────────────────────────────

describe('default rules', () => {
  it('DEFAULT_SURPLUS_RULES matches spec: buffer → debt → cash', () => {
    expect(DEFAULT_SURPLUS_RULES).toEqual([
      { type: 'emergency_buffer' },
      { type: 'extra_debt_repayment', strategy: 'avalanche' },
      { type: 'remainder_to_cash' },
    ]);
  });

  it('DEFAULT_DRAWDOWN_RULES matches spec: cash → fixed → shares → super → property', () => {
    expect(DEFAULT_DRAWDOWN_RULES).toEqual([
      { type: 'cash' },
      { type: 'fixed_interest' },
      { type: 'shares' },
      { type: 'super' },
      { type: 'property' },
    ]);
  });
});
