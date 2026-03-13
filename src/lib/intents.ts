/**
 * Centralised Intent Registry
 *
 * Single source of truth for every intent the system supports.
 * All consumers (engine, orchestrator, onboarding, canvas, etc.) derive
 * their intent knowledge from this module rather than maintaining their
 * own hard-coded lists.
 */

// ── Intent Definition ────────────────────────────────────────────────────────

export interface IntentDefinition {
  /** Human-readable short label (e.g. "Super at age") */
  label: string;

  /** One-line description for system prompt classification guidance */
  description: string;

  /** Example user message that maps to this intent */
  exampleQuery: string;

  /** Profile fields the engine requires before it can run this intent */
  requiredFields: readonly string[];

  /**
   * Whether this intent models the full retirement drawdown phase.
   * false = accumulation-only (stops at retirement age).
   */
  fullLifecycle: boolean;

  /** 'calculation' intents use the engine; 'education' is answered directly */
  category: 'calculation' | 'education';

  /**
   * Canvas visualisation hints — which panels to show when this intent
   * produces results.
   */
  canvas: {
    showFeeImpact?: boolean;
    showTaxWaterfall?: boolean;
    showCashFlow?: boolean;
    showBalanceSheet?: boolean;
  };

  /** Plain-English question shown to users as a suggestion */
  plainEnglish: string;
}

// ── The Registry ─────────────────────────────────────────────────────────────

