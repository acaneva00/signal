/**
 * Converts flat user profile data (from financial_profiles.profile_data)
 * into a Scenario object the projection engine can consume.
 *
 * Handles field-name aliases (income vs annual_income), band-to-value
 * estimation (age_range → date_of_birth_year), and conditional field pruning
 * (skip mortgage questions for renters).
 */

import { getAnnualBudget } from '@/engine/rates/asfa';

export type ProfileData = Record<string, unknown>;

export interface ScenarioOverrides {
  inflation_rate?: number;
  wage_growth_rate?: number;
  investment_return?: number;
  retirement_investment_return?: number;
  retirement_age?: number;
  annual_expenses?: number;
  extra_super_contribution?: number;
  extra_mortgage_payment?: number;
  super_fees_flat?: number;
  super_fees_percent?: number;
  projection_years?: number;
}

// ── Override → Profile Field Mapping ─────────────────────────────────────────
// Maps scenario override keys to the profile fields they satisfy.
// When a projection provides an override, the corresponding profile field
// no longer needs to exist in the user's stored profile.

export const OVERRIDE_TO_PROFILE_FIELD: Record<string, string> = {
  retirement_age: 'intended_retirement_age',
  annual_expenses: 'expenses',
};

/**
 * Returns the set of profile field names satisfied by the given overrides.
 * E.g. { retirement_age: 62 } satisfies the 'intended_retirement_age' field.
 */
export function getFieldsSatisfiedByOverrides(
  overrides: ScenarioOverrides | undefined,
): Set<string> {
  const satisfied = new Set<string>();
  if (!overrides) return satisfied;
  for (const [overrideKey, profileField] of Object.entries(OVERRIDE_TO_PROFILE_FIELD)) {
    if ((overrides as Record<string, unknown>)[overrideKey] != null) {
      satisfied.add(profileField);
    }
  }
  return satisfied;
}

// ── Band → Value Estimation Tables ───────────────────────────────────────────

const AGE_RANGE_MIDPOINTS: Record<string, number> = {
  '18–25': 22, '18-25': 22,
  '26–35': 31, '26-35': 31,
  '36–45': 41, '36-45': 41,
  '46–55': 51, '46-55': 51,
  '56–65': 61, '56-65': 61,
  '65+': 68,
};

const INCOME_BAND_ESTIMATES: Record<string, number> = {
  'Under $45K': 35_000,
  '$45K–$90K': 67_500, '$45K-$90K': 67_500,
  '$90K–$135K': 112_500, '$90K-$135K': 112_500,
  '$135K–$200K': 167_500, '$135K-$200K': 167_500,
  '$200K+': 250_000,
};

const SUPER_BAND_ESTIMATES: Record<string, number> = {
  'Under $50K': 25_000,
  '$50K–$150K': 100_000, '$50K-$150K': 100_000,
  '$150K–$400K': 275_000, '$150K-$400K': 275_000,
  '$400K–$800K': 600_000, '$400K-$800K': 600_000,
  '$800K+': 1_000_000,
};

// ── Field Priority (lower = ask first) ───────────────────────────────────────

const FIELD_PRIORITY: Record<string, number> = {
  super_fund_name: 0,
  projection_scope: 1,
  date_of_birth_year: 2,
  income: 3,
  super_balance: 4,
  expenses: 5,
  intended_retirement_age: 6,
  is_default_investment: 7,
  super_investment_option: 8,
  relationship_status: 9,
  retirement_expense_strategy: 10,
  retirement_expenses: 11,
  is_homeowner: 12,
  has_hecs_help_debt: 13,
  hecs_help_balance: 14,
  mortgage_balance: 15,
  mortgage_rate: 16,
  mortgage_repayment: 17,
  assets: 18,
  liabilities: 19,
  surplus_allocation_strategy: 20,
  partner_date_of_birth_year: 21,
  partner_income: 22,
  partner_super_balance: 23,
  partner_super_fund_name: 24,
  partner_intended_retirement_age: 25,
  partner_is_default_investment: 26,
  partner_super_investment_option: 27,
  dependants_count: 28,
  super_fees: 29,
};

