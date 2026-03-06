/**
 * Engine API — JSON-in / JSON-out interface
 *
 * These are the ONLY functions that agents call. No agent imports a
 * sub-module directly; everything goes through this boundary.
 */

import { z } from 'zod';
import { ScenarioSchema, type ProjectionResult } from './models';
import { project } from './engine';

// ── Intent → Required Profile Fields ─────────────────────────────────────────

const REQUIRED_VARIABLES: Record<string, string[]> = {
  super_at_age: [
    'date_of_birth_year',
    'income',
    'super_balance',
  ],
  super_longevity: [
    'date_of_birth_year',
    'income',
    'super_balance',
    'intended_retirement_age',
    'expenses',
    'is_homeowner',
  ],
  take_home_pay: [
    'income',
    'has_hecs_help_debt',
    'hecs_help_balance',
  ],
  aged_pension: [
    'date_of_birth_year',
    'relationship_status',
    'is_homeowner',
    'assets',
    'super_balance',
  ],
  compare_retirement_age: [
    'date_of_birth_year',
    'income',
    'super_balance',
    'intended_retirement_age',
    'expenses',
  ],
  fee_impact: [
    'super_balance',
    'super_fees',
  ],
  extra_mortgage_payment: [
    'mortgage_balance',
    'mortgage_rate',
    'mortgage_repayment',
  ],
  household_net_worth: [
    'date_of_birth_year',
    'relationship_status',
    'income',
    'expenses',
    'assets',
    'super_balance',
    'liabilities',
  ],
};

// ── Result Types ─────────────────────────────────────────────────────────────

export interface ProjectionSummary {
  scenario_name: string;
  projection_period: string;
  final_super: number;
  final_net_worth: number;
  depletion_age: number | null;
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
  warnings: string[];
}

export interface ScenarioComparison {
  scenario_name: string;
  final_net_worth: number;
  final_super: number;
  years_in_deficit: number;
  total_pension: number;
  depletion_age: number | null;
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
  return REQUIRED_VARIABLES[intent] ?? [];
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

  const milestones = findMilestones(result);

  // Sample net worth every 12 months for the trajectory
  const trajectory: ProjectionSummary['net_worth_trajectory'] = [];
  for (let i = 0; i < snapshots.length; i += 12) {
    const s = snapshots[i];
    trajectory.push({ year: s.year, month: s.month, net_worth: s.net_worth });
  }
  if (snapshots.length > 1) {
    trajectory.push({ year: last.year, month: last.month, net_worth: last.net_worth });
  }

  return {
    scenario_name: result.scenario_name,
    projection_period: `${result.start_year}–${result.end_year}`,
    final_super: last.total_super,
    final_net_worth: last.net_worth,
    depletion_age: depletionAge,
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
    net_worth_trajectory: trajectory,
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
    total_pension: 0,
    years_in_deficit: 0,
    opening_position: { net_worth: 0, total_assets: 0, total_super: 0, total_liabilities: 0 },
    closing_position: { net_worth: 0, total_assets: 0, total_super: 0, total_liabilities: 0 },
    net_worth_growth: 0,
    milestones: [],
    net_worth_trajectory: [],
    warnings: result.warnings,
  };
}
