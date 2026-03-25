/**
 * Engine API — JSON-in / JSON-out interface
 *
 * These are the ONLY functions that agents call. No agent imports a
 * sub-module directly; everything goes through this boundary.
 */

import { z } from 'zod';
import { ScenarioSchema, type ProjectionResult } from './models';
import { project } from './engine';
import { getFinancialYear } from './super';
import { getRequiredFields } from '@/lib/intents';
import { CONTRIBUTIONS_TAX_RATE } from './rates/super-fy2025';

// ── Result Types ─────────────────────────────────────────────────────────────

export interface TrajectoryPoint {
  year: number;
  month: number;
  age: number;
  net_worth: number;
  super_balance: number;
  total_assets: number;
  total_liabilities: number;
  age_pension_annual: number;
  /** Annual super drawdown; zero in accumulation. */
  super_drawdown_annual?: number;
  /** Minimum ABP only (unavoidable income). */
  super_drawdown_min_annual?: number;
  /** Additional ABP used to fund shortfall. */
  super_drawdown_additional_annual?: number;
  /** total_assets - super_balance; zero if super-only. */
  non_super_asset_total?: number;
  /** Dividends, rent, interest. Zero if super-only. */
  non_super_income_annual?: number;
  /** Drawdown from cash/liquid assets. Zero if super-only. */
  non_super_drawdown_cash_annual?: number;
  /** Drawdown from asset disposal (CGT). Zero if super-only. */
  non_super_drawdown_sale_annual?: number;
  /** Employment income for the FY (net of tax); non-zero in first retirement year (July–Dec). */
  employment_income_annual?: number;
  /** age >= retirement_age. */
  is_retirement_year?: boolean;
  /** Target annual spending from scenario (same for all points). */
  retirement_spending_target?: number;
  /** Gross shortfall for the FY (engine only; never rendered in chart). */
  gross_shortfall_annual?: number;
  /** EOFY tax refund (negative tax); adds to available funds. */
  tax_refund_annual?: number;
  /** Secondary funding by source (for chart tooltip breakdown). */
  secondary_cash_annual?: number;
  secondary_fixed_interest_annual?: number;
  secondary_super_annual?: number;
  secondary_shares_annual?: number;
  secondary_property_annual?: number;
  lump_sum_annual?: number;
}

export interface YearlyDetail {
  financial_year: number;
  age: number;
  gross_income: number;
  employment_income: number;
  super_pension_income: number;
  age_pension: number;
  asset_income: number;
  tax: number;
  medicare_levy: number;
  hecs_repayment: number;
  net_income: number;
  expenses: number;
  loan_repayments: number;
  net_cash_flow: number;
  super_balance: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  opening_super_balance: number;
  sg_contributions: number;
  voluntary_contributions: number;
  investment_return: number;
  fees: number;
  pension_drawdown: number;
  lump_sum_withdrawals: number | null;
}

export interface ProjectionSummary {
  scenario_name: string;
  projection_period: string;
  final_super: number;
  final_net_worth: number;
  depletion_age: number | null;
  retirement_age: number | null;
  retirement_spending_target: number | null;
  total_pension: number;
  years_in_deficit: number;
  opening_position: {
    net_worth: number;
    total_assets: number;
    total_super: number;
    total_liabilities: number;
  };
  closing_position: {
    net_worth: number;
    total_assets: number;
    total_super: number;
    total_liabilities: number;
  };
  net_worth_growth: number;
  milestones: Array<{ year: number; month: number; event: string; amount?: number }>;
  net_worth_trajectory: Array<{ year: number; month: number; net_worth: number }>;
  trajectory: TrajectoryPoint[];
  yearly_detail: YearlyDetail[];
  warnings: string[];
}

export interface ScenarioComparison {
  scenario_name: string;
  final_net_worth: number;
  final_super: number;
  years_in_deficit: number;
  total_pension: number;
  depletion_age: number | null;
  trajectory: TrajectoryPoint[];
}

export interface ComparisonResult {
  comparison_count: number;
  scenarios: ScenarioComparison[];
  best_outcome: string;
}

// ── runProjection ────────────────────────────────────────────────────────────

/**
 * Validates raw input with Zod, runs the projection engine, and returns
 * the structured result. This is the primary entry point for agents.
 *
 * @throws {z.ZodError} if the input fails schema validation
 */