export function sortFieldsByPriority(fields: string[]): string[] {
  return [...fields].sort(
    (a, b) => (FIELD_PRIORITY[a] ?? 99) - (FIELD_PRIORITY[b] ?? 99),
  );
}

// ── Field Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve a single profile field, handling aliases and derived values.
 * Returns undefined if the field cannot be resolved from available data.
 */
export function resolveProfileField(profile: ProfileData, field: string): unknown {
  const val = profile[field];
  if (val !== undefined && val !== null) return val;

  switch (field) {
    case 'date_of_birth_year': {
      if (typeof profile.age_range === 'string') {
        const mid = AGE_RANGE_MIDPOINTS[profile.age_range];
        if (mid) return new Date().getFullYear() - mid;
      }
      if (typeof profile.age === 'number') return new Date().getFullYear() - profile.age;
      return undefined;
    }
    case 'income': {
      if (profile.annual_income != null) return profile.annual_income;
      if (typeof profile.income_band === 'string') return INCOME_BAND_ESTIMATES[profile.income_band];
      return undefined;
    }
    case 'super_balance': {
      if (typeof profile.super_balance_band === 'string') {
        if (profile.super_balance_band === 'No idea') return undefined;
        return SUPER_BAND_ESTIMATES[profile.super_balance_band as string];
      }
      return undefined;
    }
    case 'is_homeowner': {
      if (typeof profile.housing_status === 'string') {
        return ['own_with_mortgage', 'own_outright'].includes(profile.housing_status);
      }
      return undefined;
    }
    case 'relationship_status': {
      const rs = profile.relationship_status;
      if (typeof rs === 'string') {
        const lower = rs.toLowerCase();
        if (['married', 'partnered', 'partnered/de facto', 'de facto'].includes(lower)) return 'partnered';
        return 'single';
      }
      return undefined;
    }
    case 'expenses':
      return profile.total_expenses ?? profile.estimated_expenses ?? undefined;
    case 'assets':
      return profile.total_assets ?? undefined;
    case 'liabilities':
      return profile.total_liabilities ?? undefined;
    case 'has_hecs_help_debt':
      return profile.hecs_debt ?? profile.has_hecs ?? undefined;
    case 'hecs_help_balance':
      return profile.hecs_balance ?? undefined;
    case 'intended_retirement_age':
      return profile.retirement_age ?? undefined;
    case 'super_fees':
      return profile.super_fund_fees ?? undefined;
    case 'is_default_investment': {
      const v = profile.is_default_investment;
      if (typeof v === 'boolean') return v;
      if (v === 'true') return true;
      if (v === 'false') return false;
      return undefined;
    }
    case 'super_investment_option':
      return profile.super_investment_option ?? undefined;
    case 'retirement_expense_strategy':
      return profile.retirement_expense_strategy ?? undefined;
    case 'retirement_expenses':
      return profile.retirement_expenses ?? undefined;
    case 'projection_scope':
      return profile.projection_scope ?? undefined;
    case 'surplus_allocation_strategy':
      return profile.surplus_allocation_strategy ?? undefined;
    case 'partner_date_of_birth_year':
      return profile.partner_date_of_birth_year ?? undefined;
    case 'partner_income':
      return profile.partner_income ?? undefined;
    case 'partner_super_balance':
      return profile.partner_super_balance ?? undefined;
    case 'partner_super_fund_name':
      return profile.partner_super_fund_name ?? undefined;
    case 'partner_intended_retirement_age':
      return profile.partner_intended_retirement_age ?? undefined;
    case 'partner_is_default_investment': {
      const pv = profile.partner_is_default_investment;
      if (typeof pv === 'boolean') return pv;
      if (pv === 'true') return true;
      if (pv === 'false') return false;
      return undefined;
    }
    case 'partner_super_investment_option':
      return profile.partner_super_investment_option ?? undefined;
    case 'dependants_count':
      return profile.dependants_count ?? undefined;
    default:
      return undefined;
  }
}

