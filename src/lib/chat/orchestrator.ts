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
import type { InputRequest, FundFeeBreakdown, FeeBreakdownComparison, FundFeeProjection, FeeProjectionRow } from '@/types/agent';
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
import { calculateAnnualFee, decomposeFeeComponents, convertToEngineFees } from '@/lib/products/fee-calculator';
import type { FeeStructure, InvestmentOption } from '@/lib/products/fee-calculator';
import {
  hasDefaultOption,
  findClosestOption,
  resolveOptionGrowthPct,
} from '@/lib/products/investment-options';
import { FIELD_INPUT_REQUESTS, EXTRACTABLE_PROFILE_FIELDS } from '@/lib/field-registry';
import { getAnnualBudget } from '@/engine/rates/asfa';

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
            retirement_expense_strategy: {
              type: 'string',
              enum: ['current_spending', 'asfa_modest', 'asfa_comfortable', 'custom'],
              description: 'How the user wants to estimate retirement expenses',
            },
            retirement_expenses: { type: 'number', description: 'Custom annual retirement spending nominated by the user' },
            projection_scope: {
              type: 'string',
              enum: ['super_only', 'full_model'],
              description: 'Whether to project super only or the full financial model',
            },
            surplus_allocation_strategy: {
              type: 'string',
              enum: ['balanced', 'aggressive_debt', 'super_boost', 'investment_focused'],
              description: 'How surplus cash flow should be allocated in full_model projections',
            },
            partner_date_of_birth_year: { type: 'number', description: "Partner's year of birth" },
            partner_income: { type: 'number', description: "Partner's annual gross salary" },
            partner_super_balance: { type: 'number', description: "Partner's super balance" },
            partner_super_fund_name: { type: 'string', description: "Partner's super fund name" },
            partner_intended_retirement_age: { type: 'number', description: "Partner's target retirement age" },
            partner_is_default_investment: { type: 'boolean', description: "Whether partner is in default investment option" },
            partner_super_investment_option: { type: 'string', description: "Partner's investment option name" },
            dependants_count: { type: 'string', description: 'Number of dependants (0, 1, 2, 3, 4+)' },
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
            retirement_expense_strategy: {
              type: 'string',
              enum: ['current_spending', 'asfa_modest', 'asfa_comfortable', 'custom'],
            },
            retirement_expenses: { type: 'number' },
            projection_scope: {
              type: 'string',
              enum: ['super_only', 'full_model'],
            },
            surplus_allocation_strategy: {
              type: 'string',
              enum: ['balanced', 'aggressive_debt', 'super_boost', 'investment_focused'],
            },
            partner_date_of_birth_year: { type: 'number' },
            partner_income: { type: 'number' },
            partner_super_balance: { type: 'number' },
            partner_super_fund_name: { type: 'string' },
            partner_intended_retirement_age: { type: 'number' },
            partner_is_default_investment: { type: 'boolean' },
            partner_super_investment_option: { type: 'string' },
            dependants_count: { type: 'string' },
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
      'questions or fund comparisons. Each variation uses the same base ' +
      'profile with different overrides. When comparing different super ' +
      'funds, set fund_name on each variation — the system automatically ' +
      'resolves fees and matches investment options by growth profile.',
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
              fund_name: {
                type: 'string',
                description:
                  'Super fund name for this scenario. Defaults to the user\'s ' +
                  'current fund. When set, fees are resolved automatically — ' +
                  'do NOT pass super_fees_flat/super_fees_percent manually.',
              },
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
      'Use for compare_fund intent (fee-only flow) or when retrieving product details.',
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

// ── Field Definitions ────────────────────────────────────────────────────────
// All field definitions (widget specs + data types) live in field-registry.ts.
// FIELD_INPUT_REQUESTS and EXTRACTABLE_PROFILE_FIELDS are imported above.

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

