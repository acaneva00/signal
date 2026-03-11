/**
 * Chat Orchestrator
 *
 * Single entry point for all user messages.  Classifies intent via Claude,
 * routes to the Calculation Agent path (tool use → engine), and handles
 * the data-collection loop when personal data is missing.
 *
 * Data minimisation: Claude only receives profile field *names* initially.
 * Actual values are returned inside the get_required_fields tool response
 * for the specific intent, so the full profile is never sent to the AI provider.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  getRequiredVariables,
  runProjection,
  compareScenarios,
  createSummary,
  type ProjectionSummary,
  type ComparisonResult,
} from '@/engine/api';
import type { ProjectionResult } from '@/engine/models';
import type { InputRequest, FundFeeBreakdown, FeeBreakdownComparison } from '@/types/agent';
import {
  type ProfileData,
  type ScenarioOverrides,
  checkFieldAvailability,
  buildScenarioFromProfile,
  getFieldsSatisfiedByOverrides,
  resolveProfileField,
  OVERRIDE_TO_PROFILE_FIELD,
} from './scenario-builder';
import {
  CALCULATION_INTENT_NAMES,
  FULL_LIFECYCLE_INTENTS,
  buildIntentPromptBlock,
  isCalculationIntent,
} from '@/lib/intents';
import { findProduct } from '@/lib/products/product-lookup';
import { calculateAnnualFee, decomposeFeeComponents } from '@/lib/products/fee-calculator';
import type { FeeStructure, InvestmentOption } from '@/lib/products/fee-calculator';

// ── Public Types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  message: string;
  agent_used: string;
  intent_classified: string | null;
  projection_result: ProjectionResult | null;
  projection_summary: ProjectionSummary | null;
  comparison_result: ComparisonResult | null;
  fee_breakdown_comparison: FeeBreakdownComparison | null;
  assumptions: string[];
  disclaimers: string[];
  input_request: InputRequest | null;
  profile_updates: Record<string, unknown>;
}

// ── Config ───────────────────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514';
const MAX_TOOL_ITERATIONS = 10;
const CONTEXT_MESSAGE_LIMIT = 20;

// ── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_required_fields',
    description:
      'Check which profile fields are required for a financial intent and ' +
      'identify any missing data. Returns required fields, missing fields, ' +
      'available values, and a suggested input widget for the first missing ' +
      'field. Always call this before run_projection. Pass extracted_profile_data ' +
      'with ANY personal values the user has stated in conversation (income, ' +
      'super balance, birth year, etc.) — they are saved to the profile ' +
      'automatically. Pass planned_overrides for scenario-level what-if parameters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string',
          enum: [...CALCULATION_INTENT_NAMES],
          description: 'The classified financial intent',
        },
        planned_overrides: {
          type: 'object',
          description:
            'Scenario-level overrides (hypothetical / what-if parameters) the user ' +
            'has stated. Fields satisfied by these overrides will be excluded from ' +
            'the missing list (e.g. { "retirement_age": 62, "annual_expenses": 75000 }).',
          properties: {
            retirement_age: { type: 'number' },
            annual_expenses: { type: 'number', description: 'Annual spending/expenses in dollars' },
            inflation_rate: { type: 'number' },
            wage_growth_rate: { type: 'number' },
            investment_return: { type: 'number' },
            extra_super_contribution: { type: 'number' },
            extra_mortgage_payment: { type: 'number' },
            super_fees_flat: { type: 'number' },
            super_fees_percent: { type: 'number' },
          },
        },
        extracted_profile_data: {
          type: 'object',
          description:
            'Personal profile values the user has stated anywhere in this conversation ' +
            '(e.g. "I earn $80k", "born in 1985", "$320k in super"). These are saved ' +
            'to the user\'s profile automatically and will satisfy missing-field checks. ' +
            'ALWAYS include ALL profile values mentioned so far in the conversation.',
          properties: {
            date_of_birth_year: { type: 'number', description: 'Year of birth (e.g. 1985)' },
            income: { type: 'number', description: 'Annual gross salary in dollars' },
            super_balance: { type: 'number', description: 'Current superannuation balance' },
            super_fund_name: { type: 'string', description: "User's current super fund name (e.g. AustralianSuper, Hostplus)" },
            intended_retirement_age: { type: 'number', description: 'Target retirement age' },
            expenses: { type: 'number', description: 'Annual living expenses in dollars' },
            relationship_status: {
              type: 'string',
              enum: ['single', 'partnered', 'married', 'separated'],
            },
            is_homeowner: { type: 'boolean', description: 'true if owns home, false if rents' },
            has_hecs_help_debt: { type: 'boolean' },
            hecs_help_balance: { type: 'number', description: 'Outstanding HECS/HELP balance' },
            mortgage_balance: { type: 'number', description: 'Outstanding mortgage balance' },
            mortgage_rate: { type: 'number', description: 'Interest rate as decimal (e.g. 0.06 for 6%)' },
            mortgage_repayment: { type: 'number', description: 'Monthly mortgage repayment' },
            assets: { type: 'number', description: 'Total other assessable assets' },
            liabilities: { type: 'number', description: 'Total other liabilities' },
          },
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'run_projection',
    description:
      'Run a financial projection using the unified engine. Only call when ' +
      'get_required_fields confirms no missing data. Returns a summary with ' +
      'key metrics, milestones, and net-worth trajectory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string',
          description: 'The financial intent being calculated',
        },
        target_age: {
          type: 'number',
          description:
            'Target age for the projection (e.g. 67 for retirement). ' +
            'Defaults to intended_retirement_age from profile.',
        },
        projection_years: {
          type: 'number',
          description: 'Override the number of projection years.',
        },
        overrides: {
          type: 'object',
          description:
            'Scenario-level overrides — economic assumptions and what-if parameters ' +
            '(e.g. { "retirement_age": 62, "annual_expenses": 75000 }).',
          properties: {
            inflation_rate: { type: 'number' },
            wage_growth_rate: { type: 'number' },
            investment_return: { type: 'number' },
            retirement_age: { type: 'number' },
            annual_expenses: { type: 'number', description: 'Annual spending/expenses in dollars' },
            extra_super_contribution: { type: 'number' },
            extra_mortgage_payment: { type: 'number' },
            super_fees_flat: { type: 'number' },
            super_fees_percent: { type: 'number' },
          },
        },
        extracted_profile_data: {
          type: 'object',
          description:
            'Personal profile values from the conversation to save before running ' +
            'the projection. Same schema as in get_required_fields.',
          properties: {
            date_of_birth_year: { type: 'number' },
            income: { type: 'number' },
            super_balance: { type: 'number' },
            super_fund_name: { type: 'string' },
            intended_retirement_age: { type: 'number' },
            expenses: { type: 'number' },
            relationship_status: { type: 'string' },
            is_homeowner: { type: 'boolean' },
            has_hecs_help_debt: { type: 'boolean' },
            hecs_help_balance: { type: 'number' },
            mortgage_balance: { type: 'number' },
            mortgage_rate: { type: 'number' },
            mortgage_repayment: { type: 'number' },
            assets: { type: 'number' },
            liabilities: { type: 'number' },
          },
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'compare_scenarios',
    description:
      'Compare multiple projection scenarios side-by-side for "what if" ' +
      'questions. Each variation uses the same base profile with different ' +
      'overrides.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string',
          description: 'The financial intent being compared',
        },
        variations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Label for this scenario' },
              overrides: {
                type: 'object',
                description: 'Parameter overrides for this variation',
              },
            },
            required: ['name', 'overrides'],
          },
          description: 'Scenario variations to compare',
        },
        extracted_profile_data: {
          type: 'object',
          description:
            'Personal profile values from the conversation to save before comparing. ' +
            'Same schema as in get_required_fields.',
        },
      },
      required: ['intent', 'variations'],
    },
  },
  {
    name: 'search_products',
    description:
      'Look up a super fund or wrap platform by name (or alias). Returns product ' +
      'details and the estimated annual fee at the user\'s current super balance. ' +
      'Use for compare_fund intent to retrieve fee data for both funds.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fund_name: {
          type: 'string',
          description:
            'Fund name, alias, or sentinel ("the market" / "industry average")',
        },
      },
      required: ['fund_name'],
    },
  },
];

// ── Structured Input Requests ────────────────────────────────────────────────

const FIELD_INPUT_REQUESTS: Record<string, InputRequest> = {
  super_fund_name: {
    type: 'text',
    field: 'super_fund_name',
    required: true,
    label: 'YOUR SUPER FUND',
    hint: 'Start typing to search',
    placeholder: 'e.g. AustralianSuper',
    autocomplete: true,
  },
  date_of_birth_year: {
    type: 'numeric',
    field: 'date_of_birth_year',
    required: true,
    label: 'BIRTH YEAR',
    placeholder: 'e.g. 1985',
    format: 'year',
    min: 1930,
    max: 2010,
  },
  income: {
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
  super_balance: {
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
  intended_retirement_age: {
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
  expenses: {
    type: 'numeric',
    field: 'expenses',
    required: true,
    label: 'ANNUAL EXPENSES',
    hint: 'Annual household expenses',
    placeholder: 'e.g. 60,000',
    format: 'currency',
    min: 0,
    max: 300_000,
  },
  relationship_status: {
    type: 'chips',
    field: 'relationship_status',
    required: true,
    options: [
      { label: 'Single', value: 'single' },
      { label: 'Married / De facto', value: 'married' },
      { label: 'Separated', value: 'separated' },
    ],
  },
  is_homeowner: {
    type: 'chips',
    field: 'housing_status',
    required: true,
    options: [
      { label: 'I own my home', value: 'own' },
      { label: 'I rent', value: 'rent' },
      { label: 'Living with family', value: 'living_with_family' },
    ],
  },
  has_hecs_help_debt: {
    type: 'chips',
    field: 'has_hecs_help_debt',
    required: true,
    options: [
      { label: 'Yes, I have HECS', value: 'true' },
      { label: 'No HECS debt', value: 'false' },
    ],
  },
  hecs_help_balance: {
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
  mortgage_balance: {
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
  mortgage_rate: {
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
  mortgage_repayment: {
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
  assets: {
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
  liabilities: {
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
};

// ── Extractable Profile Fields ───────────────────────────────────────────────
// Fields that Claude can extract from free-text conversation and persist to
// the user's profile. Maps canonical field name → expected JS typeof.

const EXTRACTABLE_PROFILE_FIELDS: Record<string, 'number' | 'string' | 'boolean'> = {
  date_of_birth_year: 'number',
  income: 'number',
  super_balance: 'number',
  super_fund_name: 'string',
  intended_retirement_age: 'number',
  expenses: 'number',
  relationship_status: 'string',
  is_homeowner: 'boolean',
  has_hecs_help_debt: 'boolean',
  hecs_help_balance: 'number',
  mortgage_balance: 'number',
  mortgage_rate: 'number',
  mortgage_repayment: 'number',
  assets: 'number',
  liabilities: 'number',
};

/**
 * Validate and merge extracted profile data into the tool context.
 * Values are written to both profileData (for immediate use) and
 * profileUpdates (for persistence to the database after the turn).
 */