// ── Availability Check ───────────────────────────────────────────────────────

/**
 * Given a set of required fields, determine which are available and which
 * are missing. Applies conditional pruning first (e.g. skip mortgage fields
 * for non-homeowners).
 */
export function checkFieldAvailability(
  profile: ProfileData,
  requiredFields: string[],
): { available: Record<string, unknown>; missing: string[] } {
  const adjusted = applyConditionalLogic(requiredFields, profile);
  const available: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const field of adjusted) {
    const value = resolveProfileField(profile, field);
    if (value !== undefined && value !== null) {
      available[field] = value;
    } else {
      missing.push(field);
    }
  }

  return { available, missing: sortFieldsByPriority(missing) };
}

/**
 * Remove fields that are irrelevant given what we already know about the user.
 */
function applyConditionalLogic(fields: string[], profile: ProfileData): string[] {
  const hasProjectionScope = fields.includes('projection_scope');
  const scope = hasProjectionScope
    ? resolveProfileField(profile, 'projection_scope') as string | undefined
    : undefined;

  const FULL_MODEL_ONLY_FIELDS = new Set([
    'mortgage_balance', 'mortgage_rate', 'mortgage_repayment',
    'assets', 'liabilities', 'surplus_allocation_strategy',
  ]);

  const PARTNER_FIELDS = new Set([
    'partner_date_of_birth_year', 'partner_income', 'partner_super_balance',
    'partner_super_fund_name', 'partner_intended_retirement_age',
    'partner_is_default_investment', 'partner_super_investment_option',
    'dependants_count',
  ]);

  return fields.filter((field) => {
    // Skip default-investment question when the fund has no default/MySuper option
    if (field === 'is_default_investment') {
      if (profile._fund_has_default_option === false) return false;
    }
    if (field === 'partner_is_default_investment') {
      if (profile._partner_fund_has_default_option === false) return false;
    }

    if (field === 'super_investment_option') {
      // Also skip when fund has no default (implies no chooseable options)
      if (profile._fund_has_default_option === false) return false;
      const isDefault = resolveProfileField(profile, 'is_default_investment');
      if (isDefault === true) return false;
    }

    if (field === 'hecs_help_balance') {
      const hasHecs = resolveProfileField(profile, 'has_hecs_help_debt');
      if (hasHecs === false) return false;
    }

    if (['mortgage_balance', 'mortgage_rate', 'mortgage_repayment'].includes(field)) {
      const isHomeowner = resolveProfileField(profile, 'is_homeowner');
      if (isHomeowner === false) return false;
    }

    // Full-model-only fields: hide until projection_scope = full_model
    if (hasProjectionScope && FULL_MODEL_ONLY_FIELDS.has(field)) {
      if (!scope || scope !== 'full_model') return false;
    }

    // Partner fields: only when full_model AND partnered/married
    if (PARTNER_FIELDS.has(field)) {
      if (!scope || scope !== 'full_model') return false;
      const rs = resolveProfileField(profile, 'relationship_status') as string | undefined;
      if (!rs || !['partnered', 'married'].includes(rs)) return false;
    }

    // Partner investment option: skip if fund has no default, or partner is in default
    if (field === 'partner_super_investment_option') {
      if (profile._partner_fund_has_default_option === false) return false;
      const partnerDefault = resolveProfileField(profile, 'partner_is_default_investment');
      if (partnerDefault === true) return false;
    }

    // Expense field conditional logic depends on projection scope
    if ((field === 'expenses' || field === 'retirement_expenses') && fields.includes('retirement_expense_strategy')) {
      const strategy = resolveProfileField(profile, 'retirement_expense_strategy');

      if (field === 'expenses') {
        // In full_model, expenses are always required (drives pre-retirement cash flow)
        if (scope === 'full_model') return true;
        // In super_only (or no scope), only needed for current_spending strategy
        if (!strategy) return false;
        if (strategy !== 'current_spending') return false;
      }

      if (field === 'retirement_expenses') {
        if (!strategy) return false;
        if (strategy !== 'custom') return false;
      }
    }

    return true;
  });
}

