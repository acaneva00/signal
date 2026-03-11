/**
 * Converts flat user profile data (from financial_profiles.profile_data)
 * into a Scenario object the projection engine can consume.
 *
 * Handles field-name aliases (income vs annual_income), band-to-value
 * estimation (age_range → date_of_birth_year), and conditional field pruning
 * (skip mortgage questions for renters).
 */

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
  date_of_birth_year: 1,
  income: 2,
  super_balance: 3,
  intended_retirement_age: 4,
  expenses: 5,
  is_homeowner: 6,
  relationship_status: 7,
  has_hecs_help_debt: 8,
  hecs_help_balance: 9,
  mortgage_balance: 10,
  mortgage_rate: 11,
  mortgage_repayment: 12,
  assets: 13,
  liabilities: 14,
  super_fees: 15,
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
  return fields.filter((field) => {
    if (field === 'hecs_help_balance') {
      const hasHecs = resolveProfileField(profile, 'has_hecs_help_debt');
      if (hasHecs === false) return false;
    }

    if (['mortgage_balance', 'mortgage_rate', 'mortgage_repayment'].includes(field)) {
      const isHomeowner = resolveProfileField(profile, 'is_homeowner');
      if (isHomeowner === false) return false;
    }

    return true;
  });
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

// ── Scenario Builder ─────────────────────────────────────────────────────────

/**
 * Build a Scenario-shaped plain object from resolved profile fields and
 * optional overrides. The result is passed to `runProjection()` which
 * validates it via Zod and fills remaining defaults.
 */
export function buildScenarioFromProfile(
  resolvedData: Record<string, unknown>,
  overrides?: ScenarioOverrides,
  scenarioName?: string,
): Record<string, unknown> {
  const currentYear = new Date().getFullYear();
  const dobYear = resolvedData.date_of_birth_year as number | undefined;
  const retirementAge =
    overrides?.retirement_age ??
    (resolvedData.intended_retirement_age as number | undefined) ??
    67;
  const currentAge = dobYear ? currentYear - dobYear : 40;
  const projectionYears = overrides?.projection_years ?? Math.max(90 - currentAge, 10);
  const isHomeowner = resolvedData.is_homeowner === true;
  const hasHecs = resolvedData.has_hecs_help_debt === true;

  // ── Person ──
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

  // ── Household ──
  const household: Record<string, unknown> = {
    members: [person],
    relationship_status: mapRelationship(resolvedData.relationship_status),
    num_dependents: parseDependants(resolvedData.dependants_count),
    dependents_ages: [],
  };

  // ── Income ──
  const incomeStreams: Record<string, unknown>[] = [];
  const income = resolvedData.income as number | undefined;
  if (income && income > 0) {
    incomeStreams.push({
      person_id: 'person_1',
      income_type: 'employment',
      gross_annual: income,
      includes_super: false,
      growth_rate: overrides?.wage_growth_rate ?? 0.035,
    });
  }

  // ── Super ──
  const superFunds: Record<string, unknown>[] = [];
  const superBalance = resolvedData.super_balance as number | undefined;
  if (superBalance !== undefined) {
    superFunds.push({
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

  // ── Expenses ──
  const expenses: Record<string, unknown>[] = [];
  const expenseAmount = (resolvedData.expenses as number | undefined) ?? overrides?.annual_expenses;
  if (expenseAmount && expenseAmount > 0) {
    expenses.push({
      name: 'Living expenses',
      category: 'essential',
      annual_amount: expenseAmount,
      inflation_adjusted: true,
    });
  }

  // ── Liabilities ──
  const liabilities: Record<string, unknown>[] = [];
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

  // ── Assets ──
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

  // ── Assumptions (PRD: use economic.ts defaults, not engine defaults) ──
  const assumptions: Record<string, unknown> = {
    inflation_rate: overrides?.inflation_rate ?? 0.025,
    wage_growth_rate: overrides?.wage_growth_rate ?? 0.035,
  };

  return {
    name: scenarioName ?? 'Projection',
    start_year: currentYear,
    projection_years: projectionYears,
    household,
    income_streams: incomeStreams,
    expenses,
    assets,
    super_funds: superFunds,
    liabilities,
    scheduled_cash_flows: [],
    assumptions,
  };
}