function mergeExtractedProfileData(
  extracted: Record<string, unknown> | undefined,
  ctx: ToolContext,
): string[] {
  const saved: string[] = [];
  if (!extracted) return saved;

  for (const [field, value] of Object.entries(extracted)) {
    const expectedType = EXTRACTABLE_PROFILE_FIELDS[field];
    if (!expectedType || value == null || typeof value !== expectedType) continue;

    ctx.profileData[field] = value;
    ctx.profileUpdates[field] = value;
    saved.push(field);
  }

  return saved;
}

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(availableFields: string[]): string {
  return `You are Signal, an Australian financial guidance assistant. You help users understand their financial position through projections powered by a unified calculation engine.

YOUR ROLE:
- Classify user messages into financial intents
- Check data availability before running projections
- Run projections with engine tools and explain results in plain language
- You NEVER give personal financial advice or product recommendations
- You NEVER compute numbers yourself — always use the engine tools
- You NEVER perform arithmetic, rounding, inflation adjustment, or any other transformation on engine output — quote the engine's numbers exactly as returned

INTENTS:
${buildIntentPromptBlock()}

COMPARE_FUND INTENT:
When intent is compare_fund:
1. On EVERY turn, call get_required_fields with intent "compare_fund" and pass ALL extracted_profile_data collected so far. This is mandatory — it saves data to the profile AND returns the input widget for the next missing field. Never skip this call.
2. If super_fund_name is missing, ask exactly: "Which super fund are you currently with?" and STOP.
3. If date_of_birth_year is missing, ask for it next. It is needed to select the correct Lifestage cohort for funds that use age-based investment options (e.g. CFS FirstChoice, AMP, ART). STOP after asking.
4. If super_balance is missing, ask for it next. STOP after asking.
5. Do NOT call search_products or run any comparison until get_required_fields returns zero missing fields.
6. Once all required fields are present, call search_products TWICE — once for the user's fund, once for the comparison target (or "the market" if none specified).
7. Never ask for super_fund_name more than once — once collected it is saved to the profile.
8. When the user states their fund name (e.g. "I'm with Hostplus"), extract it into super_fund_name via extracted_profile_data on your next get_required_fields call.

INVESTMENT OPTION CONSISTENCY:
- On the first comparison, state the investment option assumed for each fund (e.g. "Assumes Balanced for both funds.").
- Store the assumed option as the comparison_investment_option for this conversation.
- On subsequent comparisons in the same session, reuse the same investment option unless the user explicitly changes it.
- If the user changes the option (e.g. "show me high growth"), explicitly state: "Switching to [option] — recalculating both funds on that basis." before presenting the updated comparison.

COMPARE_FUND RESPONSE FORMAT — MANDATORY:
When presenting a fund comparison result, use this EXACT structure and nothing else:

[User's fund] vs [Comparison fund] at $[balance]

[User fund]       $[fee] p.a.
[Comparison fund] $[fee] p.a.
─────────────────────────────────
Difference        $[gap] p.a.

Assumes [option name] for both funds.
[One sentence: what this means for the user.]
[One sentence disclaimer: general information only, not advice.]

RANKED COMPARISON FORMAT — MANDATORY:
When the user asks which fund is cheapest, or requests a multi-fund ranking, use this EXACT structure:

[Option name] options — ranked by annual fee at $[balance]

1. [Fund]     $[fee] p.a.
2. [Fund]     $[fee] p.a.
3. [Fund]     $[fee] p.a.
──────────────────────────
Your fund     $[fee] p.a.

[One sentence: the saving from switching to #1.]
[One sentence disclaimer.]

No bullet points. No inline calculations. No footnotes unless the user asks.

Rules for compare_fund responses:
- Never more than 2 sentences of prose below the fee table
- Do not explain fee structure components unless the user asks
- Do not list caveats about performance, insurance, or other factors unless the user asks
- The disclaimer must be one sentence maximum, at the bottom

FEE BREAKDOWN FORMAT:
When the user asks how fees are calculated, what the components are, or for a breakdown, construct it from the fee_structure fields returned by search_products.

For funds with a flat fee structure, use this format:

[Fund name] fee breakdown at $[balance]

Fixed admin fee:       $[admin_fee_pa] p.a.
Admin fee (%):         [admin_fee_pct]% = $[calculated] p.a. [capped at $[admin_fee_cap_pa] if applicable]
Investment fee:        [investment_fee_pct]% = $[calculated] p.a.
─────────────────────────────────────────────
Total:                 $[fee_at_balance] p.a.

For funds with admin_fee_tiers (wrap platforms), use this format:

[Fund name] fee breakdown at $[balance]

Admin fee (tiered):
  First $[tier_1_to]    @ [rate]%  =  $[calculated] p.a.
  Next  $[tier_2_slice] @ [rate]%  =  $[calculated] p.a.
  Total admin fee                  =  $[sum] p.a.
Investment fee:        0% (depends on underlying investments)
─────────────────────────────────────────────
Total:                 $[fee_at_balance] p.a.

Rules for fee breakdowns:
- ALL values MUST come from the fee_structure object in the search_products tool response — never state that fee component data is unavailable.
- Do NOT say "I don't have access to the fee breakdown" — you do, it is in the tool response you just received.
- Omit rows where the component is zero or absent (e.g. no fixed admin fee → skip that row).
- If admin_fee_cap_pa applies and the % fee exceeds it, show the cap explicitly: "0.10% = $[uncapped] → capped at $[cap]"
- If the fund uses admin_fee_tiers, list each tier that applies to the user's balance on its own row showing the slice amount, rate, and dollar result.
- Show the investment option used and note if it differs from the default.
- Show both funds if the user asks for a breakdown after a two-fund comparison.
- One sentence disclaimer at the bottom.

WORKFLOW:
1. Classify the user's intent
2. Extract ALL values the user has stated in this conversation. Separate them into two categories:
   a. PROFILE DATA — personal facts about the user. Map to extracted_profile_data keys:
      • Birth year / age / "born in X" → date_of_birth_year (number, e.g. 1985)
      • Salary / income / "I earn $X" → income (number, e.g. 80000)
      • Super balance / "I have $X in super" → super_balance (number, e.g. 320000)
      • Super fund name / "I'm with X" → super_fund_name (string, e.g. "Hostplus")
      • Retirement age / "retire at X" → intended_retirement_age (number, e.g. 67)
      • Expenses / spending / "I spend $X" → expenses (number, e.g. 60000)
      • Relationship → relationship_status (string: single, partnered, married, separated)
      • Owns home → is_homeowner (boolean)
      • HECS/HELP → has_hecs_help_debt (boolean), hecs_help_balance (number)
      • Mortgage → mortgage_balance, mortgage_rate (decimal e.g. 0.06), mortgage_repayment (monthly)
      • Other assets / liabilities → assets, liabilities (numbers)
   b. SCENARIO OVERRIDES — hypothetical/what-if parameters. Map to planned_overrides keys:
      • "What if inflation is 4%?" → inflation_rate
      • "Assume 8% return" → investment_return
      • Wage growth → wage_growth_rate
      • Extra super contributions → extra_super_contribution
      • Retirement age for what-if → retirement_age
      • Spending for what-if → annual_expenses
3. For calculation intents: call get_required_fields, passing:
   - extracted_profile_data with ALL profile values from step 2a (saves them to the user's profile)
   - planned_overrides with scenario overrides from step 2b
4. If fields are still missing: ask the user ONE question, in priority order
5. If all fields present: call run_projection (or compare_scenarios for comparisons), passing scenario overrides
6. Explain results in plain language with assumptions listed

EXTRACTING USER DATA — CRITICAL:
- Whenever the user states a personal fact (e.g. "I earn $80k", "born in 1985", "$320k in super"), you MUST include it in extracted_profile_data on your NEXT tool call.
- Scan the ENTIRE conversation history for previously stated values — not just the latest message.
- Extracted values are automatically saved to the user's profile and persist across turns and intents.
- NEVER re-ask for a value the user has already provided — extract it instead.
- If a user gives a value via free text (e.g. "80000") in response to a question, capture it in extracted_profile_data on your next tool call.

SCENARIO OVERRIDES — CAPTURE BEFORE ASKING:
- For "what if" / comparison questions (e.g. "What if I retire at 62 instead?"), identify BOTH the baseline (from prior conversation or profile) and the alternative (from the user's message). Call compare_scenarios with each as a variation using overrides.
- Overrides used in run_projection are automatically saved to the user's profile for future intents.

DATA COLLECTION — CRITICAL:
- Personal data is ALWAYS asked, never silently defaulted
- Ask ONE question per turn, in priority order
- Conditional logic:
  • Owns home → ask mortgage details, skip rent
  • Rents → ask rent amount, skip mortgage/home value
  • Single → skip partner questions
  • Mentions combined income → ask for split, skip relationship question
  • No debts → skip debt questions
  • HECS/HELP debt → ask balance; otherwise skip
  • Investment property → ask value, rental income, mortgage

When asking for a field, the get_required_fields tool returns an input_request object. The frontend renders an interactive input widget (numeric keypad, chips, etc.) directly below your message. Because the widget already shows labels, hints, and formatting, keep your question to ONE SHORT SENTENCE — e.g. "What year were you born?" not "What year were you born? (e.g. 1985) This helps determine your current age and years until retirement." Do NOT repeat the hint, placeholder, or explain why you need the field — the card handles that.
If the user has already answered a question via free text in an earlier message, do NOT ask again — pass the value in extracted_profile_data instead.

PROJECTION SCOPE:
- Standard projections (super_at_age, compare_retirement_age, fee_impact, household_net_worth, etc.) cover the ACCUMULATION PHASE ONLY — from now until retirement age.
- They do NOT model retirement drawdown, pension income, or post-retirement expenses because retirement spending details have not been captured yet.
- Only the super_longevity intent projects through the full retirement phase (it requires expenses data).
- When presenting accumulation-only results, make this clear: "This projection shows your position at retirement. It doesn't model how you'll draw down savings in retirement."
- If the user asks "How long will my super last?" or about retirement income sustainability, use the super_longevity intent — it will collect the necessary expense data.

ECONOMIC ASSUMPTIONS (defaults — always disclose when used in a projection):
- Investment return (balanced): 7.0% p.a. | (conservative): 5.0% | (growth): 8.5%
- Inflation: 2.5% p.a. | Wage growth: 3.5% p.a.
- Super fees (unknown fund): $78 admin + 0.70% p.a.
- SG rate, tax brackets, Centrelink thresholds: current legislated (regulatory facts)
Users can override any economic assumption (e.g. "What if inflation is 4%?").

EXPLAINING RESULTS:
- Plain Australian English. State the answer first, then explain.
- List all assumptions: investment return, inflation, wage growth, fees.
- Progressive accuracy:
  • Sparse profile: "Based on what you've shared, here's your projection. The more details you provide, the more accurate it becomes."
  • Rich profile: "This uses your actual income, expenses, super, and details — a much more personalised picture."
- Always end with: "This is a projection based on assumptions, not financial advice. Consider speaking to a licensed financial adviser for personal advice."

NUMBERS — CRITICAL:
- Every dollar figure you state MUST come directly from the engine's output. NEVER calculate, round, adjust, or derive your own figures.
- All engine output is in nominal (future) dollars. Always present numbers in nominal terms and label them as such (e.g. "approximately $1.74 million in nominal terms").
- If the user asks for values in today's dollars or real terms, tell them the engine currently reports in nominal terms and note that the real purchasing power would be lower after accounting for inflation. Do NOT attempt to calculate the real value yourself.
- NEVER present two different dollar figures for the same metric. If you state a super balance at retirement, use ONE number — the one from the engine — consistently throughout your entire response.

USER'S AVAILABLE PROFILE FIELDS: [${availableFields.length > 0 ? availableFields.join(', ') : 'none yet'}]
Only these fields have data. Do NOT ask for fields that are already available unless the user wants to update them.`;
}