// ── Retirement Expense Resolution ────────────────────────────────────────────

/**
 * Resolve the annual retirement expense amount based on the user's chosen strategy.
 * ASFA options use single/couple values from the ASFA Retirement Standard.
 * Returns null if the strategy or required data is not yet available.
 */
export function resolveRetirementExpenses(
  resolvedData: Record<string, unknown>,
): number | null {
  const strategy = resolvedData.retirement_expense_strategy as string | undefined;
  if (!strategy) return null;

  const isCouple = ['partnered', 'married'].includes(
    (resolvedData.relationship_status as string) ?? 'single',
  );

  switch (strategy) {
    case 'asfa_modest':
      return getAnnualBudget('modest', isCouple);
    case 'asfa_comfortable':
      return getAnnualBudget('comfortable', isCouple);
    case 'current_spending':
      return (resolvedData.expenses as number) ?? null;
    case 'custom':
      return (resolvedData.retirement_expenses as number) ?? null;
    default:
      return null;
  }
}

// ── Employment / Relationship Mapping ────────────────────────────────────────

function mapEmploymentStatus(raw: unknown): string {
  if (typeof raw !== 'string') return 'employed';
  const lower = raw.toLowerCase();
  if (lower.includes('self')) return 'self_employed';
  if (lower.includes('retired')) return 'retired';
  if (lower.includes('not working') || lower.includes('not_working')) return 'not_working';
  return 'employed';
}

function mapRelationship(raw: unknown): string {
  if (typeof raw !== 'string') return 'single';
  const lower = raw.toLowerCase();
  if (['married', 'partnered', 'partnered/de facto', 'de facto'].includes(lower)) return 'partnered';
  return 'single';
}

function parseDependants(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val === 'None' || val === '0') return 0;
    if (val === '4+') return 4;
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ── Surplus Allocation Presets ────────────────────────────────────────────────

export type SurplusStrategyName = 'balanced' | 'aggressive_debt' | 'super_boost' | 'investment_focused';

const SURPLUS_PRESETS: Record<SurplusStrategyName, Record<string, unknown>[]> = {
  balanced: [
    { type: 'emergency_buffer' },
    { type: 'extra_debt_repayment', strategy: 'avalanche' },
    { type: 'remainder_to_cash' },
  ],
  aggressive_debt: [
    { type: 'emergency_buffer' },
    { type: 'extra_debt_repayment', strategy: 'avalanche' },
    { type: 'remainder_to_cash' },
  ],
  super_boost: [
    { type: 'emergency_buffer' },
    { type: 'extra_debt_repayment', strategy: 'avalanche' },
    { type: 'super_contribution', monthly_amount: 2500 },
    { type: 'remainder_to_cash' },
  ],
  investment_focused: [
    { type: 'emergency_buffer' },
    { type: 'extra_debt_repayment', strategy: 'avalanche' },
    { type: 'investment_contribution', monthly_amount: 2000 },
    { type: 'remainder_to_cash' },
  ],
};

// ── Shared Scenario Helpers ──────────────────────────────────────────────────

function buildPersonData(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
) {
  const currentYear = new Date().getFullYear();
  const dobYear = resolvedData.date_of_birth_year as number | undefined;
  const retirementAge =
    overrides?.retirement_age ??
    (resolvedData.intended_retirement_age as number | undefined) ??
    67;
  const currentAge = dobYear ? currentYear - dobYear : 40;
  const isHomeowner = resolvedData.is_homeowner === true;
  const hasHecs = resolvedData.has_hecs_help_debt === true;

  const person: Record<string, unknown> = {
    id: 'person_1',
    name: '',
    date_of_birth_year: dobYear ?? currentYear - 40,
    gender: 'other',
    is_australian_resident: true,
    employment_status: mapEmploymentStatus(resolvedData.employment_type),
    intended_retirement_age: retirementAge,
    has_hecs_help_debt: hasHecs,
    hecs_help_balance: hasHecs ? ((resolvedData.hecs_help_balance as number) ?? 0) : 0,
    is_homeowner: isHomeowner,
  };

  return { person, currentYear, dobYear, retirementAge, currentAge, isHomeowner, hasHecs };
}

