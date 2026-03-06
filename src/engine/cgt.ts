/**
 * Australian Capital Gains Tax Module
 *
 * Triggered on asset disposal (scheduled or deficit drawdown):
 * - Calculates gross and net capital gains
 * - Applies 50% CGT discount for individuals holding > 12 months
 * - Exempts primary residence disposals
 * - Carries forward capital losses (offset against gains only)
 * - Nets disposal proceeds against linked liabilities
 *
 * All functions are pure — no side effects.
 */

import type { Asset, Liability } from './models';

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'individual' | 'company' | 'super_accumulation';

export interface CapitalGainResult {
  grossGain: number;
  discountApplied: boolean;
  netCapitalGain: number;
  isExempt: boolean;
}

export interface CapitalLossResult {
  taxableGain: number;
  remainingLosses: number;
}

export interface DisposalProceedsResult {
  grossProceeds: number;
  liabilityRepayment: number;
  netProceeds: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CGT_DISCOUNT_RATE = 0.5;
const CGT_DISCOUNT_HOLDING_MONTHS = 12;

// ── Capital Gain Calculation ─────────────────────────────────────────────────

/**
 * Calculate the capital gain on disposal of an asset.
 *
 * The 50% CGT discount applies only to individuals who have held the asset
 * for more than 12 months. Companies and super funds in accumulation phase
 * do not receive the discount (super accumulation funds get a separate 1/3
 * discount handled outside this module).
 *
 * Primary residence disposals are fully exempt — gain is always zero.
 */
export function calculateCapitalGain(
  disposalProceeds: number,
  costBase: number,
  heldMonths: number,
  isPrimaryResidence: boolean,
  entityType: EntityType = 'individual',
): CapitalGainResult {
  if (isPrimaryResidence) {
    return {
      grossGain: 0,
      discountApplied: false,
      netCapitalGain: 0,
      isExempt: true,
    };
  }

  const grossGain = Math.max(0, disposalProceeds - costBase);

  const eligibleForDiscount =
    entityType === 'individual' && heldMonths > CGT_DISCOUNT_HOLDING_MONTHS;

  const netCapitalGain = eligibleForDiscount
    ? grossGain * (1 - CGT_DISCOUNT_RATE)
    : grossGain;

  return {
    grossGain,
    discountApplied: eligibleForDiscount && grossGain > 0,
    netCapitalGain,
    isExempt: false,
  };
}

// ── Capital Loss Offset ──────────────────────────────────────────────────────

/**
 * Apply carried-forward capital losses against a net capital gain.
 *
 * Capital losses can only offset capital gains — they cannot reduce
 * ordinary income. Any excess losses are carried forward indefinitely.
 */
export function applyCapitalLosses(
  netGain: number,
  carriedLosses: number,
): CapitalLossResult {
  if (netGain <= 0 || carriedLosses <= 0) {
    return {
      taxableGain: Math.max(0, netGain),
      remainingLosses: Math.max(0, carriedLosses),
    };
  }

  const lossesUsed = Math.min(netGain, carriedLosses);

  return {
    taxableGain: netGain - lossesUsed,
    remainingLosses: carriedLosses - lossesUsed,
  };
}

// ── Disposal Proceeds ────────────────────────────────────────────────────────

/**
 * Calculate net disposal proceeds after repaying the linked liability.
 *
 * On sale, the secured liability is repaid from proceeds first.
 * If proceeds don't fully cover the liability, the shortfall remains
 * as an obligation — net proceeds will be zero.
 */
export function calculateDisposalProceeds(
  asset: Asset,
  linkedLiability: Liability | null,
): DisposalProceedsResult {
  const grossProceeds = asset.current_value;

  if (!linkedLiability) {
    return {
      grossProceeds,
      liabilityRepayment: 0,
      netProceeds: grossProceeds,
    };
  }

  const repayment = Math.min(grossProceeds, linkedLiability.current_balance);

  return {
    grossProceeds,
    liabilityRepayment: repayment,
    netProceeds: grossProceeds - repayment,
  };
}