// ── Tool Context (captures side-effects during the tool loop) ────────────────

interface ToolContext {
  profileData: ProfileData;
  profileUpdates: Record<string, unknown>;
  lastProjectionResult: ProjectionResult | null;
  lastProjectionSummary: ProjectionSummary | null;
  lastComparisonResult: ComparisonResult | null;
  lastInputRequest: InputRequest | null;
  classifiedIntent: string | null;
  lastOverrides: ScenarioOverrides | null;
  searchProductResults: Array<{ product: Record<string, unknown>; fee_at_balance: number }>;
}

// ── Projection Scope ─────────────────────────────────────────────────────────

/**
 * Determine projection_years based on intent. Accumulation-only intents stop
 * at retirement (or target) age; full-lifecycle intents return undefined so
 * the builder keeps its age-90 default.
 */
function projectionYearsForIntent(
  intent: string,
  targetAge: number | undefined,
  profileData: ProfileData,
  overrides: ScenarioOverrides,
): number | undefined {
  if (FULL_LIFECYCLE_INTENTS.has(intent)) return undefined;

  const dobYear = resolveProfileField(profileData, 'date_of_birth_year') as number | undefined;
  if (!dobYear) return undefined;

  const currentAge = new Date().getFullYear() - dobYear;
  const retirementAge =
    overrides.retirement_age ??
    (resolveProfileField(profileData, 'intended_retirement_age') as number | undefined) ??
    67;

  let endAge: number;
  if (intent === 'aged_pension') {
    endAge = Math.max(retirementAge, 70);
  } else {
    endAge = targetAge ?? retirementAge;
  }

  return Math.max(endAge - currentAge, 1);
}