function buildIncomeStreams(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
): Record<string, unknown>[] {
  const streams: Record<string, unknown>[] = [];
  const income = resolvedData.income as number | undefined;
  if (income && income > 0) {
    streams.push({
      person_id: 'person_1',
      income_type: 'employment',
      gross_annual: income,
      includes_super: false,
      growth_rate: overrides?.wage_growth_rate ?? 0.035,
    });
  }
  return streams;
}

function buildSuperFunds(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
): Record<string, unknown>[] {
  const funds: Record<string, unknown>[] = [];
  const superBalance = resolvedData.super_balance as number | undefined;
  if (superBalance !== undefined) {
    funds.push({
      person_id: 'person_1',
      balance: superBalance,
      phase: 'accumulation',
      investment_return: overrides?.investment_return ?? 0.07,
      retirement_investment_return: overrides?.retirement_investment_return ?? 0.05,
      admin_fee_flat: overrides?.super_fees_flat ?? 78,
      admin_fee_percent: overrides?.super_fees_percent ?? 0.007,
      insurance_premium: 0,
      employer_sg_included: true,
      voluntary_concessional: overrides?.extra_super_contribution ?? 0,
      voluntary_non_concessional: 0,
      spouse_contribution: 0,
      pension_drawdown_rate: null,
    });
  }
  return funds;
}

function buildLiabilities(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
): Record<string, unknown>[] {
  const liabilities: Record<string, unknown>[] = [];
  const hasHecs = resolvedData.has_hecs_help_debt === true;

  const mortgageBalance = resolvedData.mortgage_balance as number | undefined;
  if (mortgageBalance && mortgageBalance > 0) {
    const baseRepayment = resolvedData.mortgage_repayment as number | undefined;
    const extra = overrides?.extra_mortgage_payment ?? 0;
    liabilities.push({
      id: 'mortgage_1',
      name: 'Home loan',
      liability_type: 'home_loan',
      current_balance: mortgageBalance,
      interest_rate: (resolvedData.mortgage_rate as number) ?? 0.06,
      repayment_type: 'principal_and_interest',
      annual_repayment: baseRepayment ? (baseRepayment + extra) * 12 : null,
      remaining_term_years: 25,
    });
  }

  if (hasHecs && resolvedData.hecs_help_balance) {
    liabilities.push({
      id: 'hecs_1',
      name: 'HECS-HELP',
      liability_type: 'hecs_help',
      current_balance: resolvedData.hecs_help_balance as number,
      interest_rate: 0,
      repayment_type: 'principal_and_interest',
      remaining_term_years: 15,
    });
  }

  return liabilities;
}

function buildNonSuperAssets(
  resolvedData: Record<string, unknown>,
): Record<string, unknown>[] {
  const assets: Record<string, unknown>[] = [];
  const isHomeowner = resolvedData.is_homeowner === true;

  if (isHomeowner && resolvedData.property_value) {
    assets.push({
      id: 'home_1',
      name: 'Primary residence',
      asset_class: 'property_home',
      current_value: resolvedData.property_value as number,
      is_primary_residence: true,
      is_centrelink_assessable: false,
      is_deemed: false,
    });
  }

  const totalAssets = resolvedData.assets as number | undefined;
  if (totalAssets && totalAssets > 0) {
    assets.push({
      id: 'other_assets_1',
      name: 'Other assessable assets',
      asset_class: 'mixed_balanced',
      current_value: totalAssets,
      growth_rate: 0.05,
      income_yield: 0.03,
      is_centrelink_assessable: true,
      is_deemed: true,
    });
  }

  return assets;
}

// ── Scenario Builder ─────────────────────────────────────────────────────────