export const INTENTS = {
  super_at_age: {
    label: 'Super at age',
    description: 'Super balance at a specific age ("How much super will I have at 67?")',
    exampleQuery: 'How much super will I have at 67?',
    requiredFields: ['super_fund_name', 'date_of_birth_year', 'income', 'super_balance', 'intended_retirement_age', 'is_default_investment', 'super_investment_option'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: {},
    plainEnglish: 'What will my super balance be when I retire?',
  },
  super_longevity: {
    label: 'Super longevity',
    description: 'Whether super lasts through retirement ("Will my super last?")',
    exampleQuery: 'Will my super last through retirement?',
    requiredFields: [
      'super_fund_name', 'projection_scope',
      'date_of_birth_year', 'income', 'super_balance',
      'intended_retirement_age', 'is_default_investment', 'super_investment_option',
      'relationship_status', 'retirement_expense_strategy',
      'expenses', 'retirement_expenses',
      'is_homeowner',
      'mortgage_balance', 'mortgage_rate', 'mortgage_repayment',
      'assets', 'liabilities', 'surplus_allocation_strategy',
      'partner_date_of_birth_year', 'partner_income', 'partner_super_balance',
      'partner_super_fund_name', 'partner_intended_retirement_age',
      'partner_is_default_investment', 'partner_super_investment_option',
      'dependants_count',
    ],
    fullLifecycle: true,
    category: 'calculation',
    canvas: { showCashFlow: true, showBalanceSheet: true },
    plainEnglish: 'Will my super last through retirement?',
  },
  take_home_pay: {
    label: 'Take-home pay',
    description: 'Take-home pay calculation ("What\'s my take-home pay?")',
    exampleQuery: "What's my take-home pay?",
    requiredFields: ['income', 'has_hecs_help_debt', 'hecs_help_balance'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: { showTaxWaterfall: true },
    plainEnglish: 'How much of my salary actually hits my bank account?',
  },
  aged_pension: {
    label: 'Aged pension',
    description: 'Age pension eligibility and amount ("Will I get the aged pension?")',
    exampleQuery: 'Will I get the aged pension?',
    requiredFields: [
      'date_of_birth_year', 'relationship_status',
      'is_homeowner', 'assets', 'super_balance',
    ],
    fullLifecycle: false,
    category: 'calculation',
    canvas: {},
    plainEnglish: 'Will I qualify for the age pension?',
  },
  compare_retirement_age: {
    label: 'Compare retirement ages',
    description: 'Compare retirement ages ("Retire at 60 vs 67?")',
    exampleQuery: 'Retire at 60 vs 67?',
    requiredFields: ['super_fund_name', 'date_of_birth_year', 'income', 'super_balance', 'intended_retirement_age', 'is_default_investment', 'super_investment_option'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: {},
    plainEnglish: "What's the difference between retiring at 60 vs 65?",
  },
  fee_impact: {
    label: 'Fee impact',
    description: 'Impact of super fund fees over time',
    exampleQuery: 'How much are my super fees costing me?',
    requiredFields: ['super_balance', 'super_fees'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: { showFeeImpact: true },
    plainEnglish: 'How much are my super fees costing me?',
  },
  extra_mortgage_payment: {
    label: 'Extra mortgage payment',
    description: 'Impact of extra mortgage payments',
    exampleQuery: 'What if I pay an extra $200/month on my mortgage?',
    requiredFields: ['mortgage_balance', 'mortgage_rate', 'mortgage_repayment'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: {},
    plainEnglish: 'How much does an extra $X/month cut off my mortgage?',
  },
  household_net_worth: {
    label: 'Household net worth',
    description: 'Household net worth projection',
    exampleQuery: "What's my household net worth trajectory?",
    requiredFields: [
      'date_of_birth_year', 'relationship_status', 'income',
      'expenses', 'assets', 'super_balance', 'liabilities',
    ],
    fullLifecycle: false,
    category: 'calculation',
    canvas: { showCashFlow: true, showBalanceSheet: true },
    plainEnglish: "What's my household net worth trajectory?",
  },
  compare_fund: {
    label: 'Compare super fund',
    description:
      "User wants to compare their current super fund's fees with another fund or the market",
    exampleQuery: 'How does my super compare with AustralianSuper?',
    requiredFields: ['super_fund_name', 'date_of_birth_year', 'super_balance'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: { showFeeImpact: true },
    plainEnglish: 'How do my super fund fees compare?',
  },
  compare_super_projection: {
    label: 'Compare super balance projection',
    description: 'Compare super balance at retirement across different funds ("How would my balance compare if I switched to Aussie?")',
    exampleQuery: 'How would my super at retirement compare if I was with Aussie instead?',
    requiredFields: ['super_fund_name', 'date_of_birth_year', 'income', 'super_balance', 'intended_retirement_age', 'is_default_investment', 'super_investment_option'],
    fullLifecycle: false,
    category: 'calculation',
    canvas: { showFeeImpact: true },
    plainEnglish: 'How would my super compare at retirement if I switched funds?',
  },
  compare_super_longevity: {
    label: 'Compare super longevity',
    description: 'Compare how long super lasts across funds — super only, no non-super assets ("Which fund would make my super last longer?")',
    exampleQuery: 'Which fund would make my super last longer in retirement?',
    requiredFields: [
      'super_fund_name', 'date_of_birth_year', 'income', 'super_balance',
      'intended_retirement_age', 'is_default_investment', 'super_investment_option',
      'relationship_status', 'retirement_expense_strategy',
    ],
    fullLifecycle: true,
    category: 'calculation',
    canvas: { showCashFlow: true, showBalanceSheet: true },
    plainEnglish: 'Which fund would make my super last longer?',
  },
  education: {
    label: 'General education',
    description: 'General financial question — answer directly without the engine',
    exampleQuery: 'What is salary sacrifice?',
    requiredFields: [],
    fullLifecycle: false,
    category: 'education',
    canvas: {},
    plainEnglish: 'General financial question',
  },
} as const satisfies Record<string, IntentDefinition>;

// ── Derived Types ────────────────────────────────────────────────────────────

/** Union of all known intent name strings */
export type IntentName = keyof typeof INTENTS;

/** Only intents that use the calculation engine */
export type CalculationIntentName = {
  [K in IntentName]: (typeof INTENTS)[K]['category'] extends 'calculation' ? K : never;
}[IntentName];

// ── Derived Constants ────────────────────────────────────────────────────────

/** All intent name strings */
export const INTENT_NAMES = Object.keys(INTENTS) as IntentName[];

/** Only calculation intent names (used in tool enum, etc.) */
export const CALCULATION_INTENT_NAMES = INTENT_NAMES.filter(
  (k) => INTENTS[k].category === 'calculation',
) as CalculationIntentName[];

/** Set of intents that model the full retirement drawdown phase */
export const FULL_LIFECYCLE_INTENTS = new Set<string>(
  INTENT_NAMES.filter((k) => INTENTS[k].fullLifecycle),
);

// ── Accessor Functions ───────────────────────────────────────────────────────

/**
 * Get the required profile fields for an intent.
 * Returns an empty array for unknown intents.
 */
export function getRequiredFields(intent: string): string[] {
  const def = INTENTS[intent as IntentName];
  return [...(def?.requiredFields ?? [])];
}

/**
 * Check whether a string is a known intent name.
 */
export function isValidIntent(intent: string): intent is IntentName {
  return intent in INTENTS;
}

/**
 * Check whether an intent is a calculation intent (uses the engine).
 */
export function isCalculationIntent(intent: string): intent is CalculationIntentName {
  return isValidIntent(intent) && INTENTS[intent].category === 'calculation';
}

/**
 * Get the IntentDefinition for a given intent name.
 * Returns undefined for unknown intents.
 */
export function getIntentDefinition(intent: string): IntentDefinition | undefined {
  return INTENTS[intent as IntentName];
}

/**
 * Get the plain-English description of an intent (for user-facing suggestions).
 */
export function getPlainEnglish(intent: string): string | undefined {
  return INTENTS[intent as IntentName]?.plainEnglish;
}

/**
 * Build the INTENTS block for the system prompt from the registry.
 */
export function buildIntentPromptBlock(): string {
  return INTENT_NAMES.map(
    (name) => `- ${name}: ${INTENTS[name].description}`,
  ).join('\n');
}

/**
 * Canvas visibility flags for a given intent.
 */
export function getCanvasFlags(intent: string | null): {
  showFeeImpact: boolean;
  showTaxWaterfall: boolean;
  showCashFlow: boolean;
  showBalanceSheet: boolean;
} {
  if (!intent || !isValidIntent(intent)) {
    return { showFeeImpact: false, showTaxWaterfall: false, showCashFlow: false, showBalanceSheet: false };
  }
  const c = INTENTS[intent].canvas as Partial<Record<string, boolean>>;
  return {
    showFeeImpact: c.showFeeImpact ?? false,
    showTaxWaterfall: c.showTaxWaterfall ?? false,
    showCashFlow: c.showCashFlow ?? false,
    showBalanceSheet: c.showBalanceSheet ?? false,
  };
}