INVESTMENT OPTION COLLECTION:
When is_default_investment is missing (and the fund has a default option), ask: "Have you made any choices about how your super is invested, or are you in the default option?" and STOP.
If the fund has NO default/MySuper option (e.g. wrap platforms), is_default_investment is skipped entirely.
If the user is NOT in the default option (is_default_investment = false), the next missing field will be super_investment_option. Ask: "Which investment option are you in?" and STOP. The widget will show a searchable list of their fund's options.
If the user IS in the default option (is_default_investment = true), super_investment_option is skipped — the projection uses the fund's default fee.

FUND FEES IN PROJECTIONS:
- When the user's fund is known, projections automatically use the fund's real fee structure instead of industry averages.
- When presenting results, state the fund and investment option the fees are based on (e.g. "Using AustralianSuper Balanced fees.").
- If the fund is unknown, disclose: "Using average industry fees ($78 admin + 0.70% p.a.). Tell us your fund for exact fees."
- For projection comparisons across different funds, use compare_scenarios with fund_name on each variation. The system automatically resolves fees and matches investment options by growth profile. Do NOT pass super_fees_flat or super_fees_percent manually.

INVESTMENT OPTION CONSISTENCY:
- On the first comparison, state the investment option assumed for each fund (e.g. "Assumes Balanced for both funds.").
- Store the assumed option as the comparison_investment_option for this conversation.
- On subsequent comparisons in the same session, reuse the same investment option unless the user explicitly changes it.
- If the user changes the option (e.g. "show me high growth"), explicitly state: "Switching to [option] — recalculating both funds on that basis." before presenting the updated comparison.

INTENT ROUTING FOR FUND COMPARISONS:
- compare_fund: Fee-only comparison, no projection. Use when user asks "How do my fees compare?" with no prior projection. Call search_products TWICE, then present fee table. Do NOT call compare_scenarios.
- compare_super_projection: User wants to compare super balance at retirement across funds. Use when: (a) user has a projection and asks "what if I switched to [fund]?", or (b) user asks upfront "compare my super at retirement if I was with Aussie vs Vanguard". Call compare_scenarios with intent "compare_super_projection" and fund_name on each variation.
- compare_super_longevity: User wants to compare how long super lasts across funds (super only). Use when: "Which fund would make my super last longer?" or similar. Call compare_scenarios with intent "compare_super_longevity" and fund_name on each variation. The system forces projection_scope to super_only.