/**
 * Build a Scenario-shaped plain object from resolved profile fields and
 * optional overrides. Dispatches to scope-specific builders based on
 * projection_scope. The result is passed to `runProjection()` which
 * validates it via Zod and fills remaining defaults.
 */
export function buildScenarioFromProfile(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
  scenarioName?: string,
): Record<string, unknown> {
  const scope = resolvedData.projection_scope as string | undefined;
  const relationship = resolvedData.relationship_status as string | undefined;
  const isPartnered = ['partnered', 'married'].includes(relationship ?? '');

  if (scope === 'full_model' && isPartnered) {
    return buildCoupleScenario(resolvedData, overrides, scenarioName);
  }
  if (scope === 'full_model') {
    return buildFullSingleScenario(resolvedData, overrides, scenarioName);
  }
  return buildSuperOnlyScenario(resolvedData, overrides, scenarioName);
}

/**
 * Super-only scenario: 1 person, 1 super fund, retirement expenses only.
 * No pre-retirement expenses, no non-super assets.
 */
function buildSuperOnlyScenario(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
  scenarioName?: string,
): Record<string, unknown> {
  const { person, currentYear, dobYear, retirementAge, currentAge, isHomeowner } =
    buildPersonData(resolvedData, overrides);
  const projectionYears = overrides?.projection_years ?? Math.max(90 - currentAge, 10);

  const household: Record<string, unknown> = {
    members: [person],
    relationship_status: mapRelationship(resolvedData.relationship_status),
    num_dependents: parseDependants(resolvedData.dependants_count),
    dependents_ages: [],
  };

  const expenses: Record<string, unknown>[] = [];
  const retirementStrategy = resolvedData.retirement_expense_strategy as string | undefined;
  if (retirementStrategy) {
    const retExpenseAmount = resolveRetirementExpenses(resolvedData);
    if (retExpenseAmount && retExpenseAmount > 0) {
      const retirementYear = dobYear
        ? dobYear + retirementAge
        : currentYear + (retirementAge - currentAge);
      expenses.push({
        name: 'Retirement expenses',
        category: 'essential',
        annual_amount: retExpenseAmount,
        inflation_adjusted: true,
        start_year: retirementYear,
      });
    }
  } else {
    const expenseAmount = (resolvedData.expenses as number | undefined) ?? overrides?.annual_expenses;
    if (expenseAmount && expenseAmount > 0) {
      expenses.push({
        name: 'Living expenses',
        category: 'essential',
        annual_amount: expenseAmount,
        inflation_adjusted: true,
      });
    }
  }

  const assets: Record<string, unknown>[] = [];
  if (isHomeowner && resolvedData.property_value) {
    assets.push({
      id: 'home_1',
      name: 'Primary residence',
      asset_class: 'property_home',
      current_value: resolvedData.property_value as number,
      is_primary_residence: true,
      is_centrelink_assessable: false,
      is_deemed: false,
    });
  }

  const assumptions: Record<string, unknown> = {
    inflation_rate: overrides?.inflation_rate ?? 0.025,
    wage_growth_rate: overrides?.wage_growth_rate ?? 0.035,
  };

  return {
    name: scenarioName ?? 'Projection',
    start_year: currentYear,
    projection_years: projectionYears,
    household,
    income_streams: buildIncomeStreams(resolvedData, overrides),
    expenses,
    assets,
    super_funds: buildSuperFunds(resolvedData, overrides),
    liabilities: buildLiabilities(resolvedData, overrides),
    scheduled_cash_flows: [],
    assumptions,
  };
}

/**
 * Full model, single person: full assets, income, expenses, liabilities.
 * Two expense entries: pre-retirement living expenses + retirement expenses.
 * Configurable surplus allocation via strategy presets.
 */
