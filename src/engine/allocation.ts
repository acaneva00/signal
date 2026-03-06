/**
 * Surplus Allocation & Deficit Drawdown Module (PRD 8.6)
 *
 * Distributes positive monthly cash flow across configurable priorities:
 *   1. Emergency cash buffer target
 *   2. Extra debt repayments (avalanche or snowball)
 *   3. Additional super contributions
 *   4. Investment contributions
 *   5. Remainder to cash/savings
 *
 * Draws from assets to cover negative cash flow in configurable order:
 *   1. Cash / savings (most liquid, no tax event)
 *   2. Fixed interest / term deposits
 *   3. Shares / managed funds (may trigger CGT)
 *   4. Super (if preservation age reached + condition of release met)
 *   5. Investment property (last resort — triggers CGT, linked mortgage repaid)
 *
 * Minimum loan repayments are mandatory and handled outside this module
 * by the main projection loop before surplus/deficit is determined.
 *
 * All functions are pure — no side effects.
 */

import type { Asset, Liability, SurplusRule, DrawdownRule } from './models';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AllocationAction {
  action: string;
  target_id: string;
  amount: number;
}

export interface DrawdownAction {
  action: string;
  source_id: string;
  amount: number;
}

export interface CGTEvent {
  asset_id: string;
  disposal_proceeds: number;
  cost_base: number;
  gross_gain: number;
  net_gain: number;
}

export interface DeficitResult {
  actions: DrawdownAction[];
  cgt_events: CGTEvent[];
}

// ── Default Rules ────────────────────────────────────────────────────────────

export const DEFAULT_SURPLUS_RULES: SurplusRule[] = [
  { type: 'emergency_buffer' },
  { type: 'extra_debt_repayment', strategy: 'avalanche' },
  { type: 'remainder_to_cash' },
];

export const DEFAULT_DRAWDOWN_RULES: DrawdownRule[] = [
  { type: 'cash' },
  { type: 'fixed_interest' },
  { type: 'shares' },
  { type: 'super' },
  { type: 'property' },
];

// ── Surplus Allocation ───────────────────────────────────────────────────────

/**
 * Distribute a positive cash flow surplus across rules in priority order.
 *
 * Each rule consumes as much of the remaining surplus as it can (subject to
 * its own limits) before the next rule is evaluated. When no explicit
 * `target_amount` is set on the emergency buffer rule, the default target
 * is 3× `monthlyExpenses`.
 *
 * Returns an ordered list of actions describing where money was allocated.
 */
export function allocateSurplus(
  amount: number,
  rules: SurplusRule[],
  assets: Asset[],
  liabilities: Liability[],
  monthlyExpenses: number = 0,
): AllocationAction[] {
  const actions: AllocationAction[] = [];
  let remaining = amount;

  if (remaining <= 0) return actions;

  for (const rule of rules) {
    if (remaining <= 0) break;

    switch (rule.type) {
      case 'emergency_buffer': {
        const bufferTarget = rule.target_amount ?? monthlyExpenses * 3;
        const cashAsset = rule.target_asset_id
          ? assets.find((a) => a.id === rule.target_asset_id)
          : assets.find((a) => a.asset_class === 'cash');

        if (!cashAsset || bufferTarget <= 0) break;

        const gap = Math.max(0, bufferTarget - cashAsset.current_value);
        if (gap <= 0) break;

        const allocation = Math.min(remaining, gap);
        actions.push({
          action: 'add_to_buffer',
          target_id: cashAsset.id,
          amount: allocation,
        });
        remaining -= allocation;
        break;
      }

      case 'extra_debt_repayment': {
        let debts = liabilities.filter(
          (l) => l.current_balance > 0 && l.liability_type !== 'hecs_help',
        );

        if (debts.length === 0) break;

        if (rule.strategy === 'snowball') {
          debts = [...debts].sort(
            (a, b) => a.current_balance - b.current_balance,
          );
        } else {
          debts = [...debts].sort(
            (a, b) => b.interest_rate - a.interest_rate,
          );
        }

        const cap = rule.monthly_amount ?? remaining;
        let debtBudget = Math.min(remaining, cap);

        for (const debt of debts) {
          if (debtBudget <= 0) break;

          const payment = Math.min(debtBudget, debt.current_balance);
          if (payment <= 0) continue;

          actions.push({
            action: 'extra_debt_repayment',
            target_id: debt.id,
            amount: payment,
          });
          debtBudget -= payment;
          remaining -= payment;
        }
        break;
      }

      case 'super_contribution': {
        const superAmount = rule.monthly_amount
          ? Math.min(remaining, rule.monthly_amount)
          : 0;

        if (superAmount <= 0) break;

        actions.push({
          action: 'super_contribution',
          target_id: rule.target_asset_id ?? 'super',
          amount: superAmount,
        });
        remaining -= superAmount;
        break;
      }

      case 'investment_contribution': {
        const investAmount = rule.monthly_amount
          ? Math.min(remaining, rule.monthly_amount)
          : 0;

        if (investAmount <= 0) break;

        actions.push({
          action: 'investment_contribution',
          target_id: rule.target_asset_id ?? 'investment',
          amount: investAmount,
        });
        remaining -= investAmount;
        break;
      }

      case 'remainder_to_cash': {
        if (remaining <= 0) break;

        const cashAsset = rule.target_asset_id
          ? assets.find((a) => a.id === rule.target_asset_id)
          : assets.find((a) => a.asset_class === 'cash');

        actions.push({
          action: 'remainder_to_cash',
          target_id: cashAsset?.id ?? 'cash',
          amount: remaining,
        });
        remaining = 0;
        break;
      }
    }
  }

  return actions;
}