export function runProjection(scenarioInput: unknown): ProjectionResult {
  const scenario = ScenarioSchema.parse(scenarioInput);
  return project(scenario);
}

// ── compareScenarios ─────────────────────────────────────────────────────────

/**
 * Validates and runs multiple scenarios, returning a side-by-side comparison
 * of key outcomes. Used for "what-if" questions like retiring at 60 vs 67.
 *
 * @throws {z.ZodError} if any scenario input fails validation
 */
export function compareScenarios(scenarios: unknown[]): ComparisonResult {
  if (scenarios.length === 0) {
    return { comparison_count: 0, scenarios: [], best_outcome: '' };
  }

  const results = scenarios.map(input => {
    const scenario = ScenarioSchema.parse(input);
    return project(scenario);
  });

  const comparisons: ScenarioComparison[] = results.map(r => {
    const last = r.snapshots[r.snapshots.length - 1];
    const deficitMonths = r.snapshots.filter(s => s.net_cash_flow < 0).length;

    const totalPension = r.snapshots.reduce(
      (sum, s) => sum + s.age_pension_monthly,
      0,
    );

    const depletionAge = findDepletionAge(r);

    return {
      scenario_name: r.scenario_name,
      final_net_worth: last?.net_worth ?? 0,
      final_super: last?.total_super ?? 0,
      years_in_deficit: Math.round(deficitMonths / 12),
      total_pension: totalPension,
      depletion_age: depletionAge,
      trajectory: buildTrajectory(r),
    };
  });

  comparisons.sort((a, b) => b.final_net_worth - a.final_net_worth);

  return {
    comparison_count: comparisons.length,
    scenarios: comparisons,
    best_outcome: comparisons[0]?.scenario_name ?? '',
  };
}

// ── getRequiredVariables ─────────────────────────────────────────────────────

/**
 * Given an intent name, returns the profile fields required to build a
 * Scenario for that intent. The Calculation Agent calls this to decide
 * whether it needs to ask the user for more data before running.
 *
 * Returns an empty array for unknown intents.
 */
export function getRequiredVariables(intent: string): string[] {
  return getRequiredFields(intent);
}

// ── createSummary ────────────────────────────────────────────────────────────

/**
 * Extracts key metrics from a projection result: final super, final net
 * worth, depletion age, total pension received, and years in deficit.
 */