COMPARE_SUPER_PROJECTION INTENT:
When intent is compare_super_projection: Call get_required_fields with intent "compare_super_projection" and pass ALL extracted_profile_data. Required fields match super_at_age. Once all present, call compare_scenarios with intent "compare_super_projection" and fund_name on each variation (e.g. user's fund vs target fund). Do NOT call search_products — compare_scenarios resolves fees automatically.

COMPARE_SUPER_LONGIVITY INTENT:
When intent is compare_super_longevity: Call get_required_fields with intent "compare_super_longevity" and pass ALL extracted_profile_data. Required fields include relationship_status and retirement_expense_strategy (for ASFA amounts). Once all present, call compare_scenarios with intent "compare_super_longevity" and fund_name on each variation. The system forces projection_scope to super_only — no non-super assets. Do NOT call search_products — compare_scenarios resolves fees automatically.

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
      • Retirement spending / "spend $X in retirement" → retirement_expenses (number, e.g. 80000)
      • Retirement expense strategy → retirement_expense_strategy (string: current_spending, asfa_modest, asfa_comfortable, custom)
      • Projection scope / "just super" / "full picture" → projection_scope (string: super_only, full_model)
      • Surplus allocation / "pay off debt" / "boost super" → surplus_allocation_strategy (string: balanced, aggressive_debt, super_boost, investment_focused)
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
3. For ALL calculation intents: call get_required_fields on EVERY turn before responding. Never ask for a field value without the corresponding tool call — the tool generates the input widget the frontend needs. Pass:
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
- Only the super_longevity intent projects through the full retirement phase (it requires retirement expense data).
- When presenting accumulation-only results, make this clear: "This projection shows your position at retirement. It doesn't model how you'll draw down savings in retirement."
- If the user asks "How long will my super last?" or about retirement income sustainability, use the super_longevity intent — it will collect the necessary retirement expense data.

PROJECTION SCOPE (super_longevity intent):
- The first question after super fund name is projection_scope: "Would you like to project just your super, or include all your assets and income?"
- "Super only" (super_only): projects super accumulation and retirement drawdown only. No pre-retirement expenses or non-super assets. This is the simpler, faster path.
- "Full financial picture" (full_model): models full cash flow — income, expenses, assets, liabilities, surplus allocation, and deficit funding — from today through retirement.
- If the user selects full_model, additional fields are collected: mortgage details (if homeowner), other assets, other liabilities, and surplus allocation strategy. Note: annual expenses are collected earlier in the flow as core financial data (before retirement age), so they will already be known.
- When presenting full_model results, emphasize: total net worth trajectory (not just super), non-super asset pool at retirement, cash flow breakdown, when/how deficits are funded, and Age Pension eligibility.

SURPLUS ALLOCATION (full_model only):
- After collecting financial details, ask how surplus cash flow should be allocated. Options: Balanced (default), Aggressive debt paydown, Super boost, Investment focused.
- Balanced: emergency buffer, then debt repayment, then cash.
- Aggressive debt: prioritises maximum debt repayment.
- Super boost: adds extra super contributions ($2,500/mo) after debt repayment.
- Investment focused: directs surplus to investment portfolio ($2,000/mo) after debt repayment.

RETIREMENT EXPENSES (super_longevity intent):
- When the super_longevity intent needs expense data, use the retirement_expense_strategy selector instead of asking for a raw number. The selector offers four options: Same as today, ASFA Modest, ASFA Comfortable, or Custom amount.
- relationship_status is collected before the strategy selector (needed for ASFA single/couple amounts). The chip labels are dynamically enriched with the correct dollar figures once relationship status is known.
- The retirement_expense_strategy question determines ONLY the retirement spending figure. Pre-retirement annual expenses are collected earlier in the flow (as core financial data, before retirement age) and will already be known by this point in full_model mode.
- If user selects "Same as today", the engine uses the already-collected annual expenses as the retirement spending base. When presenting results, note that today's spending is projected forward in nominal terms (e.g. "Your current $60K spending is projected forward with 2.5% inflation — in nominal terms that's higher at retirement"). In super_only mode, expenses will be collected as a follow-up if not already known.
- If user selects "Custom amount" and retirement_expenses is not already known, ask for the specific annual retirement amount. Frame this clearly as retirement-specific spending, distinct from the pre-retirement expenses already collected.
- ASFA options auto-resolve based on relationship_status (single vs couple) — no follow-up question needed.
- If the user has already stated a specific retirement spending amount in conversation (e.g. "I want to spend $80K in retirement"), capture it as retirement_expenses and set retirement_expense_strategy to "custom". Skip the strategy selector in this case.
- IMPORTANT (super_only scope): This projection does not model pre-retirement living expenses. Super accumulation is driven by SG contributions and investment returns, which are independent of pre-retirement spending. Mention this when relevant.
- NOTE (full_model scope): Pre-retirement living expenses are collected early in the flow and drive surplus/deficit allocation to non-super assets. The retirement strategy question only determines the separate retirement expense figure. Both pre-retirement and retirement expense entries are created. The engine manages the transition automatically.

COUPLE SCENARIOS (full_model + partnered/married):
- When the user is partnered and selects full_model, collect partner details: birth year, income, super balance, super fund, retirement age, investment option.
- Both persons' super funds are modelled separately, each with their own fees resolved via the same product lookup path (industry average fallback if fund not found).
- Property and other assets default to 50/50 joint ownership.
- Retirement expenses use ASFA couple rates when applicable.
- Different retirement ages are supported — the engine handles two separate income cessation points.
- When presenting results, show both persons' super trajectories and the combined household net worth.

ECONOMIC ASSUMPTIONS (defaults — always disclose when used in a projection):
- Investment return (balanced): 7.0% p.a. | (conservative): 5.0% | (growth): 8.5%
- Inflation: 2.5% p.a. | Wage growth: 3.5% p.a.
- Super fees: when fund is known, the projection uses real fees from the fund's fee structure and the user's investment option. When fund is unknown: $78 admin + 0.70% p.a. (industry average).
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

async function handleGetRequiredFields(
  input: {
    intent: string;
    planned_overrides?: ScenarioOverrides;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  ctx.classifiedIntent = input.intent;

  const savedFields = mergeExtractedProfileData(input.extracted_profile_data, ctx);

  // Detect whether the user's fund has a default (MySuper) option.
  // Stored in profileData so applyConditionalLogic can skip is_default_investment.
  const fundName = ctx.profileData.super_fund_name as string | undefined;
  if (fundName && ctx.profileData._fund_has_default_option === undefined) {
    const product = await findProduct(fundName);
    if (product) {
      const options = (product.investment_options as InvestmentOption[]) ?? [];
      ctx.profileData._fund_has_default_option = hasDefaultOption(options);
    } else {
      ctx.profileData._fund_has_default_option = false;
    }
  }
  const partnerFundName = ctx.profileData.partner_super_fund_name as string | undefined;
  if (partnerFundName && ctx.profileData._partner_fund_has_default_option === undefined) {
    const partnerProduct = await findProduct(partnerFundName);
    if (partnerProduct) {
      const partnerOptions = (partnerProduct.investment_options as InvestmentOption[]) ?? [];
      ctx.profileData._partner_fund_has_default_option = hasDefaultOption(partnerOptions);
    } else {
      ctx.profileData._partner_fund_has_default_option = false;
    }
  }

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

  let inputRequest =
    effectiveMissing.length > 0 ? (FIELD_INPUT_REQUESTS[effectiveMissing[0]] ?? null) : null;
  if (inputRequest && inputRequest.field === 'super_investment_option') {
    const fundName = ctx.profileData.super_fund_name as string | undefined;
    if (fundName) {
      inputRequest = {
        ...inputRequest,
        autocomplete_url: `/api/products/investment-options?fund=${encodeURIComponent(fundName)}`,
      };
    }
  }
  if (inputRequest && inputRequest.field === 'partner_super_investment_option') {
    const partnerFundName = ctx.profileData.partner_super_fund_name as string | undefined;
    if (partnerFundName) {
      inputRequest = {
        ...inputRequest,
        autocomplete_url: `/api/products/investment-options?fund=${encodeURIComponent(partnerFundName)}`,
      };
    }
  }
  if (inputRequest && inputRequest.field === 'retirement_expense_strategy') {
    const rs = resolveProfileField(ctx.profileData, 'relationship_status');
    if (rs) {
      const isCouple = ['partnered', 'married'].includes((rs as string) ?? '');
      const modestAmt = getAnnualBudget('modest', isCouple);
      const comfAmt = getAnnualBudget('comfortable', isCouple);
      const fmtModest = `$${Math.round(modestAmt / 1000)}K`;
      const fmtComf = `$${Math.round(comfAmt / 1000)}K`;
      inputRequest = {
        ...inputRequest,
        options: [
          { label: 'Same as today', value: 'current_spending' },
          { label: `ASFA Modest (~${fmtModest}/yr)`, value: 'asfa_modest' },
          { label: `ASFA Comfortable (~${fmtComf}/yr)`, value: 'asfa_comfortable' },
          { label: 'Custom amount', value: 'custom' },
        ],
      };
    }
  }
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

// ── Fund Fee Resolution ──────────────────────────────────────────────────────

/**
 * Look up the user's fund and resolve real fees based on their investment option.
 * When overrides are provided, injects super_fees_flat/super_fees_percent directly.
 * Returns the resolved fee params (or null if fund is unknown).
 */
async function resolveFundFees(
  ctx: ToolContext,
  overrides?: ScenarioOverrides,
): Promise<{ flat: number; percent: number } | null> {
  const fundName = ctx.profileData.super_fund_name as string | undefined;
  if (!fundName) return null;

  const product = await findProduct(fundName);
  if (!product) return null;

  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: (product.investment_options as InvestmentOption[]) ?? [],
  };

  const balance = (ctx.profileData.super_balance as number | undefined) ?? 50_000;
  const birthYear = ctx.profileData.date_of_birth_year as number | undefined;

  const isDefault = ctx.profileData.is_default_investment;
  const investmentOption = isDefault === true || isDefault === 'true'
    ? undefined
    : (ctx.profileData.super_investment_option as string | undefined);

  const fees = convertToEngineFees(feeStructure, balance, investmentOption, birthYear);

  if (overrides) {
    overrides.super_fees_flat = fees.flat;
    overrides.super_fees_percent = fees.percent;
  }

  return fees;
}

/**
 * Look up the partner's fund and resolve real fees. Falls back to industry
 * average ($78 + 0.70%) if the fund is not found.
 */
async function resolvePartnerFundFees(
  ctx: ToolContext,
): Promise<{ flat: number; percent: number }> {
  const fundName = ctx.profileData.partner_super_fund_name as string | undefined;
  if (!fundName) return { flat: 78, percent: 0.007 };

  const product = await findProduct(fundName);
  if (!product) return { flat: 78, percent: 0.007 };

  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: (product.investment_options as InvestmentOption[]) ?? [],
  };

  const balance = (ctx.profileData.partner_super_balance as number | undefined) ?? 50_000;
  const birthYear = ctx.profileData.partner_date_of_birth_year as number | undefined;

  const isDefault = ctx.profileData.partner_is_default_investment;
  const investmentOption = isDefault === true || isDefault === 'true'
    ? undefined
    : (ctx.profileData.partner_super_investment_option as string | undefined);

  return convertToEngineFees(feeStructure, balance, investmentOption, birthYear);
}

/**
 * Resolve fees for any named fund, matching the investment option closest
 * to the user's current growth profile. Always goes through
 * `convertToEngineFees` so the unit convention is correct.
 *
 * Falls back to industry average ($78 + 0.70%) when the fund is not found.
 */
async function resolveFundFeesForName(
  fundName: string,
  userOptionGrowthPct: number,
  balance: number,
  birthYear: number | undefined,
): Promise<{ flat: number; percent: number; matchedOptionName: string | undefined; product: Record<string, unknown> | null }> {
  const INDUSTRY_FALLBACK = { flat: 78, percent: 0.007, matchedOptionName: undefined, product: null };

  const product = await findProduct(fundName);
  if (!product) return INDUSTRY_FALLBACK;

  const options = (product.investment_options as InvestmentOption[]) ?? [];
  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: options,
  };

  let investmentOptionName: string | undefined;
  if (options.length > 0) {
    const matched = findClosestOption(
      options,
      userOptionGrowthPct,
      feeStructure.admin_fee_pct ?? 0,
    );
    investmentOptionName = matched?.name;
  }

  const fees = convertToEngineFees(feeStructure, balance, investmentOptionName, birthYear);
  return { ...fees, matchedOptionName: investmentOptionName, product: product as unknown as Record<string, unknown> };
}