function buildFullSingleScenario(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
  scenarioName?: string,
): Record<string, unknown> {
  const { person, currentYear, dobYear, retirementAge, currentAge } =
    buildPersonData(resolvedData, overrides);
  const projectionYears = overrides?.projection_years ?? Math.max(90 - currentAge, 10);

  const household: Record<string, unknown> = {
    members: [person],
    relationship_status: mapRelationship(resolvedData.relationship_status),
    num_dependents: parseDependants(resolvedData.dependants_count),
    dependents_ages: [],
  };

  const expenses: Record<string, unknown>[] = [];

  // Entry 1: Pre-retirement living expenses (no start_year — applies from today)
  const livingExpenses = (resolvedData.expenses as number | undefined) ?? overrides?.annual_expenses;
  if (livingExpenses && livingExpenses > 0) {
    expenses.push({
      name: 'Living expenses',
      category: 'essential',
      annual_amount: livingExpenses,
      inflation_adjusted: true,
    });
  }

  // Entry 2: Retirement expenses (with start_year — applies from retirement)
  const retExpenseAmount = resolveRetirementExpenses(resolvedData);
  if (retExpenseAmount && retExpenseAmount > 0) {
    const retirementYear = dobYear
      ? dobYear + retirementAge
      : currentYear + (retirementAge - currentAge);
    expenses.push({
      name: 'Retirement expenses',
      category: 'essential',
      annual_amount: retExpenseAmount,
      inflation_adjusted: true,
      start_year: retirementYear,
    });
  }

  const strategyName = (resolvedData.surplus_allocation_strategy as SurplusStrategyName | undefined) ?? 'balanced';
  const surplusRules = SURPLUS_PRESETS[strategyName] ?? SURPLUS_PRESETS.balanced;

  const assumptions: Record<string, unknown> = {
    inflation_rate: overrides?.inflation_rate ?? 0.025,
    wage_growth_rate: overrides?.wage_growth_rate ?? 0.035,
  };

  return {
    name: scenarioName ?? 'Full model projection',
    start_year: currentYear,
    projection_years: projectionYears,
    household,
    income_streams: buildIncomeStreams(resolvedData, overrides),
    expenses,
    assets: buildNonSuperAssets(resolvedData),
    super_funds: buildSuperFunds(resolvedData, overrides),
    liabilities: buildLiabilities(resolvedData, overrides),
    scheduled_cash_flows: [],
    assumptions,
    allocation_rules: {
      surplus_priority: surplusRules,
    },
  };
}

/**
 * Full model, coupled: 2 persons, 2 super funds, 2 income streams,
 * joint/individual assets, combined expenses.
 */