export function createSummary(result: ProjectionResult): ProjectionSummary {
  const snapshots = result.snapshots;

  if (snapshots.length === 0) {
    return emptySummary(result);
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const deficitMonths = snapshots.filter(s => s.net_cash_flow < 0).length;

  const totalPension = snapshots.reduce(
    (sum, s) => sum + s.age_pension_monthly,
    0,
  );

  const depletionAge = findDepletionAge(result);

  const metadata = result.metadata as Record<string, unknown>;
  const retirementAge =
    typeof metadata?.retirement_age === 'number' ? metadata.retirement_age : null;
  const retirementSpendingTarget =
    typeof metadata?.retirement_spending_target === 'number'
      ? metadata.retirement_spending_target
      : null;

  const milestones = findMilestones(result);

  const legacyTrajectory: ProjectionSummary['net_worth_trajectory'] = [];
  for (let i = 0; i < snapshots.length; i += 12) {
    const s = snapshots[i];
    legacyTrajectory.push({ year: s.year, month: s.month, net_worth: s.net_worth });
  }
  if (snapshots.length > 1) {
    legacyTrajectory.push({ year: last.year, month: last.month, net_worth: last.net_worth });
  }

  return {
    scenario_name: result.scenario_name,
    projection_period: `${result.start_year}–${result.end_year}`,
    final_super: last.total_super,
    final_net_worth: last.net_worth,
    depletion_age: depletionAge,
    retirement_age: retirementAge,
    retirement_spending_target: retirementSpendingTarget,
    total_pension: totalPension,
    years_in_deficit: Math.round(deficitMonths / 12),
    opening_position: {
      net_worth: first.net_worth,
      total_assets: first.total_assets,
      total_super: first.total_super,
      total_liabilities: first.total_liabilities,
    },
    closing_position: {
      net_worth: last.net_worth,
      total_assets: last.total_assets,
      total_super: last.total_super,
      total_liabilities: last.total_liabilities,
    },
    net_worth_growth: last.net_worth - first.net_worth,
    milestones,
    net_worth_trajectory: legacyTrajectory,
    trajectory: buildTrajectory(result),
    yearly_detail: buildYearlyDetail(result),
    warnings: result.warnings,
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function findDepletionAge(result: ProjectionResult): number | null {
  let prevSuper = -1;

  for (const snap of result.snapshots) {
    if (prevSuper > 0 && snap.total_super <= 0) {
      // Super just hit zero — find the primary person's age at this point
      const person = snap.persons[0];
      return person?.age ?? null;
    }
    prevSuper = snap.total_super;
  }

  return null;
}

function findMilestones(
  result: ProjectionResult,
): ProjectionSummary['milestones'] {
  const milestones: ProjectionSummary['milestones'] = [];
  const snapshots = result.snapshots;

  let prevPension = 0;
  const paidOffLiabilities = new Set<string>();

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];

    // Age Pension commences
    if (snap.age_pension_monthly > 0 && prevPension === 0) {
      milestones.push({
        year: snap.year,
        month: snap.month,
        event: 'Age Pension commences',
        amount: snap.age_pension_monthly * 12,
      });
    }
    prevPension = snap.age_pension_monthly;

    // Liability paid off
    for (const [id, balance] of Object.entries(snap.liability_balances)) {
      if (balance <= 0 && !paidOffLiabilities.has(id)) {
        const prev = i > 0
          ? (snapshots[i - 1].liability_balances[id] ?? 0)
          : 1;
        if (prev > 0) {
          paidOffLiabilities.add(id);
          milestones.push({
            year: snap.year,
            month: snap.month,
            event: `Liability '${id}' paid off`,
          });
        }
      }
    }
  }

  return milestones;
}

function emptySummary(result: ProjectionResult): ProjectionSummary {
  return {
    scenario_name: result.scenario_name,
    projection_period: `${result.start_year}–${result.end_year}`,
    final_super: 0,
    final_net_worth: 0,
    depletion_age: null,
    retirement_age: null,
    retirement_spending_target: null,
    total_pension: 0,
    years_in_deficit: 0,
    opening_position: { net_worth: 0, total_assets: 0, total_super: 0, total_liabilities: 0 },
    closing_position: { net_worth: 0, total_assets: 0, total_super: 0, total_liabilities: 0 },
    net_worth_growth: 0,
    milestones: [],
    net_worth_trajectory: [],
    trajectory: [],
    yearly_detail: [],
    warnings: result.warnings,
  };
}

// ── Trajectory & Yearly Detail Builders ──────────────────────────────────────

function buildTrajectory(result: ProjectionResult): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const snaps = result.snapshots;

  const metadata = result.metadata as Record<string, unknown>;
  const retirementAge =
    typeof metadata?.retirement_age === 'number' ? metadata.retirement_age : 67;
  const projectionScope = metadata?.projection_scope as string | undefined;
  const retirementSpendingTarget =
    typeof metadata?.retirement_spending_target === 'number'
      ? metadata.retirement_spending_target
      : 0;

  const fyMetadataByYear = (metadata?.fy_metadata_by_year ?? []) as Array<{
    fy: number;
    fyGrossShortfall: number;
    fySecondaryCash: number;
    fySecondaryFixedInterest: number;
    fySecondarySuper: number;
    fySecondaryShares: number;
    fySecondaryProperty: number;
    fyLumpSum: number;
  }>;
  const fyMetaByFy = new Map(fyMetadataByYear.map((m) => [m.fy, m]));

  function pushPoint(
    s: (typeof snaps)[0],
    startIdx: number,
    endIdx: number,
  ): void {
    const person = s.persons[0];
    const age = person?.age ?? 0;

    let pensionAnnual = 0;
    let superDrawdownAnnual = 0;
    let employmentIncomeGrossAnnual = 0;
    let totalTaxAnnual = 0;
    let totalGrossIncomeAnnual = 0;
    for (let j = startIdx; j <= endIdx && j < snaps.length; j++) {
      const snap = snaps[j];
      pensionAnnual += snap.age_pension_monthly;
      superDrawdownAnnual += snap.total_super_pension_income;
      employmentIncomeGrossAnnual += snap.total_employment_income;
      totalTaxAnnual += snap.total_tax;
      totalGrossIncomeAnnual += snap.total_gross_income;
    }

    const nonSuperAssetTotal = Math.max(
      0,
      s.total_assets - s.total_super,
    );

    let nonSuperIncomeAnnual = 0;
    let nonSuperDrawdownCashAnnual = 0;
    let nonSuperDrawdownSaleAnnual = 0;
    let superDrawdownAdditionalAnnual = 0;
    for (let j = startIdx; j <= endIdx && j < snaps.length; j++) {
      const snap = snaps[j] as {
        total_asset_income?: number;
        drawdown_cash_this_month?: number;
        drawdown_sale_this_month?: number;
        drawdown_super_additional_this_month?: number;
      };
      nonSuperIncomeAnnual += snap.total_asset_income ?? 0;
      nonSuperDrawdownCashAnnual += snap.drawdown_cash_this_month ?? 0;
      nonSuperDrawdownSaleAnnual += snap.drawdown_sale_this_month ?? 0;
      superDrawdownAdditionalAnnual += snap.drawdown_super_additional_this_month ?? 0;
    }

    const superDrawdownMinAnnual = Math.max(
      0,
      superDrawdownAnnual - superDrawdownAdditionalAnnual,
    );

    // Effective tax rate method: tax on total taxable income, then net each component.
    // totalTaxableGross excludes super pension (tax-free 60+). taxShare applies proportional
    // tax so age_pension_annual and non_super_income_annual are net-of-tax; chart segments
    // sum to target spending.

    const totalTaxableGross = Math.max(
      0.01,
      totalGrossIncomeAnnual - superDrawdownAnnual,
    );
    const taxShare = (gross: number) =>
      totalTaxableGross > 0
        ? Math.max(0, gross - totalTaxAnnual * (gross / totalTaxableGross))
        : gross;

    const employmentIncomeAnnual = taxShare(employmentIncomeGrossAnnual);
    const agePensionAnnualNet = taxShare(pensionAnnual);
    const nonSuperIncomeAnnualNet = taxShare(nonSuperIncomeAnnual);
    const taxRefundAnnual = Math.max(0, -totalTaxAnnual);

    let retirementSpendingTargetForPoint = retirementSpendingTarget;
    if (age >= retirementAge) {
      retirementSpendingTargetForPoint = 0;
      for (let j = startIdx; j <= endIdx && j < snaps.length; j++) {
        retirementSpendingTargetForPoint += snaps[j].total_expenses;
      }
    }

    const fy = getFinancialYear(s.year, s.month);
    const fyMeta = fyMetaByFy.get(fy);

    points.push({
      year: s.year,
      month: s.month,
      age,
      net_worth: s.net_worth,
      super_balance: s.total_super,
      total_assets: s.total_assets,
      total_liabilities: s.total_liabilities,
      age_pension_annual: agePensionAnnualNet,
      super_drawdown_annual: superDrawdownAnnual,
      super_drawdown_min_annual: superDrawdownMinAnnual,
      super_drawdown_additional_annual: superDrawdownAdditionalAnnual,
      non_super_asset_total: nonSuperAssetTotal,
      non_super_income_annual: nonSuperIncomeAnnualNet,
      non_super_drawdown_cash_annual: nonSuperDrawdownCashAnnual,
      non_super_drawdown_sale_annual: nonSuperDrawdownSaleAnnual,
      employment_income_annual: projectionScope === 'super_only' ? 0 : employmentIncomeAnnual,
      is_retirement_year: age >= retirementAge,
      retirement_spending_target: retirementSpendingTargetForPoint,
      gross_shortfall_annual: fyMeta?.fyGrossShortfall,
      secondary_cash_annual: fyMeta?.fySecondaryCash,
      secondary_fixed_interest_annual: fyMeta?.fySecondaryFixedInterest,
      secondary_super_annual: fyMeta?.fySecondarySuper,
      secondary_shares_annual: fyMeta?.fySecondaryShares,
      secondary_property_annual: fyMeta?.fySecondaryProperty,
      lump_sum_annual: fyMeta?.fyLumpSum,
      tax_refund_annual: taxRefundAnnual,
    });
  }

  // FY-aligned windows (July–June), same as buildYearlyDetail
  for (let fyStart = 0; fyStart < snaps.length; fyStart += 12) {
    const fyEnd = Math.min(fyStart + 12, snaps.length);
    const lastSnap = snaps[fyEnd - 1];
    pushPoint(lastSnap, fyStart, fyEnd - 1);
  }

  return points;
}

