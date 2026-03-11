// src/lib/products/__tests__/fund-comparison.test.ts
import { describe, it, expect } from 'vitest';
import { calculateAnnualFee, feeGapAtBalance, industryAverageFee } from '../fee-calculator';
import { findProduct } from '../product-lookup';

// ── Fee Calculator ────────────────────────────────────────────────────────────

describe('calculateAnnualFee', () => {
  it('computes fixed + pct for AustralianSuper at $50k', () => {
    const fee = calculateAnnualFee({
      admin_fee_pa: 52,
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 350,
      investment_fee_default_pct: 0.45,
    }, 50_000);
    // $52 + min($50, $350) + $225 = $327
    expect(fee).toBeCloseTo(327, 0);
  });

  it('applies admin_fee_cap_pa correctly at high balance', () => {
    const fee = calculateAnnualFee({
      admin_fee_pa: 52,
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 350,        // % component caps at $350
      investment_fee_default_pct: 0.45,
    }, 500_000);
    // $52 + $350 (capped) + $2,250 investment = $2,652
    expect(fee).toBeCloseTo(2652, 0);
  });

  it('computes tiered admin fee for Netwealth at $300k', () => {
    const fee = calculateAnnualFee({
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 250_000, rate_pct: 0.37 },
        { balance_from: 250_000, balance_to: 500_000, rate_pct: 0.27 },
      ],
      investment_fee_default_pct: 0,
    }, 300_000);
    // 0.37% × $250k + 0.27% × $50k = $925 + $135 = $1,060
    expect(fee).toBeCloseTo(1060, 0);
  });

  it('returns 0 investment fee for wrap platforms with no default', () => {
    const fee = calculateAnnualFee({
      admin_fee_tiers: [
        { balance_from: 0, balance_to: null, rate_pct: 0.37 },
      ],
      investment_fee_default_pct: 0,
    }, 100_000);
    expect(fee).toBeCloseTo(370, 0);
  });

  it('never returns a negative fee', () => {
    const fee = calculateAnnualFee({}, 0);
    expect(fee).toBeGreaterThanOrEqual(0);
  });
});

describe('feeGapAtBalance', () => {
  it('identifies Hostplus as more expensive than AustralianSuper at $50k', () => {
    const hostplus = {
      admin_fee_pa: 78,
      investment_fee_default_pct: 0.88,
    };
    const aussuper = {
      admin_fee_pa: 52,
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 350,
      investment_fee_default_pct: 0.45,
    };
    const gap = feeGapAtBalance(hostplus, aussuper, 50_000);
    // Hostplus: $78 + $440 = $518; AusSuper: $52 + $50 + $225 = $327; gap = $191
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeCloseTo(191, 0);
  });

  it('returns a negative gap when b is more expensive than a', () => {
    const cheap = { admin_fee_pa: 10, investment_fee_default_pct: 0.10 };
    const expensive = { admin_fee_pa: 200, investment_fee_default_pct: 1.50 };
    expect(feeGapAtBalance(cheap, expensive, 50_000)).toBeLessThan(0);
  });
});

describe('industryAverageFee', () => {
  it('returns $78 + 0.85% at $50k', () => {
    expect(industryAverageFee(50_000)).toBeCloseTo(503, 0);
  });

  it('scales with balance', () => {
    expect(industryAverageFee(100_000)).toBeGreaterThan(industryAverageFee(50_000));
  });
});

// ── Product Lookup ────────────────────────────────────────────────────────────

describe('findProduct', () => {
  it('finds AustralianSuper by exact name', async () => {
    const result = await findProduct('AustralianSuper');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('AustralianSuper');
  });

  it('resolves alias "ART" to Australian Retirement Trust', async () => {
    const result = await findProduct('ART');
    expect(result).not.toBeNull();
    expect(result!.name).toContain('Australian Retirement Trust');
  });

  it('resolves fuzzy match "Aussie Super" to AustralianSuper', async () => {
    const result = await findProduct('Aussie Super');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('AustralianSuper');
  });

  it('returns null for an unrecognised fund name', async () => {
    const result = await findProduct('Fictional Fund Co Pty Ltd');
    expect(result).toBeNull();
  });

  it('returns a synthetic benchmark row for "the market"', async () => {
    const result = await findProduct('the market');
    expect(result).not.toBeNull();
    expect(result!.fee_structure).toHaveProperty('admin_fee_pa', 78);
  });

  it('returns a synthetic benchmark row for "industry average"', async () => {
    const result = await findProduct('industry average');
    expect(result).not.toBeNull();
  });
});

// ── Orchestrator Intent Behaviour ────────────────────────────────────────────
// These are behavioural acceptance tests — they call the real orchestrator
// with a mocked Supabase profile to verify routing without a live AI call.

describe('compare_fund intent routing', () => {
  it('classifies "how does my super compare with AustralianSuper" as compare_fund', async () => {
    const { classifyIntent } = await import('../../chat/intent-classifier');
    const intent = await classifyIntent('how does my super compare with AustralianSuper?');
    expect(intent).toBe('compare_fund');
  });

  it('classifies "am I paying too much in fees" as compare_fund', async () => {
    const { classifyIntent } = await import('../../chat/intent-classifier');
    const intent = await classifyIntent('am I paying too much in fees?');
    expect(intent).toBe('compare_fund');
  });

  it('does not re-ask for super_fund_name when already in profile', async () => {
    const { buildComparisonResponse } = await import('../../chat/comparison-agent');
    const profile = { super_fund_name: 'Hostplus', super_balance: 50_000 };
    const result = await buildComparisonResponse(
      'how do I compare with the market',
      profile,
    );
    // Should NOT contain a question asking for fund name
    expect(result.input_request?.field).not.toBe('super_fund_name');
    expect(result.comparison_result).toBeDefined();
  });

  it('asks for super_fund_name once when missing from profile', async () => {
    const { buildComparisonResponse } = await import('../../chat/comparison-agent');
    const profile = { super_balance: 50_000 }; // no fund name
    const result = await buildComparisonResponse(
      'how do I compare with AustralianSuper',
      profile,
    );
    expect(result.input_request?.field).toBe('super_fund_name');
  });
});
