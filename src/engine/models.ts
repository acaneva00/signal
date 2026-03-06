/**
 * Data models for the Australian Cash Flow Engine.
 *
 * All monetary values are in AUD. All rates are decimals (e.g., 0.07 = 7%).
 * This TypeScript implementation uses Zod for runtime validation and type inference.
 */

import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

export const GenderEnum = z.enum(["male", "female", "other"]);
export type Gender = z.infer<typeof GenderEnum>;

export const RelationshipStatusEnum = z.enum([
  "single",
  "partnered", // de facto or married — same for Centrelink
]);
export type RelationshipStatus = z.infer<typeof RelationshipStatusEnum>;

export const EmploymentStatusEnum = z.enum([
  "employed",
  "self_employed",
  "retired",
  "not_working",
]);
export type EmploymentStatus = z.infer<typeof EmploymentStatusEnum>;

export const AssetClassEnum = z.enum([
  "cash",
  "australian_shares",
  "international_shares",
  "property_investment",
  "property_home", // principal residence
  "fixed_interest",
  "mixed_balanced",
  "other",
]);
export type AssetClass = z.infer<typeof AssetClassEnum>;

export const LiabilityTypeEnum = z.enum([
  "home_loan",
  "investment_loan",
  "personal_loan",
  "credit_card",
  "hecs_help",
  "other",
]);
export type LiabilityType = z.infer<typeof LiabilityTypeEnum>;

export const RepaymentTypeEnum = z.enum([
  "principal_and_interest",
  "interest_only",
]);
export type RepaymentType = z.infer<typeof RepaymentTypeEnum>;

export const SuperPhaseEnum = z.enum([
  "accumulation",
  "pension", // account-based pension
  "transition", // TTR pension
]);
export type SuperPhase = z.infer<typeof SuperPhaseEnum>;

export const OwnershipTypeEnum = z.enum(["individual", "joint"]);
export type OwnershipType = z.infer<typeof OwnershipTypeEnum>;

export const IncomeTypeEnum = z.enum([
  "employment",
  "self_employment",
  "business",
  "government_pension",
  "foreign",
  "other",
]);
export type IncomeType = z.infer<typeof IncomeTypeEnum>;

export const ExpenseCategoryEnum = z.enum([
  "essential", // housing, food, utilities, insurance
  "discretionary", // travel, entertainment, dining
  "one_off", // car purchase, renovation
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategoryEnum>;

// ── Person & Household ───────────────────────────────────────────────────────

export const PersonSchema = z.object({
  id: z.string().describe("Unique identifier, e.g. 'person_1'"),
  name: z.string().default(""),
  date_of_birth_year: z.number().int().describe("Birth year for age calculation"),
  gender: GenderEnum.default("other"),
  is_australian_resident: z.boolean().default(true),
  employment_status: EmploymentStatusEnum.default("employed"),
  intended_retirement_age: z.number().int().nullable().default(67),
  has_hecs_help_debt: z.boolean().default(false),
  hecs_help_balance: z.number().default(0.0),
  is_homeowner: z.boolean().default(true), // for Centrelink assets test thresholds
});
export type Person = z.infer<typeof PersonSchema>;

export const HouseholdSchema = z.object({
  members: z.array(PersonSchema).min(1).max(2).describe("A household: one or two adults plus optional dependents"),
  relationship_status: RelationshipStatusEnum.default("single"),
  num_dependents: z.number().int().default(0),
  dependents_ages: z.array(z.number().int()).default([]),
});
export type Household = z.infer<typeof HouseholdSchema>;

// ── Income ───────────────────────────────────────────────────────────────────

export const IncomeStreamSchema = z.object({
  person_id: z.string(),
  income_type: IncomeTypeEnum.default("employment"),
  gross_annual: z.number().describe("Gross annual income in AUD"),
  includes_super: z.boolean().default(false), // True if gross includes SG
  growth_rate: z.number().default(0.035), // annual wage growth
  start_year: z.number().int().nullable().default(null), // None = from projection start
  end_year: z.number().int().nullable().default(null), // None = until retirement
  salary_sacrifice_amount: z.number().default(0.0), // annual pre-tax super contribution
});
export type IncomeStream = z.infer<typeof IncomeStreamSchema>;

// ── Expenses ─────────────────────────────────────────────────────────────────

export const ExpenseSchema = z.object({
  name: z.string().default(""),
  category: ExpenseCategoryEnum.default("essential"),
  annual_amount: z.number().default(0.0),
  inflation_adjusted: z.boolean().default(true),
  start_year: z.number().int().nullable().default(null),
  end_year: z.number().int().nullable().default(null),
});
export type Expense = z.infer<typeof ExpenseSchema>;

// ── Assets ───────────────────────────────────────────────────────────────────

export const AssetSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  asset_class: AssetClassEnum.default("cash"),
  current_value: z.number().default(0.0),
  cost_base: z.number().default(0.0), // for CGT calculations

  // Ownership
  ownership_type: OwnershipTypeEnum.default("individual"),
  owner_id: z.string().nullable().default(null), // if individual
  ownership_split: z.record(z.string(), z.number()).default({}), // e.g. {"person_1": 0.5, "person_2": 0.5}

  // Performance assumptions
  growth_rate: z.number().default(0.0), // capital growth p.a.
  income_yield: z.number().default(0.0), // income (dividends, rent, interest) p.a.
  franking_rate: z.number().default(0.0), // % of income that is franked (Aus shares)
  expense_ratio: z.number().default(0.0), // management fees deducted from growth

  // Centrelink treatment
  is_centrelink_assessable: z.boolean().default(true),
  is_deemed: z.boolean().default(true), // subject to deeming rates

  // Flags
  is_primary_residence: z.boolean().default(false), // exempt from assets test & CGT

  // NEW: Asset-Liability Linking (PRD 8.4)
  funded_by_liability_id: z.string().nullable().default(null), // References the Liability that funds this asset
  is_lifestyle_asset: z.boolean().default(false), // True for cars, boats etc. Depreciates rather than appreciates.
  depreciation_rate: z.number().default(0.0), // Annual depreciation rate for lifestyle assets (e.g. 0.15 = 15%)
});
export type Asset = z.infer<typeof AssetSchema>;