async function handleRunProjection(
  input: {
    intent: string;
    target_age?: number;
    projection_years?: number;
    overrides?: ScenarioOverrides;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
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

  if (overrides.super_fees_flat == null && overrides.super_fees_percent == null) {
    await resolveFundFees(ctx, overrides);
  }

  // Resolve partner fund fees for couple scenarios
  const scope = ctx.profileData.projection_scope as string | undefined;
  const rs = ctx.profileData.relationship_status as string | undefined;
  if (scope === 'full_model' && rs && ['partnered', 'married'].includes(rs)) {
    const partnerFees = await resolvePartnerFundFees(ctx);
    if (partnerFees) {
      ctx.profileData._partner_fees_flat = partnerFees.flat;
      ctx.profileData._partner_fees_percent = partnerFees.percent;
    }
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

async function handleCompareScenarios(
  input: {
    intent: string;
    variations: Array<{ name: string; fund_name?: string; overrides: ScenarioOverrides }>;
    extracted_profile_data?: Record<string, unknown>;
  },
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  ctx.classifiedIntent = input.intent;

  mergeExtractedProfileData(input.extracted_profile_data, ctx);

  const requiredFields = getRequiredVariables(input.intent);
  const { missing } = checkFieldAvailability(ctx.profileData, requiredFields);
  const { available } = checkFieldAvailability(ctx.profileData, Object.keys(ctx.profileData));

  const commonSatisfied = getCommonOverrideSatisfiedFields(input.variations);
  const effectiveMissing = missing.filter((f) => !commonSatisfied.has(f));

  if (effectiveMissing.length > 0) {
    return {
      success: false,
      error: `Cannot compare — missing fields: ${effectiveMissing.join(', ')}`,
    };
  }

  try {
    const balance = (ctx.profileData.super_balance as number | undefined) ?? 50_000;
    const birthYear = ctx.profileData.date_of_birth_year as number | undefined;

    // Resolve the user's current growth profile for cross-fund matching
    const userFundName = ctx.profileData.super_fund_name as string | undefined;
    let userGrowthPct = 70; // balanced fallback
    if (userFundName) {
      const userProduct = await findProduct(userFundName);
      if (userProduct) {
        const userOptions = (userProduct.investment_options as InvestmentOption[]) ?? [];
        const isDefault = ctx.profileData.is_default_investment === true
          || ctx.profileData.is_default_investment === 'true';
        const optionName = isDefault
          ? undefined
          : (ctx.profileData.super_investment_option as string | undefined);
        userGrowthPct = resolveOptionGrowthPct(userOptions, optionName, isDefault);
      }
    }

    // Resolve fees per-variation — each can specify its own fund_name
    const scenarioInputs = await Promise.all(input.variations.map(async (v) => {
      const variationOverrides = { ...(v.overrides as ScenarioOverrides) };
      const fundName = v.fund_name ?? userFundName;

      if (input.intent === 'compare_super_longevity') {
        variationOverrides.projection_scope = 'super_only';
      }

      if (variationOverrides.super_fees_flat == null && variationOverrides.super_fees_percent == null) {
        if (fundName) {
          const fees = await resolveFundFeesForName(fundName, userGrowthPct, balance, birthYear);
          variationOverrides.super_fees_flat = fees.flat;
          variationOverrides.super_fees_percent = fees.percent;

          if (fees.product) {
            const alreadyPresent = ctx.searchProductResults.some(
              (r) => (r.product.name as string) === (fees.product!.name as string),
            );
            if (!alreadyPresent) {
              ctx.searchProductResults.push({
                product: fees.product,
                fee_at_balance: calculateAnnualFee(
                  { ...(fees.product.fee_structure as FeeStructure), investment_options: (fees.product.investment_options as InvestmentOption[]) ?? [] },
                  balance, undefined, birthYear,
                ),
              });
            }
          }
        }
      }

      if (variationOverrides.projection_years == null) {
        const scopedYears = projectionYearsForIntent(
          input.intent, undefined, ctx.profileData, variationOverrides,
        );
        if (scopedYears != null) {
          variationOverrides.projection_years = scopedYears;
        }
      }
      return buildScenarioFromProfile(available, variationOverrides, v.name);
    }));

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
  const options = (product.investment_options as InvestmentOption[]) ?? [];
  const feeStructure: FeeStructure = {
    ...(product.fee_structure as FeeStructure),
    investment_options: options,
  };

  const { components, resolvedOptionName } = decomposeFeeComponents(
    feeStructure, balanceUsed, undefined, birthYear,
  );
  const totalAnnualFee = components.reduce((sum, c) => sum + c.annual_dollar, 0);

  let matchedOption: InvestmentOption | undefined;
  if (resolvedOptionName) {
    matchedOption = options.find((o) => o.name === resolvedOptionName);
  }
  const displayOption = matchedOption ?? options[0];

  const optionName = resolvedOptionName ?? displayOption?.name ?? 'Balanced';
  const growthPct = displayOption?.growth_pct ?? 70;
  const defensivePct = 100 - growthPct;

  return {
    fund_name: (product.fund_name ?? product.name ?? 'Unknown Fund') as string,
    investment_option: optionName,
    growth_pct: growthPct,
    defensive_pct: defensivePct,
    total_annual_fee: Math.round(totalAnnualFee * 100) / 100,
    fee_components: components,
  };
}

function buildYearlyFeeProjections(
  searchProductResults: Array<{ product: Record<string, unknown>; fee_at_balance: number }>,
  comparisonResult: ComparisonResult,
  birthYear?: number,
): FundFeeProjection[] {
  const projections: FundFeeProjection[] = [];

  for (const { product } of searchProductResults) {
    const fundName = ((product.fund_name ?? product.name ?? 'Unknown Fund') as string);
    const fundNameLower = fundName.toLowerCase();

    const matchedScenario = comparisonResult.scenarios.find((s) => {
      const scenarioLower = s.scenario_name.toLowerCase();
      return scenarioLower.includes(fundNameLower) || fundNameLower.includes(scenarioLower);
    });

    if (!matchedScenario || matchedScenario.trajectory.length === 0) continue;

    const options = (product.investment_options as InvestmentOption[]) ?? [];
    const feeStructure: FeeStructure = {
      ...(product.fee_structure as FeeStructure),
      investment_options: options,
    };

    const rows: FeeProjectionRow[] = [];
    let cumulative = 0;

    for (const point of matchedScenario.trajectory) {
      const bal = point.super_balance;
      const { components } = decomposeFeeComponents(feeStructure, bal, undefined, birthYear);

      let adminDollar = 0;
      let investmentDollar = 0;
      let yearlyTotal = 0;

      for (const c of components) {
        yearlyTotal += c.annual_dollar;
        if (c.label === 'Investment Fee') {
          investmentDollar += c.annual_dollar;
        } else {
          adminDollar += c.annual_dollar;
        }
      }

      cumulative += yearlyTotal;

      rows.push({
        year: point.year,
        balance: bal,
        admin_fee_dollar: Math.round(adminDollar * 100) / 100,
        admin_fee_effective_pct: bal > 0 ? Math.round((adminDollar / bal) * 10000) / 100 : 0,
        investment_fee_dollar: Math.round(investmentDollar * 100) / 100,
        yearly_total: Math.round(yearlyTotal * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
      });
    }

    projections.push({ fund_name: fundName, rows });
  }

  return projections;
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
      return await handleGetRequiredFields(
        input as Parameters<typeof handleGetRequiredFields>[0],
        ctx,
      );
    case 'run_projection':
      return await handleRunProjection(
        input as Parameters<typeof handleRunProjection>[0],
        ctx,
      );
    case 'compare_scenarios':
      return await handleCompareScenarios(
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

  const fundName = ctx.profileData.super_fund_name as string | undefined;
  if (fundName) {
    const option = ctx.profileData.super_investment_option as string | undefined;
    const isDefault = ctx.profileData.is_default_investment === true
      || ctx.profileData.is_default_investment === 'true';
    const optionLabel = isDefault ? 'default option' : (option ?? 'default option');
    list.push(`Using ${fundName} fees (${optionLabel}).`);
  } else {
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
  if (ctx.searchProductResults.length >= 2) {
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

    if (ctx.lastComparisonResult && ctx.lastComparisonResult.scenarios.length > 0) {
      feeBreakdownComparison.yearly_fee_projections =
        buildYearlyFeeProjections(ctx.searchProductResults, ctx.lastComparisonResult, birthYear);
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