// ── Tool Handlers ────────────────────────────────────────────────────────────

function handleGetRequiredFields(
  input: {
    intent: string;
    planned_overrides?: ScenarioOverrides;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  const savedFields = mergeExtractedProfileData(input.extracted_profile_data, ctx);

  const requiredFields = getRequiredVariables(input.intent);
  if (requiredFields.length === 0) {
    return {
      intent: input.intent,
      error: `Unknown intent: ${input.intent}. No required fields defined.`,
    };
  }

  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  const satisfied = getFieldsSatisfiedByOverrides(input.planned_overrides);
  const effectiveMissing = missing.filter((f) => !satisfied.has(f));

  const inputRequest =
    effectiveMissing.length > 0 ? (FIELD_INPUT_REQUESTS[effectiveMissing[0]] ?? null) : null;
  if (inputRequest) {
    ctx.lastInputRequest = inputRequest;
  }

  return {
    intent: input.intent,
    required_fields: requiredFields,
    missing_fields: effectiveMissing,
    available_data: available,
    input_request: inputRequest,
    ...(savedFields.length > 0 ? { saved_to_profile: savedFields } : {}),
  };
}

function handleRunProjection(
  input: {
    intent: string;
    target_age?: number;
    projection_years?: number;
    overrides?: ScenarioOverrides;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  mergeExtractedProfileData(input.extracted_profile_data, ctx);

  const overrides: ScenarioOverrides = {
    ...input.overrides,
    ...(input.projection_years != null ? { projection_years: input.projection_years } : {}),
    ...(input.target_age != null ? { retirement_age: input.target_age } : {}),
  };

  const requiredFields = getRequiredVariables(input.intent);
  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  const satisfied = getFieldsSatisfiedByOverrides(overrides);
  const effectiveMissing = missing.filter((f) => !satisfied.has(f));

  if (effectiveMissing.length > 0) {
    return {
      success: false,
      error: `Cannot run projection — missing fields: ${effectiveMissing.join(', ')}. Call get_required_fields first.`,
    };
  }

  ctx.lastOverrides = overrides;

  if (overrides.projection_years == null) {
    const scopedYears = projectionYearsForIntent(
      input.intent, input.target_age, ctx.profileData, overrides,
    );
    if (scopedYears != null) {
      overrides.projection_years = scopedYears;
    }
  }

  const scenarioInput = buildScenarioFromProfile(
    available,
    overrides,
    `${input.intent} projection`,
  );

  try {
    const result = runProjection(scenarioInput);
    const summary = createSummary(result);
    ctx.lastProjectionResult = result;
    ctx.lastProjectionSummary = summary;

    persistOverridesToProfile(overrides, ctx);

    const isAccumulationOnly = !FULL_LIFECYCLE_INTENTS.has(input.intent);

    return {
      success: true,
      summary,
      warnings: result.warnings,
      ...(isAccumulationOnly
        ? {
            note:
              'This projection covers the accumulation phase only (until retirement). ' +
              'Retirement drawdown is not modelled because retirement expenses have not been captured. ' +
              'If the user asks how long their money will last in retirement, use the super_longevity intent.',
          }
        : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Projection failed',
    };
  }
}

function handleCompareScenarios(
  input: {
    intent: string;
    variations: Array<{ name: string; overrides: ScenarioOverrides }>;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  mergeExtractedProfileData(input.extracted_profile_data, ctx);

  const requiredFields = getRequiredVariables(input.intent);
  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  const commonSatisfied = getCommonOverrideSatisfiedFields(input.variations);
  const effectiveMissing = missing.filter((f) => !commonSatisfied.has(f));

  if (effectiveMissing.length > 0) {
    return {
      success: false,
      error: `Cannot compare — missing fields: ${effectiveMissing.join(', ')}`,
    };
  }

  try {
    const scenarioInputs = input.variations.map((v) => {
      const variationOverrides = { ...(v.overrides as ScenarioOverrides) };
      if (variationOverrides.projection_years == null) {
        const scopedYears = projectionYearsForIntent(
          input.intent, undefined, ctx.profileData, variationOverrides,
        );
        if (scopedYears != null) {
          variationOverrides.projection_years = scopedYears;
        }
      }
      return buildScenarioFromProfile(available, variationOverrides, v.name);
    });

    const result = compareScenarios(scenarioInputs);
    ctx.lastComparisonResult = result;

    const isAccumulationOnly = !FULL_LIFECYCLE_INTENTS.has(input.intent);

    return {
      success: true,
      comparison: result,
      ...(isAccumulationOnly
        ? {
            note:
              'These projections cover the accumulation phase only (until each scenario\'s retirement age). ' +
              'Retirement drawdown is not modelled because retirement expenses have not been captured.',
          }
        : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Comparison failed',
    };
  }
}

/**
 * After a successful projection, persist override values back to the profile
 * so future intents can see them (e.g. target_age=67 → intended_retirement_age=67).
 */
function persistOverridesToProfile(overrides: ScenarioOverrides, ctx: ToolContext): void {
  for (const [overrideKey, profileField] of Object.entries(OVERRIDE_TO_PROFILE_FIELD)) {
    const value = (overrides as Record<string, unknown>)[overrideKey];
    if (value != null) {
      ctx.profileData[profileField] = value;
      ctx.profileUpdates[profileField] = value;
    }
  }
}

/**
 * For compare_scenarios: a profile field is satisfied only if EVERY variation
 * provides the corresponding override, since each scenario needs the value.
 */
function getCommonOverrideSatisfiedFields(
  variations: Array<{ overrides: ScenarioOverrides }>,
): Set<string> {
  if (variations.length === 0) return new Set();
  const sets = variations.map((v) => getFieldsSatisfiedByOverrides(v.overrides));
  const common = new Set<string>();
  for (const field of sets[0]) {
    if (sets.every((s) => s.has(field))) {
      common.add(field);
    }
  }
  return common;
}

// ── Fee Breakdown Builder ─────────────────────────────────────────────────
// Delegates to decomposeFeeComponents (fee-calculator.ts) — the single
// source of truth for all fee arithmetic and percentage conventions.

function buildFeeBreakdown(
  product: Record<string, unknown>,
  balanceUsed: number,
  birthYear?: number,
): FundFeeBreakdown {
  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: (product.investment_options as InvestmentOption[]) ?? [],
  };

  const { components, resolvedOptionName } = decomposeFeeComponents(
    feeStructure, balanceUsed, undefined, birthYear,
  );
  const totalAnnualFee = components.reduce((sum, c) => sum + c.annual_dollar, 0);

  const investmentOptions = (product.investment_options ?? []) as Array<Record<string, unknown>>;

  // Find the option that was actually resolved (by name match) so the card
  // label, fee rate, and allocation percentages all come from the same entry.
  let matchedOption: Record<string, unknown> | undefined;
  if (resolvedOptionName) {
    matchedOption = investmentOptions.find(
      (o) => (o.name as string) === resolvedOptionName,
    );
  }
  const displayOption = matchedOption ?? investmentOptions[0] as Record<string, unknown> | undefined;

  const optionName = resolvedOptionName
    ?? (displayOption?.option_name ?? displayOption?.name ?? 'Balanced') as string;
  const growthPct = (displayOption?.growth_pct ?? 70) as number;
  const defensivePct = (displayOption?.defensive_pct ?? (100 - growthPct)) as number;

  return {
    fund_name: (product.fund_name ?? product.name ?? 'Unknown Fund') as string,
    investment_option: optionName,
    growth_pct: growthPct,
    defensive_pct: defensivePct,
    total_annual_fee: Math.round(totalAnnualFee * 100) / 100,
    fee_components: components,
  };
}

async function handleSearchProducts(
  input: { fund_name: string },
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const balance =
    (ctx.profileData.super_balance as number | undefined) ?? 50_000;
  const birthYear =
    ctx.profileData.date_of_birth_year as number | undefined;
  const product = await findProduct(input.fund_name);

  if (!product) {
    return { found: false, product: null, fee_at_balance: 0 };
  }

  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: (product.investment_options as InvestmentOption[]) ?? [],
  };

  const fee = calculateAnnualFee(feeStructure, balance, undefined, birthYear);

  ctx.searchProductResults.push({
    product: product as unknown as Record<string, unknown>,
    fee_at_balance: fee,
  });

  return {
    found: true,
    product,
    fee_at_balance: fee,
    investment_options: feeStructure.investment_options,
  };
}

async function executeToolCall(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'get_required_fields':
      return handleGetRequiredFields(
        input as Parameters<typeof handleGetRequiredFields>[0],
        ctx,
      );
    case 'run_projection':
      return handleRunProjection(
        input as Parameters<typeof handleRunProjection>[0],
        ctx,
      );
    case 'compare_scenarios':
      return handleCompareScenarios(
        input as Parameters<typeof handleCompareScenarios>[0],
        ctx,
      );
    case 'search_products':
      return await handleSearchProducts(
        input as { fund_name: string },
        ctx,
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Assumptions List Builder ─────────────────────────────────────────────────

function buildAssumptionsList(ctx: ToolContext): string[] {
  if (!ctx.lastProjectionResult && !ctx.lastComparisonResult) return [];

  const invReturn = ctx.lastOverrides?.investment_return ?? 0.07;
  const inflation = ctx.lastOverrides?.inflation_rate ?? 0.025;
  const wageGrowth = ctx.lastOverrides?.wage_growth_rate ?? 0.035;

  const riskLabel =
    invReturn <= 0.05 ? 'conservative' : invReturn >= 0.085 ? 'growth' : 'balanced';

  const list = [
    `Assumed ${(invReturn * 100).toFixed(1)}% annual return (${riskLabel} option)`,
    `Inflation assumed at ${(inflation * 100).toFixed(1)}% per year`,
    `Wage growth assumed at ${(wageGrowth * 100).toFixed(1)}% per year`,
  ];

  if (!ctx.profileData.super_fund_name) {
    list.push(
      'Using average industry fees ($78 admin + 0.70% p.a.). Tell us your fund for exact fees.',
    );
  }

  return list;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function runChat(
  userMessage: string,
  profileData: ProfileData,
  conversationHistory: ChatMessage[],
): Promise<ChatResult> {
  const anthropic = new Anthropic();

  const availableFieldNames = Object.keys(profileData).filter(
    (k) => profileData[k] !== null && profileData[k] !== undefined,
  );

  const systemPrompt = buildSystemPrompt(availableFieldNames);

  const recentHistory = conversationHistory.slice(-CONTEXT_MESSAGE_LIMIT);
  const messages: Anthropic.MessageParam[] = [
    ...recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const ctx: ToolContext = {
    profileData,
    profileUpdates: {},
    lastProjectionResult: null,
    lastProjectionSummary: null,
    lastComparisonResult: null,
    lastInputRequest: null,
    classifiedIntent: null,
    lastOverrides: null,
    searchProductResults: [],
  };

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  let iterations = 0;
  while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: JSON.stringify(await executeToolCall(block.name, block.input, ctx)),
      })),
    );

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
  }

  const textBlocks = response.content.filter(
    (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
  );
  let messageText = textBlocks.map((b) => b.text).join('\n');

  if (!messageText && iterations >= MAX_TOOL_ITERATIONS && response.stop_reason === 'tool_use') {
    messageText =
      "I wasn't able to complete that comparison — I needed to look up too many funds at once. " +
      'Try asking me to compare your fund with one or two specific funds instead.';
  }

  const assumptions = buildAssumptionsList(ctx);
  const hasProjection = ctx.lastProjectionResult !== null;
  const hasComparison = ctx.lastComparisonResult !== null;

  let feeBreakdownComparison: FeeBreakdownComparison | null = null;
  if (
    ctx.classifiedIntent === 'compare_fund' &&
    ctx.searchProductResults.length >= 2
  ) {
    const balance =
      (ctx.profileData.super_balance as number | undefined) ?? 50_000;
    const birthYear =
      ctx.profileData.date_of_birth_year as number | undefined;
    feeBreakdownComparison = {
      funds: ctx.searchProductResults.map((r) =>
        buildFeeBreakdown(r.product, balance, birthYear),
      ),
      balance_used: balance,
    };

    if (process.env.NODE_ENV === 'development') {
      for (let i = 0; i < feeBreakdownComparison.funds.length; i++) {
        const engineTotal = ctx.searchProductResults[i].fee_at_balance;
        const chartTotal = feeBreakdownComparison.funds[i].total_annual_fee;
        if (Math.abs(engineTotal - chartTotal) > 0.01) {
          console.error(
            `[FeeBreakdown] MISMATCH for ${feeBreakdownComparison.funds[i].fund_name}: ` +
            `engine=${engineTotal}, chart=${chartTotal}`,
          );
        }
      }
    }
  }

  return {
    message: messageText,
    agent_used:
      ctx.classifiedIntent && isCalculationIntent(ctx.classifiedIntent)
        ? 'calculation'
        : 'education',
    intent_classified: ctx.classifiedIntent,
    projection_result: ctx.lastProjectionResult,
    projection_summary: ctx.lastProjectionSummary,
    comparison_result: ctx.lastComparisonResult,
    fee_breakdown_comparison: feeBreakdownComparison,
    assumptions,
    disclaimers:
      hasProjection || hasComparison || feeBreakdownComparison
        ? [
            'This is a projection based on assumptions, not financial advice. ' +
              'Consider speaking to a licensed financial adviser for personal advice.',
          ]
        : [],
    input_request: hasProjection || hasComparison ? null : ctx.lastInputRequest,
    profile_updates: ctx.profileUpdates,
  };
}