// ── Superannuation ───────────────────────────────────────────────────────────

export const SuperFundSchema = z.object({
  person_id: z.string(),
  balance: z.number().default(0.0),
  phase: SuperPhaseEnum.default("accumulation"),
  investment_return: z.number().default(0.07), // gross return before tax
  admin_fee_flat: z.number().default(500), // flat annual admin fee
  admin_fee_percent: z.number().default(0.005), // % based fee
  insurance_premium: z.number().default(0.0), // annual insurance deducted

  // Contributions
  employer_sg_included: z.boolean().default(true), // engine calculates SG from income
  voluntary_concessional: z.number().default(0.0), // additional pre-tax contributions
  voluntary_non_concessional: z.number().default(0.0), // after-tax contributions
  spouse_contribution: z.number().default(0.0),

  // Pension drawdown (if in pension phase)
  pension_drawdown_rate: z.number().nullable().default(null), // if None, use minimum
});
export type SuperFund = z.infer<typeof SuperFundSchema>;

// ── Liabilities ──────────────────────────────────────────────────────────────

export const LiabilitySchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  liability_type: LiabilityTypeEnum.default("home_loan"),
  current_balance: z.number().default(0.0),
  interest_rate: z.number().default(0.06),
  repayment_type: RepaymentTypeEnum.default("principal_and_interest"),
  annual_repayment: z.number().nullable().default(null), // if None, calculate from term
  remaining_term_years: z.number().int().default(25),

  // Ownership / linkage
  owner_id: z.string().nullable().default(null),
  linked_asset_id: z.string().nullable().default(null), // e.g., investment loan → rental property

  // Tax deductibility
  is_tax_deductible: z.boolean().default(false), // True for investment loans
  deductible_person_id: z.string().nullable().default(null),

  // IO period
  interest_only_remaining_years: z.number().int().default(0),

  // NEW: Asset-Liability Linking (PRD 8.4)
  secured_by_asset_id: z.string().nullable().default(null), // References the Asset this liability is secured against
  offset_account_balance: z.number().default(0.0), // Offset account balance (reduces interest calculation)
});
export type Liability = z.infer<typeof LiabilitySchema>;

// ── One-off Cash Flows ──────────────────────────────────────────────────────