function buildYearlyDetail(result: ProjectionResult): YearlyDetail[] {
  const details: YearlyDetail[] = [];
  const snaps = result.snapshots;
  const netContributionRate = 1 - CONTRIBUTIONS_TAX_RATE;
  const metadata = result.metadata as Record<string, unknown>;
  const retirementAge =
    typeof metadata?.retirement_age === 'number' ? metadata.retirement_age : 67;
  const projectionScope = metadata?.projection_scope as string | undefined;

  for (let fyStart = 0; fyStart < snaps.length; fyStart += 12) {
    const fyEnd = Math.min(fyStart + 12, snaps.length);
    const firstMonth = snaps[fyStart];
    const lastMonth = snaps[fyEnd - 1];
    const person = lastMonth.persons[0];

    let grossIncome = 0;
    let employmentIncome = 0;
    let superPensionIncome = 0;
    let agePension = 0;
    let assetIncome = 0;
    let tax = 0;
    let medicare = 0;
    let hecs = 0;
    let expenses = 0;
    let loanRepayments = 0;
    let netCashFlow = 0;
    let sgContributions = 0;
    let voluntaryContributions = 0;
    let investmentReturn = 0;
    let fees = 0;
    let pensionDrawdown = 0;
    let lumpSumWithdrawals = 0;

    for (let i = fyStart; i < fyEnd; i++) {
      const s = snaps[i];
      grossIncome += s.total_gross_income;
      lumpSumWithdrawals += s.lump_sum_withdrawals_this_month ?? 0;
      employmentIncome += s.total_employment_income;
      superPensionIncome += s.total_super_pension_income;
      agePension += s.age_pension_monthly;
      assetIncome += s.total_asset_income;
      tax += s.total_tax;
      expenses += s.total_expenses;
      loanRepayments += s.total_loan_repayments;
      netCashFlow += s.net_cash_flow;

      for (const p of s.persons) {
        medicare += p.medicare_levy;
        hecs += p.hecs_repayment;
        sgContributions += p.super_sg_contributions * netContributionRate;
        voluntaryContributions +=
          p.super_voluntary_concessional * netContributionRate +
          p.super_voluntary_non_concessional;
        investmentReturn += p.super_investment_return;
        fees += p.super_fees;
        pensionDrawdown += p.super_pension_drawdown;
      }
    }

    const openingSuper = fyStart > 0
      ? snaps[fyStart - 1].total_super
      : firstMonth.total_super;

    const age = person?.age ?? 0;
    const effectiveEmploymentIncome =
      projectionScope === 'super_only' && age >= retirementAge ? 0 : employmentIncome;

    // #region agent log
    fetch('http://127.0.0.1:7587/ingest/9194df1b-2a00-4be9-ae88-babf17f415a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'40eead'},body:JSON.stringify({sessionId:'40eead',location:'api.ts:buildYearlyDetail',message:'lump_sum_withdrawals per FY',data:{fy:lastMonth.year,age:person?.age,lump_sum_withdrawals:lumpSumWithdrawals},timestamp:Date.now(),hypothesisId:'H4',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    details.push({
      financial_year: lastMonth.year,
      age,
      gross_income: grossIncome,
      employment_income: effectiveEmploymentIncome,
      super_pension_income: superPensionIncome,
      age_pension: agePension,
      asset_income: assetIncome,
      tax,
      medicare_levy: medicare,
      hecs_repayment: hecs,
      net_income: grossIncome - tax,
      expenses,
      loan_repayments: loanRepayments,
      net_cash_flow: netCashFlow,
      super_balance: lastMonth.total_super,
      total_assets: lastMonth.total_assets,
      total_liabilities: lastMonth.total_liabilities,
      net_worth: lastMonth.net_worth,
      opening_super_balance: openingSuper,
      sg_contributions: sgContributions,
      voluntary_contributions: voluntaryContributions,
      investment_return: investmentReturn,
      fees,
      pension_drawdown: pensionDrawdown,
      lump_sum_withdrawals: lumpSumWithdrawals > 0 ? lumpSumWithdrawals : null,
    });
  }

  return details;
}