// ── Deficit Drawdown ─────────────────────────────────────────────────────────

const ASSET_CLASS_MAP: Record<string, string[]> = {
  cash: ['cash'],
  fixed_interest: ['fixed_interest'],
  shares: ['australian_shares', 'international_shares'],
  property: ['property_investment'],
};

const CGT_DISCOUNT = 0.5;

/**
 * Draw from assets in priority order to cover a negative cash flow deficit.
 *
 * Cash and fixed interest drawdowns are tax-neutral. Share disposals trigger
 * CGT (50% discount assumed for individuals holding > 12 months). Property
 * disposals trigger CGT and automatically repay any linked/secured mortgage
 * from sale proceeds — only the net proceeds count toward covering the deficit.
 *
 * Super drawdown is skipped unless `superAccessible` is true (preservation
 * age reached and a condition of release is met).
 */
export function processDeficit(
  amount: number,
  rules: DrawdownRule[],
  assets: Asset[],
  liabilities: Liability[],
  options: { superAccessible?: boolean } = {},
): DeficitResult {
  const actions: DrawdownAction[] = [];
  const cgt_events: CGTEvent[] = [];
  let remaining = amount;

  if (remaining <= 0) return { actions, cgt_events };

  for (const rule of rules) {
    if (remaining <= 0) break;

    if (rule.type === 'super' && !options.superAccessible) continue;

    const candidates = findCandidateAssets(rule, assets);

    for (const asset of candidates) {
      if (remaining <= 0) break;
      if (asset.current_value <= 0) continue;

      if (rule.type === 'property') {
        const result = handlePropertyDisposal(asset, liabilities, remaining);
        actions.push(...result.actions);
        cgt_events.push(...result.cgt_events);
        remaining -= result.deficitCovered;
      } else {
        const drawAmount = Math.min(remaining, asset.current_value);

        actions.push({
          action: `draw_${rule.type}`,
          source_id: asset.id,
          amount: drawAmount,
        });

        if (rule.type === 'shares' && !asset.is_primary_residence) {
          const proportionalCostBase =
            asset.cost_base * (drawAmount / asset.current_value);
          const grossGain = Math.max(0, drawAmount - proportionalCostBase);

          if (grossGain > 0) {
            cgt_events.push({
              asset_id: asset.id,
              disposal_proceeds: drawAmount,
              cost_base: proportionalCostBase,
              gross_gain: grossGain,
              net_gain: grossGain * CGT_DISCOUNT,
            });
          }
        }

        remaining -= drawAmount;
      }
    }
  }

  return { actions, cgt_events };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCandidateAssets(rule: DrawdownRule, assets: Asset[]): Asset[] {
  if (rule.asset_id) {
    return assets.filter((a) => a.id === rule.asset_id);
  }

  const classes = ASSET_CLASS_MAP[rule.type];
  if (!classes) return [];

  return assets.filter((a) => classes.includes(a.asset_class));
}

interface PropertyDisposalResult {
  actions: DrawdownAction[];
  cgt_events: CGTEvent[];
  deficitCovered: number;
}

/**
 * Full disposal of an investment property. Linked/secured mortgage is repaid
 * from sale proceeds first; only net proceeds cover the deficit.
 */
function handlePropertyDisposal(
  asset: Asset,
  liabilities: Liability[],
  remainingDeficit: number,
): PropertyDisposalResult {
  const actions: DrawdownAction[] = [];
  const cgt_events: CGTEvent[] = [];

  const saleProceeds = asset.current_value;

  const linkedLiability = liabilities.find(
    (l) =>
      l.linked_asset_id === asset.id || l.secured_by_asset_id === asset.id,
  );

  const liabilityRepayment = linkedLiability
    ? Math.min(saleProceeds, linkedLiability.current_balance)
    : 0;

  const netProceeds = saleProceeds - liabilityRepayment;
  if (netProceeds <= 0) {
    return { actions, cgt_events, deficitCovered: 0 };
  }

  const deficitCovered = Math.min(remainingDeficit, netProceeds);

  actions.push({
    action: 'dispose_property',
    source_id: asset.id,
    amount: saleProceeds,
  });

  if (liabilityRepayment > 0 && linkedLiability) {
    actions.push({
      action: 'repay_linked_liability',
      source_id: linkedLiability.id,
      amount: liabilityRepayment,
    });
  }

  if (!asset.is_primary_residence) {
    const grossGain = Math.max(0, saleProceeds - asset.cost_base);

    if (grossGain > 0) {
      cgt_events.push({
        asset_id: asset.id,
        disposal_proceeds: saleProceeds,
        cost_base: asset.cost_base,
        gross_gain: grossGain,
        net_gain: grossGain * CGT_DISCOUNT,
      });
    }
  }

  return { actions, cgt_events, deficitCovered };
}