export const ScheduledCashFlowSchema = z.object({
  year: z.number().int(),
  amount: z.number(), // positive = inflow, negative = outflow
  description: z.string().default(""),
  person_id: z.string().nullable().default(null), // None = household level
  is_taxable: z.boolean().default(false),
});
export type ScheduledCashFlow = z.infer<typeof ScheduledCashFlowSchema>;

// ── Assumptions & Config ─────────────────────────────────────────────────────

export const AssumptionsSchema = z.object({
  inflation_rate: z.number().default(0.03),
  wage_growth_rate: z.number().default(0.035),

  // Tax bracket indexation (approx % p.a. — set 0 to freeze)
  tax_bracket_indexation: z.number().default(0.0), // conservative: brackets don't move

  // Centrelink threshold indexation
  centrelink_indexation: z.number().default(0.025),

  // Super
  sg_rate: z.number().default(0.12), // current SG rate
  sg_rate_schedule: z.record(z.number().int(), z.number()).default({}), // year → SG rate overrides
  concessional_cap: z.number().default(30_000),
  non_concessional_cap: z.number().default(120_000),
  super_preservation_age: z.number().int().default(60),

  // Deeming rates (Centrelink)
  deeming_rate_lower: z.number().default(0.0025),
  deeming_rate_upper: z.number().default(0.0225),
  deeming_threshold_single: z.number().default(60_400),
  deeming_threshold_couple: z.number().default(100_200),

  // Investment return defaults (used if not specified on asset)
  default_returns: z.record(
    z.string(),
    z.object({
      growth: z.number(),
      income: z.number(),
      franking: z.number().optional(),
    })
  ).default({
    cash: { growth: 0.0, income: 0.04 },
    australian_shares: { growth: 0.04, income: 0.04, franking: 0.70 },
    international_shares: { growth: 0.06, income: 0.02, franking: 0.0 },
    property_investment: { growth: 0.03, income: 0.035, franking: 0.0 },
    property_home: { growth: 0.04, income: 0.0, franking: 0.0 },
    fixed_interest: { growth: 0.0, income: 0.045, franking: 0.0 },
    mixed_balanced: { growth: 0.03, income: 0.03, franking: 0.30 },
  }),
});
export type Assumptions = z.infer<typeof AssumptionsSchema>;

// ── Allocation Rules (PRD 8.6) ────────────────────────────────────────────────

export const SurplusRuleTypeEnum = z.enum([
  "emergency_buffer",
  "extra_debt_repayment",
  "super_contribution",
  "investment_contribution",
  "remainder_to_cash",
]);
export type SurplusRuleType = z.infer<typeof SurplusRuleTypeEnum>;

export const DebtStrategyEnum = z.enum(["avalanche", "snowball"]);
export type DebtStrategy = z.infer<typeof DebtStrategyEnum>;

export const DrawdownRuleTypeEnum = z.enum([
  "cash",
  "fixed_interest",
  "shares",
  "super",
  "property",
]);
export type DrawdownRuleType = z.infer<typeof DrawdownRuleTypeEnum>;

export const SurplusRuleSchema = z.object({
  type: SurplusRuleTypeEnum,
  target_amount: z.number().optional(),
  monthly_amount: z.number().optional(),
  target_asset_id: z.string().optional(),
  strategy: DebtStrategyEnum.optional(),
});
export type SurplusRule = z.infer<typeof SurplusRuleSchema>;

export const DrawdownRuleSchema = z.object({
  type: DrawdownRuleTypeEnum,
  asset_id: z.string().optional(),
});
export type DrawdownRule = z.infer<typeof DrawdownRuleSchema>;

export const AllocationRulesSchema = z.object({
  surplus_priority: z.array(SurplusRuleSchema).default([]),
  drawdown_priority: z.array(DrawdownRuleSchema).default([]),
});
export type AllocationRules = z.infer<typeof AllocationRulesSchema>;

// ── Scenario (Top-level input) ──────────────────────────────────────────────

