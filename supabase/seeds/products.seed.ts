/**
 * Seed script: public.products
 *
 * Populates super fund and wrap platform fee data.
 * Run with: npx ts-node supabase/seeds/products.seed.ts
 *
 * Data sourced from fund PDS documents and fee schedules.
 * Verify data_as_at dates before each production deployment.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AdminFeeTier {
  balance_from: number;
  balance_to: number | null; // null = no upper limit
  rate_pct: number;
}

interface FeeStructure {
  admin_fee_pa?: number;             // Fixed dollar admin fee per annum
  admin_fee_pct?: number;            // % of balance p.a. (flat or base)
  admin_fee_cap_pa?: number;         // Cap on % component, $ p.a.
  admin_fee_min_pa?: number;         // Minimum $ p.a. (wrap platforms)
  admin_fee_tiers?: AdminFeeTier[];  // Tiered % schedule (wrap platforms)
  investment_fee_default_pct?: number; // Default/balanced option total investment fee
  performance_fee_pct?: number;      // 5-yr avg performance fees where disclosed
  buy_spread_pct?: number;
  sell_spread_pct?: number;
  total_fee_at_50k?: number;         // All-in $ p.a. at $50k balance (illustrative)
  orfr_pct?: number;                 // Operational Risk Financial Requirement levy
  expense_recovery_pct?: number;
  notes?: string;
}

interface InvestmentOption {
  name: string;
  investment_fee_pct?: number;
  total_fee_pct?: number;            // All-in % where available
  description?: string;
  growth_pct?: number;               // % growth assets, e.g. 70 = 70% growth / 30% defensive
  is_default?: boolean;              // true for MySuper / default option
}

interface ProductRow {
  product_type: 'super_fund' | 'wrap_platform';
  name: string;
  aliases: string[];
  provider: string;
  fee_structure: FeeStructure;
  investment_options: InvestmentOption[];
  data_as_at: string; // ISO date string
}

// ─────────────────────────────────────────────────────────────────────────────
// Industry & Retail Super Funds
// ─────────────────────────────────────────────────────────────────────────────

const superFunds: ProductRow[] = [
  {
    product_type: 'super_fund',
    name: 'AustralianSuper',
    aliases: ['Australian Super', 'AusSuper', 'Aussie Super'],
    provider: 'AustralianSuper Pty Ltd',
    fee_structure: {
      admin_fee_pa: 52,              // $1/week
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 350,         // % component capped at $350 p.a.
      investment_fee_default_pct: 0.45, // Balanced (MySuper)
      buy_spread_pct: 0,
      sell_spread_pct: 0,
      total_fee_at_50k: 387,         // Before 15% tax benefit; ~$372 after
      notes:
        'Admin % capped at $350 p.a. No buy/sell spread on PreMixed or DIY Mix options. ' +
        'Investment fee range 0.05%–0.52% across PreMixed options. ' +
        'Source: australiansuper.com/why-choose-us/fees-costs (August 2025 PDS).',
    },
    investment_options: [
      { name: 'Balanced (MySuper)', investment_fee_pct: 0.45, growth_pct: 70, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.52, growth_pct: 90 },
      { name: 'Indexed Diversified', investment_fee_pct: 0.05, growth_pct: 70 },
      { name: 'Conservative Balanced', investment_fee_pct: 0.41, growth_pct: 50 },
      { name: 'Stable', investment_fee_pct: 0.29, growth_pct: 30 },
    ],
    data_as_at: '2025-08-01',
  },

  {
    product_type: 'super_fund',
    name: 'Australian Retirement Trust Super Savings',
    aliases: ['ART', 'Australian Retirement Trust', 'Sunsuper', 'QSuper'],
    provider: 'Australian Retirement Trust Pty Ltd',
    fee_structure: {
      admin_fee_pa: 62.40,           // $1.20/week
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 500,         // % component capped (combined cap ~$562.40 p.a.)
      investment_fee_default_pct: 0.10, // Lifecycle High Growth Pool
      total_fee_at_50k: 487,         // Illustrative at $50k (admin + investment)
      notes:
        'Lifecycle default (High Growth Pool) invests based on member age. ' +
        'All-in ~0.94% at $50k per Finder comparison. ' +
        'Source: australianretirementtrust.com.au/investments/fees (1 July 2024 PDS).',
    },
    investment_options: [
      { name: 'High Growth Pool (Lifecycle default)', investment_fee_pct: 0.10, growth_pct: 90, is_default: true },
      { name: 'Balanced Pool', investment_fee_pct: 0.59, growth_pct: 70 },
      { name: 'Diversified Bonds Pool', investment_fee_pct: 0.40, growth_pct: 15 },
    ],
    data_as_at: '2024-07-01',
  },

  {
    product_type: 'super_fund',
    name: 'Aware Super Future Saver',
    aliases: ['Aware Super', 'First State Super', 'VicSuper', 'StatePlus'],
    provider: 'Aware Super Pty Ltd',
    fee_structure: {
      admin_fee_pa: 52,              // $1/week
      admin_fee_pct: 0.15,
      admin_fee_cap_pa: 750,         // % component capped at $750 p.a.
      investment_fee_default_pct: 0.48, // High Growth (default MySuper Lifecycle)
      total_fee_at_50k: 452,         // $52 fixed + $75 (0.15% on $50k) + investment
      notes:
        'Admin % capped at $750 p.a.; combined admin cap ~$802 p.a. ' +
        'Default is MySuper Lifecycle; High Growth used as illustrative investment fee. ' +
        'Source: aware.com.au/member/what-we-offer/fees-and-costs (June 2025 PDS).',
    },
    investment_options: [
      { name: 'High Growth', investment_fee_pct: 0.48, growth_pct: 90, is_default: true },
      { name: 'Growth', investment_fee_pct: 0.44, growth_pct: 77 },
      { name: 'Balanced Growth', investment_fee_pct: 0.38, growth_pct: 70 },
      { name: 'Conservative Growth', investment_fee_pct: 0.32, growth_pct: 50 },
    ],
    data_as_at: '2025-06-01',
  },

  {
    product_type: 'super_fund',
    name: 'Cbus Super',
    aliases: ['CBUS', 'Cbus', 'Construction & Building Unions Superannuation'],
    provider: 'United Super Pty Ltd',
    fee_structure: {
      admin_fee_pa: 52,              // $1/week
      admin_fee_pct: 0.19,
      admin_fee_cap_pa: 1000,
      investment_fee_default_pct: 0.44, // Growth (MySuper)
      performance_fee_pct: 0.04,     // 5-yr avg
      buy_spread_pct: 0,
      sell_spread_pct: 0,
      total_fee_at_50k: 410,         // Illustrative; transaction costs add ~0.12%
      notes:
        'Growth (MySuper) investment fee 0.44% + transaction costs 0.12% + performance fees 0.04%. ' +
        'All-in ~0.82% at $50k. ' +
        'Source: cbussuper.com.au MySuper dashboard (August 2023 PDS, reviewed 2025).',
    },
    investment_options: [
      { name: 'Growth (MySuper)', investment_fee_pct: 0.44, total_fee_pct: 0.60, growth_pct: 77, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.56, growth_pct: 90 },
      { name: 'Conservative Growth', investment_fee_pct: 0.36, growth_pct: 50 },
      { name: 'Cash Savings', investment_fee_pct: 0.10, growth_pct: 0 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'HESTA',
    aliases: ['Hesta', 'Health Employees Superannuation Trust Australia'],
    provider: 'H.E.S.T. Australia Ltd',
    fee_structure: {
      admin_fee_pct: 0.15,
      admin_fee_cap_pa: 750,         // Not charged on balance >$500k
      investment_fee_default_pct: 0.53, // Balanced Growth (MySuper); incl. 0.17% performance
      performance_fee_pct: 0.17,
      buy_spread_pct: 0,
      sell_spread_pct: 0,
      total_fee_at_50k: 362,
      notes:
        'No fixed dollar admin fee; 0.15% p.a. capped at $750 p.a. and not charged above $500k. ' +
        'Investment fee for Balanced Growth includes 0.17% performance fees (5-yr avg) and 0.05% transaction costs. ' +
        'Source: hesta.com.au/members/your-superannuation/fees-and-costs (30 September 2025 PDS).',
    },
    investment_options: [
      { name: 'Balanced Growth (MySuper)', investment_fee_pct: 0.53, total_fee_pct: 0.68, growth_pct: 70, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.58, growth_pct: 90 },
      { name: 'Sustainable Growth', investment_fee_pct: 0.61, growth_pct: 77 },
      { name: 'Indexed Balanced Growth', investment_fee_pct: 0.09, growth_pct: 70 },
      { name: 'Cash', investment_fee_pct: 0.10, growth_pct: 0 },
    ],
    data_as_at: '2025-09-30',
  },

  {
    product_type: 'super_fund',
    name: 'Hostplus',
    aliases: ['Host-Plus', 'Hostplus Super'],
    provider: 'Host-Plus Pty Ltd',
    fee_structure: {
      admin_fee_pa: 78,              // $1.50/week (flat, no % component)
      investment_fee_default_pct: 0.88, // Balanced (all-in incl. 0.06% admin recovery)
      total_fee_at_50k: 625,         // Balanced: $78 admin + ~0.88% × $50k = ~$518 investment
      notes:
        'Flat $78 p.a. admin fee; no % admin component. ' +
        'Balanced all-in ~1.25% at $50k per Finder. Indexed Balanced ~0.10% investment fee. ' +
        'Source: hostplus.com.au (2025 PDS).',
    },
    investment_options: [
      { name: 'Balanced (MySuper)', investment_fee_pct: 0.88, total_fee_pct: 1.04, growth_pct: 70, is_default: true },
      { name: 'Indexed Balanced', investment_fee_pct: 0.10, total_fee_pct: 0.26, growth_pct: 70 },
      { name: 'Shares Plus', investment_fee_pct: 0.67, growth_pct: 90 },
      { name: 'Capital Stable', investment_fee_pct: 0.56, growth_pct: 30 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'REST Super',
    aliases: ['REST', 'Retail Employees Superannuation Trust'],
    provider: 'Retail Employees Superannuation Pty Ltd',
    fee_structure: {
      admin_fee_pa: 78,              // $1.50/week
      admin_fee_pct: 0.10,
      admin_fee_cap_pa: 600,         // % component capped at $600 p.a.
      investment_fee_default_pct: 0.57, // Growth (default)
      buy_spread_pct: 0.05,
      sell_spread_pct: 0.08,
      total_fee_at_50k: 438,         // $78 fixed + $50 (0.10%) + ~$285 investment + $25 spreads
      notes:
        'Buy/sell spreads up to 0.13% depending on option. ' +
        'Source: rest.com.au/super/products/fees-and-costs (2025 PDS).',
    },
    investment_options: [
      { name: 'Growth (default)', investment_fee_pct: 0.57, growth_pct: 77, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.61, growth_pct: 90 },
      { name: 'Balanced', investment_fee_pct: 0.50, growth_pct: 70 },
      { name: 'Diversified', investment_fee_pct: 0.44, growth_pct: 70 },
      { name: 'Cash', investment_fee_pct: 0.10, growth_pct: 0 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'UniSuper Accumulation 1',
    aliases: ['UniSuper', 'University Super', 'UniSuper Accumulation'],
    provider: 'UniSuper Management Pty Ltd',
    fee_structure: {
      admin_fee_pa: 96,              // Flat $96 p.a. (or 2% if balance <$4,800)
      investment_fee_default_pct: 0.36, // Balanced (MySuper); all-in ~0.48%
      total_fee_at_50k: 336,         // $96 + $180 investment (0.36% × $50k)
      notes:
        'Fixed $96 p.a. admin fee, or 2% of balance if balance below $4,800. ' +
        'All-in Balanced ~0.48% including indirect costs. ' +
        'Source: unisuper.com.au/super/products-and-fees (2025 PDS).',
    },
    investment_options: [
      { name: 'Balanced (MySuper)', investment_fee_pct: 0.36, total_fee_pct: 0.48, growth_pct: 70, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.42, growth_pct: 90 },
      { name: 'Conservative Balanced', investment_fee_pct: 0.32, growth_pct: 50 },
      { name: 'Australian Shares', investment_fee_pct: 0.22, growth_pct: 100 },
      { name: 'Listed Property', investment_fee_pct: 0.22, growth_pct: 100 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'CFS FirstChoice Wholesale Personal Super',
    aliases: ['CFS FirstChoice', 'Colonial First State FirstChoice', 'CFS Wholesale Super'],
    provider: 'Colonial First State Investments Ltd',
    fee_structure: {
      admin_fee_pct: 0.20,           // % of balance (no fixed component for wholesale)
      investment_fee_default_pct: 0.55, // Lifestage 1965–69 all-in
      total_fee_at_50k: 395,         // $100 (0.20%) + ~$275 investment at $50k
      notes:
        'Wholesale tier; admin fee 0.20% p.a. (no fixed dollar component disclosed). ' +
        'Lifestage (default) investment fee 0.35%–0.55% depending on cohort. ' +
        'Source: cfs.com.au/fees-and-performance (2025).',
    },
    investment_options: [
      { name: 'Lifestage 1965–69', total_fee_pct: 0.75, growth_pct: 55, is_default: true },
      { name: 'Lifestage 1970–74', total_fee_pct: 0.70, growth_pct: 65, is_default: true },
      { name: 'Lifestage 1975+', total_fee_pct: 0.65, growth_pct: 77, is_default: true },
      { name: 'FirstChoice Diversified', investment_fee_pct: 0.50, growth_pct: 70 },
      { name: 'FirstChoice Cash', investment_fee_pct: 0.25, growth_pct: 0 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'Vanguard Super SaveSmart',
    aliases: ['Vanguard Super', 'VSS'],
    provider: 'Vanguard Investments Australia Ltd',
    fee_structure: {
      admin_fee_pct: 0.20,           // Embedded in total; no separate fixed component
      investment_fee_default_pct: 0.36, // Lifecycle option (total ~0.56% all-in)
      total_fee_at_50k: 280,         // ~0.56% × $50k
      notes:
        'All-in fee ~0.56% p.a. for index/non-managed options, ~0.58% for Lifecycle. ' +
        'No separate fixed dollar admin fee disclosed publicly. ' +
        'Source: vanguard.com.au/personal/super (2025).',
    },
    investment_options: [
      { name: 'High Growth', total_fee_pct: 0.58, growth_pct: 90 },
      { name: 'Growth', total_fee_pct: 0.56, growth_pct: 77 },
      { name: 'Balanced', total_fee_pct: 0.55, growth_pct: 70 },
      { name: 'Conservative', total_fee_pct: 0.54, growth_pct: 30 },
      { name: 'Cash Plus', total_fee_pct: 0.40, growth_pct: 0 },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'Mercer Super (SmartPath)',
    aliases: ['Mercer Super', 'Mercer SmartPath', 'Mercer SmartSuper'],
    provider: 'Mercer Superannuation (Australia) Ltd',
    fee_structure: {
      admin_fee_pct: 0.10,           // 0.10% on balances up to $500k; nil above
      investment_fee_default_pct: 0.37, // SmartPath lifecycle (midpoint of 0.34%–0.40%)
      expense_recovery_pct: 0.02,    // 0.00%–0.05% depending on option
      total_fee_at_50k: 285,         // $50 admin (0.10%) + $185 investment + $50 expenses
      notes:
        'Admin fee 0.10% up to $500k balance; nil above $500k. ' +
        '24%–42% below MySuper market average per Chant West (June 2025). ' +
        'Investment fee range 0.34%–0.40% across SmartPath cohorts. ' +
        'Source: mercersuper.com.au/compare-us/fees-and-costs/ (2025).',
    },
    investment_options: [
      { name: 'SmartPath (born 1959–1963)', investment_fee_pct: 0.40, growth_pct: 55, is_default: true },
      { name: 'SmartPath (born 1964–1968)', investment_fee_pct: 0.38, growth_pct: 65, is_default: true },
      { name: 'SmartPath (born 1969–1973)', investment_fee_pct: 0.36, growth_pct: 75, is_default: true },
      { name: 'SmartPath (born 1974+)', investment_fee_pct: 0.34, growth_pct: 85, is_default: true },
      { name: 'High Growth', investment_fee_pct: 0.45, growth_pct: 90 },
    ],
    data_as_at: '2025-06-01',
  },

  {
    product_type: 'super_fund',
    name: 'AMP MySuper (Lifestages)',
    aliases: ['AMP Super', 'AMP MySuper', 'AMP Lifestages'],
    provider: 'N.M. Superannuation Pty Ltd (AMP)',
    fee_structure: {
      admin_fee_pct: 0.50,           // Indicative % component (capped at $950 p.a.)
      admin_fee_cap_pa: 950,
      investment_fee_default_pct: 0.45, // Lifestages 1970s–1990s (indicative midpoint)
      total_fee_at_50k: 700,         // Indicative; verify against current PDS
      notes:
        'Admin fee is percentage-based, capped at $950 p.a. ' +
        'Lifestages investment fee varies by birth decade cohort (0.35%–0.55% indicative range). ' +
        'Verify current fee schedule at amp.com.au/superannuation/super-returns-fees-and-investments (2025).',
    },
    investment_options: [
      { name: 'Lifestages 1990s', investment_fee_pct: 0.45, growth_pct: 85, is_default: true },
      { name: 'Lifestages 1980s', investment_fee_pct: 0.43, growth_pct: 77, is_default: true },
      { name: 'Lifestages 1970s', investment_fee_pct: 0.40, growth_pct: 65, is_default: true },
      { name: 'Lifestages 1960s', investment_fee_pct: 0.37, growth_pct: 50, is_default: true },
    ],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'super_fund',
    name: 'MLC MasterKey Super Fundamentals',
    aliases: ['MLC Super', 'MLC MasterKey', 'MLC MasterKey Super'],
    provider: 'NULIS Nominees (Australia) Ltd',
    fee_structure: {
      admin_fee_pa: 78,              // $1.50/week fixed
      admin_fee_pct: 0.20,           // % component (indicative; varies by balance)
      admin_fee_cap_pa: 1000,        // Super cap; $800 for pension (from 1 April 2025)
      investment_fee_default_pct: 0.50, // Indicative for balanced-style option
      total_fee_at_50k: 578,         // $78 + $100 (0.20%) + $250 investment (0.50%) + $150 other
      notes:
        'Fixed $78 p.a. + % admin fee capped at $1,000 p.a. (super) from 1 April 2025. ' +
        'Investment fee varies significantly by option chosen. ' +
        'Source: mlc.com.au/personal/superannuation/fees-education (1 October 2024 PDS, updated 1 April 2025).',
    },
    investment_options: [
      { name: 'MLC Horizon 4 (Balanced)', investment_fee_pct: 0.50, growth_pct: 70, is_default: true },
      { name: 'MLC Horizon 5 (Growth)', investment_fee_pct: 0.54, growth_pct: 77 },
      { name: 'MLC Horizon 3 (Conservative Growth)', investment_fee_pct: 0.46, growth_pct: 50 },
      { name: 'MLC Cash Fund', investment_fee_pct: 0.20, growth_pct: 0 },
    ],
    data_as_at: '2025-04-01',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Wrap Platforms
// ─────────────────────────────────────────────────────────────────────────────

const wrapPlatforms: ProductRow[] = [
  {
    product_type: 'wrap_platform',
    name: 'Netwealth Super Accelerator Plus',
    aliases: ['Netwealth', 'Netwealth Super', 'NW Super Accelerator'],
    provider: 'Netwealth Investments Ltd',
    fee_structure: {
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 250000,  rate_pct: 0.37 },
        { balance_from: 250000,  balance_to: 500000,  rate_pct: 0.27 },
        { balance_from: 500000,  balance_to: 1000000, rate_pct: 0.17 },
        { balance_from: 1000000, balance_to: null,    rate_pct: 0.10 },
      ],
      orfr_pct: 0.023,               // Avg; capped at $300 p.a.
      investment_fee_default_pct: 0,  // Depends entirely on underlying investments
      total_fee_at_50k: 210,         // 0.37% × $50k + $11.50 ORFR
      notes:
        'Tiered asset-based admin fee; no fixed dollar component. ' +
        'ORFR levy ~0.023% p.a. (avg), capped at $300 p.a. ' +
        'Investment fees depend on underlying managed funds/ETFs selected. ' +
        'Source: netwealth.zendesk.com article 8620115022863 (2025).',
    },
    investment_options: [],           // Platform; options depend on adviser/client selection
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'HUB24 Super',
    aliases: ['HUB24', 'Hub24 Super', 'HUB24 Invest'],
    provider: 'HUB24 Custodial Services Ltd',
    fee_structure: {
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 100000,  rate_pct: 0.44 },
        { balance_from: 100000,  balance_to: 250000,  rate_pct: 0.33 },
        { balance_from: 250000,  balance_to: 500000,  rate_pct: 0.22 },
        { balance_from: 500000,  balance_to: null,    rate_pct: 0.11 },
      ],
      expense_recovery_pct: 0.025,   // Reduced from 0.035% (November 2023)
      investment_fee_default_pct: 0,
      total_fee_at_50k: 232,         // 0.44% × $50k + $12.50 expense recovery
      notes:
        'Tiered admin fee applies to Core Menu and Choice Menu; tiers reflect November 2023 reduction. ' +
        'Expense recovery fee 0.025% (reduced from 0.035%). ' +
        'Account keeping fee also applies (amount in current PDS). ' +
        'Source: HUB24 PDS Update Notice December 2024.',
    },
    investment_options: [],
    data_as_at: '2024-12-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'BT Panorama Super',
    aliases: ['BT Panorama', 'Panorama Super', 'Westpac Panorama Super'],
    provider: 'BT Funds Management Ltd',
    fee_structure: {
      admin_fee_pct: 0.15,           // Asset-based; 0% above $1m
      admin_fee_min_pa: 60,          // Focus Menu; $240 Compact; $540 Full Menu
      orfr_pct: 0.014,               // ~$6.75 p.a. at $50k
      expense_recovery_pct: 0.030,   // ~$15.07 p.a. at $50k
      investment_fee_default_pct: 0,
      total_fee_at_50k: 397,         // $75 asset + $240 menu fee + ~$22 levies (Compact Menu)
      notes:
        'Asset-based fee 0.15% p.a. on balances up to $1m; nil above $1m. ' +
        'Fixed menu fee: Full $540 p.a. / Compact $240 p.a. / Focus $60 p.a. ' +
        'Expense recovery ~$15 p.a. and ORFR ~$7 p.a. at $50k balance. ' +
        'Source: BT Panorama Super PDS 1 October 2025.',
    },
    investment_options: [],
    data_as_at: '2025-10-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'CFS Edge Super',
    aliases: ['CFS Edge', 'Colonial First State Edge', 'CFS Edge Accelerate'],
    provider: 'Colonial First State Investments Ltd',
    fee_structure: {
      admin_fee_pct: 0,              // Zero admin fee on Accelerate/Accelerate 100 option
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 250000,  rate_pct: 0.30 },
        { balance_from: 250000,  balance_to: 500000,  rate_pct: 0.20 },
        { balance_from: 500000,  balance_to: null,    rate_pct: 0.10 },
      ],
      investment_fee_default_pct: 0,
      total_fee_at_50k: 0,           // Zero on Accelerate option (investment fees still apply)
      notes:
        'Zero administration fee available on CFS Edge Accelerate and Accelerate 100 options. ' +
        'Standard tiered admin fee applies to other menus. ' +
        'Investment fees depend on underlying fund/ETF selection. ' +
        'Source: SuitabilityHub 2024 Platform Market Wrap; cfs.com.au (2025).',
    },
    investment_options: [],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'Macquarie Wrap Super Consolidator II',
    aliases: ['Macquarie Wrap', 'Macquarie Super Consolidator', 'Macquarie Manager II'],
    provider: 'Macquarie Investment Management Ltd',
    fee_structure: {
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 100000,  rate_pct: 0.50 },
        { balance_from: 100000,  balance_to: 250000,  rate_pct: 0.35 },
        { balance_from: 250000,  balance_to: 500000,  rate_pct: 0.25 },
        { balance_from: 500000,  balance_to: 1000000, rate_pct: 0.15 },
        { balance_from: 1000000, balance_to: null,    rate_pct: 0.05 },
      ],
      investment_fee_default_pct: 0,
      total_fee_at_50k: 250,         // 0.50% × $50k (indicative)
      notes:
        'Holdings-based tiered pricing; fee aggregation available across up to 8 linked accounts (Elevate option). ' +
        'Cash hub admin fee estimated 0.69%–1.75% p.a. on cash hub balance. ' +
        'Consolidator II – Engage: no fee aggregation discount. ' +
        'Source: macquarie.com.au/advisers/solutions/macquarie-wrap.html (2025).',
    },
    investment_options: [],
    data_as_at: '2025-01-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'AMP North (MyNorth Super & Pension)',
    aliases: ['AMP North', 'MyNorth', 'North Super', 'AMP MyNorth'],
    provider: 'N.M. Superannuation Pty Ltd (AMP)',
    fee_structure: {
      admin_fee_tiers: [
        // Select and Choice menus
        { balance_from: 0,        balance_to: 250000,  rate_pct: 0.28 },
        { balance_from: 250000,   balance_to: 500000,  rate_pct: 0.20 },
        { balance_from: 500000,   balance_to: 1000000, rate_pct: 0.15 },
        { balance_from: 1000000,  balance_to: 1250000, rate_pct: 0.10 },
        { balance_from: 1250000,  balance_to: null,    rate_pct: 0.00 },
      ],
      admin_fee_min_pa: 180,         // $15/month minimum (Select and Choice menus)
      investment_fee_default_pct: 0.75, // Grow menu flat fee
      total_fee_at_50k: 320,         // $180 min + investment fees
      notes:
        'Select menu: 0.00%–0.20% p.a. tiered; Choice menu: 0.00%–0.28% p.a. tiered. ' +
        'Minimum $180 p.a. ($15/month) on Select and Choice menus. ' +
        'Capped on first $1.25m per client/family group. ' +
        'Grow menu: nil tiered admin, 0.75% flat investment fee. ' +
        'Source: northonline.com.au/adviser/products/fees; AMP North PDS 30 September 2025.',
    },
    investment_options: [
      { name: 'Grow Menu (flat)', total_fee_pct: 0.75, growth_pct: 70 },
    ],
    data_as_at: '2025-09-30',
  },

  {
    product_type: 'wrap_platform',
    name: 'MLC Expand Essential Super',
    aliases: ['MLC Expand Essential', 'Expand Essential', 'MLC Essential Super'],
    provider: 'NULIS Nominees (Australia) Ltd',
    fee_structure: {
      admin_fee_pa: 78,              // Account Keeping Fee (reduced from $90, effective 1 June 2025)
      admin_fee_pct: 0.10,           // Flat 0.10% p.a. — no tiering on Essential
      admin_fee_cap_pa: 800,         // Fee cap applies for balances above $800k (reduced from $1m)
      investment_fee_default_pct: 0,
      total_fee_at_50k: 128,         // $78 account fee + 0.10% × $50k = $78 + $50
      notes:
        'Low-cost platform for clients with simpler needs. ' +
        'Account Keeping Fee reduced from $90 to $78 p.a. effective 1 June 2025. ' +
        'Administration Fee is flat 0.10% p.a. (not tiered); cap now applies at $800k (was $1m). ' +
        'Essential+ menu (ETFs/TDs) attracts a higher admin fee rate on first $500k vs standard Essential menu. ' +
        'Source: mlc.com.au media release (May 2025); myexpand.com.au (2025).',
    },
    investment_options: [],
    data_as_at: '2025-06-01',
  },

  {
    product_type: 'wrap_platform',
    name: 'MLC Expand Extra Super',
    aliases: ['MLC Expand Extra', 'Expand Extra', 'MLC Wrap Extra', 'MLC Extra Super'],
    provider: 'NULIS Nominees (Australia) Ltd',
    fee_structure: {
      admin_fee_pa: 150,             // Account Keeping Fee (reduced from $180, effective 1 June 2025)
      admin_fee_tiers: [
        { balance_from: 0,       balance_to: 100000,  rate_pct: 0.45 },
        { balance_from: 100000,  balance_to: 200000,  rate_pct: 0.35 },
        { balance_from: 200000,  balance_to: 500000,  rate_pct: 0.25 },
        { balance_from: 500000,  balance_to: 800000,  rate_pct: 0.15 },
        { balance_from: 800000,  balance_to: null,    rate_pct: 0.05 },
      ],
      investment_fee_default_pct: 0,
      total_fee_at_50k: 375,         // $150 account fee + 0.45% × $50k = $150 + $225
      notes:
        'Full-service wrap platform for clients with more complex needs. ' +
        'Account Keeping Fee reduced from $180 to $150 p.a. effective 1 June 2025. ' +
        'Tiered Administration Fee reduced for balances above $100k; most significant savings $200k–$800k. ' +
        'Example: $250k balance saves >$330 p.a. (25% reduction) vs prior schedule. ' +
        'Fee aggregation available across linked account groups. ' +
        'Source: mlc.com.au media release (May 2025).',
    },
    investment_options: [],
    data_as_at: '2025-06-01',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  const allProducts: ProductRow[] = [...superFunds, ...wrapPlatforms];

  console.log(`Seeding ${allProducts.length} products…`); // expect 21: 13 super funds, 8 wrap platforms

  // Upsert by name to allow re-running safely
  const { data, error } = await supabase
    .from('products')
    .upsert(allProducts, { onConflict: 'name' })
    .select('id, name, product_type');

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`✓ Seeded ${data?.length ?? 0} products:`);
  data?.forEach(p => console.log(`  ${p.product_type.padEnd(14)} ${p.name} (${p.id})`));
}

seed().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