function buildCoupleScenario(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
  scenarioName?: string,
): Record<string, unknown> {
  const currentYear = new Date().getFullYear();
  const p1 = buildPersonData(resolvedData, overrides);
  const projectionYears = overrides?.projection_years ?? Math.max(90 - p1.currentAge, 10);

  // Partner person
  const partnerDobYear = resolvedData.partner_date_of_birth_year as number | undefined;
  const partnerRetAge = (resolvedData.partner_intended_retirement_age as number | undefined) ?? 67;
  const partnerHasHecs = false;
  const person2: Record<string, unknown> = {
    id: 'person_2',
    name: 'Partner',
    date_of_birth_year: partnerDobYear ?? currentYear - 40,
    gender: 'other',
    is_australian_resident: true,
    employment_status: 'employed',
    intended_retirement_age: partnerRetAge,
    has_hecs_help_debt: partnerHasHecs,
    hecs_help_balance: 0,
    is_homeowner: p1.isHomeowner,
  };

  const household: Record<string, unknown> = {
    members: [p1.person, person2],
    relationship_status: 'partnered',
    num_dependents: parseDependants(resolvedData.dependants_count),
    dependents_ages: [],
  };

  // Income streams for both persons
  const incomeStreams = buildIncomeStreams(resolvedData, overrides);
  const partnerIncome = resolvedData.partner_income as number | undefined;
  if (partnerIncome && partnerIncome > 0) {
    incomeStreams.push({
      person_id: 'person_2',
      income_type: 'employment',
      gross_annual: partnerIncome,
      includes_super: false,
      growth_rate: overrides?.wage_growth_rate ?? 0.035,
    });
  }

  // Super funds for both persons
  const superFunds = buildSuperFunds(resolvedData, overrides);
  const partnerSuperBalance = resolvedData.partner_super_balance as number | undefined;
  if (partnerSuperBalance !== undefined) {
    superFunds.push({
      person_id: 'person_2',
      balance: partnerSuperBalance,
      phase: 'accumulation',
      investment_return: overrides?.investment_return ?? 0.07,
      retirement_investment_return: overrides?.retirement_investment_return ?? 0.05,
      admin_fee_flat: (resolvedData._partner_fees_flat as number | undefined) ?? 78,
      admin_fee_percent: (resolvedData._partner_fees_percent as number | undefined) ?? 0.007,
      insurance_premium: 0,
      employer_sg_included: true,
      voluntary_concessional: 0,
      voluntary_non_concessional: 0,
      spouse_contribution: 0,
      pension_drawdown_rate: null,
    });
  }

  // Two expense entries: pre-retirement + retirement (household-level)
  const expenses: Record<string, unknown>[] = [];
  const livingExpenses = (resolvedData.expenses as number | undefined) ?? overrides?.annual_expenses;
  if (livingExpenses && livingExpenses > 0) {
    expenses.push({
      name: 'Living expenses',
      category: 'essential',
      annual_amount: livingExpenses,
      inflation_adjusted: true,
    });
  }

  const retExpenseAmount = resolveRetirementExpenses(resolvedData);
  if (retExpenseAmount && retExpenseAmount > 0) {
    // Use the earlier retirement date of the two persons
    const p1RetYear = p1.dobYear
      ? p1.dobYear + p1.retirementAge
      : currentYear + (p1.retirementAge - p1.currentAge);
    const p2RetYear = partnerDobYear
      ? partnerDobYear + partnerRetAge
      : currentYear + (partnerRetAge - (partnerDobYear ? currentYear - partnerDobYear : 40));
    const retirementYear = Math.min(p1RetYear, p2RetYear);

    expenses.push({
      name: 'Retirement expenses',
      category: 'essential',
      annual_amount: retExpenseAmount,
      inflation_adjusted: true,
      start_year: retirementYear,
    });
  }

  // Assets: joint ownership for property, individual for other assets
  const assets: Record<string, unknown>[] = [];
  if (p1.isHomeowner && resolvedData.property_value) {
    assets.push({
      id: 'home_1',
      name: 'Primary residence',
      asset_class: 'property_home',
      current_value: resolvedData.property_value as number,
      is_primary_residence: true,
      is_centrelink_assessable: false,
      is_deemed: false,
      ownership_type: 'joint',
      ownership_split: { person_1: 0.5, person_2: 0.5 },
    });
  }

  const totalAssets = resolvedData.assets as number | undefined;
  if (totalAssets && totalAssets > 0) {
    assets.push({
      id: 'other_assets_1',
      name: 'Other assessable assets',
      asset_class: 'mixed_balanced',
      current_value: totalAssets,
      growth_rate: 0.05,
      income_yield: 0.03,
      is_centrelink_assessable: true,
      is_deemed: true,
      ownership_type: 'joint',
      ownership_split: { person_1: 0.5, person_2: 0.5 },
    });
  }

  const strategyName = (resolvedData.surplus_allocation_strategy as SurplusStrategyName | undefined) ?? 'balanced';
  const surplusRules = SURPLUS_PRESETS[strategyName] ?? SURPLUS_PRESETS.balanced;

  const assumptions: Record<string, unknown> = {
    inflation_rate: overrides?.inflation_rate ?? 0.025,
    wage_growth_rate: overrides?.wage_growth_rate ?? 0.035,
  };

  return {
    name: scenarioName ?? 'Couple projection',
    start_year: currentYear,
    projection_years: projectionYears,
    household,
    income_streams: incomeStreams,
    expenses,
    assets,
    super_funds: superFunds,
    liabilities: buildLiabilities(resolvedData, overrides),
    scheduled_cash_flows: [],
    assumptions,
    allocation_rules: {
      surplus_priority: surplusRules,
    },
  };
}