export const ScenarioSchema = z.object({
  name: z.string().default("Unnamed Scenario"),
  start_year: z.number().int().default(2025),
  projection_years: z.number().int().default(30),

  household: HouseholdSchema,
  income_streams: z.array(IncomeStreamSchema).default([]),
  expenses: z.array(ExpenseSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  super_funds: z.array(SuperFundSchema).default([]),
  liabilities: z.array(LiabilitySchema).default([]),
  scheduled_cash_flows: z.array(ScheduledCashFlowSchema).default([]),
  assumptions: AssumptionsSchema.optional(),

  // NEW: Allocation rules (PRD 8.6)
  allocation_rules: AllocationRulesSchema.optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

// ── Output Models ────────────────────────────────────────────────────────────

export const PersonMonthDetailSchema = z.object({
  person_id: z.string(),
  age: z.number().int().default(0),
  employment_income: z.number().default(0.0),
  asset_income: z.number().default(0.0),
  super_sg_contributions: z.number().default(0.0),
  super_voluntary_concessional: z.number().default(0.0),
  super_voluntary_non_concessional: z.number().default(0.0),
  super_balance: z.number().default(0.0),
  super_pension_drawdown: z.number().default(0.0),
  taxable_income: z.number().default(0.0),
  tax_payable: z.number().default(0.0),
  medicare_levy: z.number().default(0.0),
  hecs_repayment: z.number().default(0.0),
  tax_offsets: z.number().default(0.0),
  net_tax: z.number().default(0.0),
  centrelink_income_tested: z.number().default(0.0),
  franking_credits: z.number().default(0.0),
  deductions: z.number().default(0.0),
});
export type PersonMonthDetail = z.infer<typeof PersonMonthDetailSchema>;

export const MonthSnapshotSchema = z.object({
  year: z.number().int(),
  month: z.number().int(), // 1-12
  persons: z.array(PersonMonthDetailSchema).default([]),

  // Household aggregates
  total_gross_income: z.number().default(0.0),
  total_employment_income: z.number().default(0.0),
  total_asset_income: z.number().default(0.0),
  total_centrelink_payments: z.number().default(0.0),
  total_super_pension_income: z.number().default(0.0),
  total_expenses: z.number().default(0.0),
  total_loan_repayments: z.number().default(0.0),
  total_tax: z.number().default(0.0),
  scheduled_cashflows_net: z.number().default(0.0),
  net_cash_flow: z.number().default(0.0),

  // Balance sheet
  total_assets: z.number().default(0.0),
  total_super: z.number().default(0.0),
  total_liabilities: z.number().default(0.0),
  net_worth: z.number().default(0.0),

  // Centrelink detail
  age_pension_monthly: z.number().default(0.0),
  centrelink_income_test_result: z.number().default(0.0),
  centrelink_assets_test_result: z.number().default(0.0),

  // Asset breakdown
  asset_values: z.record(z.string(), z.number()).default({}),
  liability_balances: z.record(z.string(), z.number()).default({}),
});
export type MonthSnapshot = z.infer<typeof MonthSnapshotSchema>;

export const ProjectionResultSchema = z.object({
  scenario_name: z.string().default(""),
  start_year: z.number().int().default(0),
  end_year: z.number().int().default(0),
  snapshots: z.array(MonthSnapshotSchema).default([]),
  warnings: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ProjectionResult = z.infer<typeof ProjectionResultSchema>;

// ── Required Variables Mapping (NEW) ─────────────────────────────────────────

/**
 * Maps intent names to arrays of required profile field names.
 * Used by the conversational interface to determine which profile data
 * must be collected before processing an intent.
 * 
 * Example:
 * {
 *   "project_retirement": ["date_of_birth_year", "intended_retirement_age", "super_balance"],
 *   "calculate_age_pension": ["date_of_birth_year", "relationship_status", "assets", "super_balance"]
 * }
 */
export type RequiredVariables = Record<string, string[]>;

// ── Export All Schemas ───────────────────────────────────────────────────────

export const schemas = {
  Person: PersonSchema,
  Household: HouseholdSchema,
  IncomeStream: IncomeStreamSchema,
  Expense: ExpenseSchema,
  Asset: AssetSchema,
  SuperFund: SuperFundSchema,
  Liability: LiabilitySchema,
  ScheduledCashFlow: ScheduledCashFlowSchema,
  Assumptions: AssumptionsSchema,
  SurplusRule: SurplusRuleSchema,
  DrawdownRule: DrawdownRuleSchema,
  AllocationRules: AllocationRulesSchema,
  Scenario: ScenarioSchema,
  PersonMonthDetail: PersonMonthDetailSchema,
  MonthSnapshot: MonthSnapshotSchema,
  ProjectionResult: ProjectionResultSchema,
} as const;
