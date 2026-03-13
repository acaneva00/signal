/**
 * Centralised Field Registry
 *
 * Single source of truth for every profile field the system can collect.
 * Each field is defined once with its data type and widget specification,
 * guaranteeing consistent presentation regardless of intent or scenario.
 *
 * Consumers import derived maps (FIELD_INPUT_REQUESTS, EXTRACTABLE_PROFILE_FIELDS)
 * rather than maintaining their own field metadata.
 */

import type { InputRequest } from '@/types/agent';

// ── Field Definition ─────────────────────────────────────────────────────────

export interface FieldDefinition {
  /** JS typeof used for validation when extracting from free text */
  dataType: 'number' | 'string' | 'boolean';
  /** Widget specification rendered by StructuredInput */
  inputRequest: InputRequest;
}

// ── The Registry ─────────────────────────────────────────────────────────────

export const FIELD_REGISTRY: Record<string, FieldDefinition> = {

  // ── Identity & Demographics ──────────────────────────────────────────────

  date_of_birth_year: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'date_of_birth_year',
      required: true,
      label: 'BIRTH YEAR',
      placeholder: 'e.g. 1985',
      format: 'year',
      min: 1930,
      max: 2010,
    },
  },
  relationship_status: {
    dataType: 'string',
    inputRequest: {
      type: 'chips',
      field: 'relationship_status',
      required: true,
      options: [
        { label: 'Single', value: 'single' },
        { label: 'Married / De facto', value: 'married' },
        { label: 'Separated', value: 'separated' },
      ],
    },
  },
  dependants_count: {
    dataType: 'string',
    inputRequest: {
      type: 'chips',
      field: 'dependants_count',
      required: true,
      options: [
        { label: 'None', value: '0' },
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4+', value: '4+' },
      ],
    },
  },

  // ── Income & Expenses ────────────────────────────────────────────────────

  income: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'annual_income',
      required: true,
      label: 'ANNUAL INCOME',
      hint: 'Before tax, per year',
      placeholder: 'e.g. 90,000',
      format: 'currency',
      min: 0,
      max: 500_000,
    },
  },
  expenses: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'expenses',
      required: true,
      label: 'ANNUAL EXPENSES',
      hint: 'Your current annual household spending',
      placeholder: 'e.g. 60,000',
      format: 'currency',
      min: 0,
      max: 300_000,
    },
  },

  // ── Superannuation ───────────────────────────────────────────────────────

  super_fund_name: {
    dataType: 'string',
    inputRequest: {
      type: 'text',
      field: 'super_fund_name',
      required: true,
      label: 'YOUR SUPER FUND',
      hint: 'Start typing to search',
      placeholder: 'e.g. AustralianSuper',
      autocomplete: true,
    },
  },
  super_balance: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'super_balance',
      required: true,
      label: 'SUPER BALANCE',
      hint: 'Approximate is fine',
      placeholder: 'e.g. 120,000',
      format: 'currency',
      min: 0,
      max: 3_000_000,
    },
  },
  is_default_investment: {
    dataType: 'boolean',
    inputRequest: {
      type: 'chips',
      field: 'is_default_investment',
      required: true,
      options: [
        { label: 'Default option', value: 'true' },
        { label: "I've chosen my option", value: 'false' },
      ],
    },
  },
  super_investment_option: {
    dataType: 'string',
    inputRequest: {
      type: 'text',
      field: 'super_investment_option',
      required: true,
      label: 'INVESTMENT OPTION',
      hint: "Start typing to search your fund's options",
      placeholder: 'e.g. Balanced, High Growth',
      autocomplete: true,
    },
  },

  // ── Retirement ───────────────────────────────────────────────────────────

  intended_retirement_age: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'intended_retirement_age',
      required: true,
      label: 'RETIREMENT AGE',
      hint: "When you'd like to stop working",
      placeholder: 'e.g. 67',
      format: 'age',
      min: 50,
      max: 75,
    },
  },
  projection_scope: {
    dataType: 'string',
    inputRequest: {
      type: 'chips',
      field: 'projection_scope',
      required: true,
      options: [
        { label: 'Super only', value: 'super_only' },
        { label: 'Full financial picture', value: 'full_model' },
      ],
    },
  },
  retirement_expense_strategy: {
    dataType: 'string',
    inputRequest: {
      type: 'chips',
      field: 'retirement_expense_strategy',
      required: true,
      options: [
        { label: 'Same as today', value: 'current_spending' },
        { label: 'ASFA Modest', value: 'asfa_modest' },
        { label: 'ASFA Comfortable', value: 'asfa_comfortable' },
        { label: 'Custom amount', value: 'custom' },
      ],
    },
  },
  retirement_expenses: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'retirement_expenses',
      required: true,
      label: 'RETIREMENT EXPENSES',
      hint: 'Annual spending in retirement',
      placeholder: 'e.g. 60,000',
      format: 'currency',
      min: 0,
      max: 300_000,
    },
  },
  surplus_allocation_strategy: {
    dataType: 'string',
    inputRequest: {
      type: 'chips',
      field: 'surplus_allocation_strategy',
      required: true,
      options: [
        { label: 'Balanced', value: 'balanced' },
        { label: 'Aggressive debt paydown', value: 'aggressive_debt' },
        { label: 'Super boost', value: 'super_boost' },
        { label: 'Investment focused', value: 'investment_focused' },
      ],
    },
  },

  // ── Housing & Mortgage ───────────────────────────────────────────────────

  is_homeowner: {
    dataType: 'boolean',
    inputRequest: {
      type: 'chips',
      field: 'housing_status',
      required: true,
      options: [
        { label: 'I own my home', value: 'own' },
        { label: 'I rent', value: 'rent' },
        { label: 'Living with family', value: 'living_with_family' },
      ],
    },
  },
  mortgage_balance: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'mortgage_balance',
      required: true,
      label: 'MORTGAGE BALANCE',
      hint: 'Approximate remaining balance',
      placeholder: 'e.g. 400,000',
      format: 'currency',
      min: 0,
      max: 3_000_000,
    },
  },
  mortgage_rate: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'mortgage_rate',
      required: true,
      label: 'MORTGAGE RATE',
      hint: 'Annual interest rate, e.g. 6.2%',
      placeholder: 'e.g. 6.2',
      format: 'number',
      min: 0,
      max: 15,
    },
  },
  mortgage_repayment: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'mortgage_repayment',
      required: true,
      label: 'MONTHLY REPAYMENT',
      hint: 'Monthly mortgage repayment',
      placeholder: 'e.g. 2,500',
      format: 'currency',
      min: 0,
      max: 10_000,
    },
  },

  // ── HECS / HELP ──────────────────────────────────────────────────────────

  has_hecs_help_debt: {
    dataType: 'boolean',
    inputRequest: {
      type: 'chips',
      field: 'has_hecs_help_debt',
      required: true,
      options: [
        { label: 'Yes, I have HECS', value: 'true' },
        { label: 'No HECS debt', value: 'false' },
      ],
    },
  },
  hecs_help_balance: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'hecs_help_balance',
      required: true,
      label: 'HECS BALANCE',
      hint: 'Outstanding balance',
      placeholder: 'e.g. 25,000',
      format: 'currency',
      min: 0,
      max: 200_000,
    },
  },

  // ── Assets & Liabilities ─────────────────────────────────────────────────

  assets: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'assets',
      required: true,
      label: 'OTHER ASSETS',
      hint: 'Total other assessable assets',
      placeholder: 'e.g. 50,000',
      format: 'currency',
      min: 0,
      max: 5_000_000,
    },
  },
  liabilities: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'liabilities',
      required: true,
      label: 'OTHER LIABILITIES',
      hint: 'Total other liabilities',
      placeholder: 'e.g. 10,000',
      format: 'currency',
      min: 0,
      max: 3_000_000,
    },
  },

  // ── Partner Fields ───────────────────────────────────────────────────────

  partner_date_of_birth_year: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'partner_date_of_birth_year',
      required: true,
      label: "PARTNER'S BIRTH YEAR",
      placeholder: 'e.g. 1987',
      format: 'year',
      min: 1930,
      max: 2010,
    },
  },
  partner_income: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'partner_income',
      required: true,
      label: "PARTNER'S ANNUAL INCOME",
      hint: 'Before tax, per year',
      placeholder: 'e.g. 75,000',
      format: 'currency',
      min: 0,
      max: 500_000,
    },
  },
  partner_super_balance: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'partner_super_balance',
      required: true,
      label: "PARTNER'S SUPER BALANCE",
      hint: 'Approximate is fine',
      placeholder: 'e.g. 90,000',
      format: 'currency',
      min: 0,
      max: 3_000_000,
    },
  },
  partner_super_fund_name: {
    dataType: 'string',
    inputRequest: {
      type: 'text',
      field: 'partner_super_fund_name',
      required: true,
      label: "PARTNER'S SUPER FUND",
      hint: 'Start typing to search',
      placeholder: 'e.g. AustralianSuper',
      autocomplete: true,
    },
  },
  partner_intended_retirement_age: {
    dataType: 'number',
    inputRequest: {
      type: 'numeric',
      field: 'partner_intended_retirement_age',
      required: true,
      label: "PARTNER'S RETIREMENT AGE",
      hint: 'When your partner plans to retire',
      placeholder: 'e.g. 65',
      format: 'age',
      min: 50,
      max: 75,
    },
  },
  partner_is_default_investment: {
    dataType: 'boolean',
    inputRequest: {
      type: 'chips',
      field: 'partner_is_default_investment',
      required: true,
      options: [
        { label: 'Default option', value: 'true' },
        { label: "They've chosen their option", value: 'false' },
      ],
    },
  },
  partner_super_investment_option: {
    dataType: 'string',
    inputRequest: {
      type: 'text',
      field: 'partner_super_investment_option',
      required: true,
      label: "PARTNER'S INVESTMENT OPTION",
      hint: "Start typing to search their fund's options",
      placeholder: 'e.g. Balanced, High Growth',
      autocomplete: true,
    },
  },
};

// ── Derived Maps ─────────────────────────────────────────────────────────────
// Backward-compatible exports consumed by the orchestrator and other modules.

/** Widget definitions keyed by canonical field name */
export const FIELD_INPUT_REQUESTS: Record<string, InputRequest> =
  Object.fromEntries(
    Object.entries(FIELD_REGISTRY).map(([k, v]) => [k, v.inputRequest]),
  );

/**
 * Fields that Claude can extract from free-text conversation and persist
 * to the user's profile. Maps canonical field name to expected JS typeof.
 */
export const EXTRACTABLE_PROFILE_FIELDS: Record<string, 'number' | 'string' | 'boolean'> =
  Object.fromEntries(
    Object.entries(FIELD_REGISTRY).map(([k, v]) => [k, v.dataType]),
  );
