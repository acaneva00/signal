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
import type { InputRequest } from '@/types/agent';
import {
  type ProfileData,
  type ScenarioOverrides,
  checkFieldAvailability,
  buildScenarioFromProfile,
} from './scenario-builder';

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
  assumptions: string[];
  disclaimers: string[];
  input_request: InputRequest | null;
}

// ── Config ───────────────────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514';
const MAX_TOOL_ITERATIONS = 5;
const CONTEXT_MESSAGE_LIMIT = 20;

// ── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_required_fields',
    description:
      'Check which profile fields are required for a financial intent and ' +
      'identify any missing data. Returns required fields, missing fields, ' +
      'available values, and a suggested input widget for the first missing ' +
      'field. Always call this before run_projection.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intent: {
          type: 'string',
          enum: [
            'super_at_age',
            'super_longevity',
            'take_home_pay',
            'aged_pension',
            'compare_retirement_age',
            'fee_impact',
            'extra_mortgage_payment',
            'household_net_worth',
          ],
          description: 'The classified financial intent',
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
            'Optional economic-assumption overrides from the user ' +
            '(e.g. { "inflation_rate": 0.04 }).',
          properties: {
            inflation_rate: { type: 'number' },
            wage_growth_rate: { type: 'number' },
            investment_return: { type: 'number' },
            retirement_age: { type: 'number' },
            extra_super_contribution: { type: 'number' },
            extra_mortgage_payment: { type: 'number' },
            super_fees_flat: { type: 'number' },
            super_fees_percent: { type: 'number' },
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
      },
      required: ['intent', 'variations'],
    },
  },
];

// ── Structured Input Requests ────────────────────────────────────────────────

const FIELD_INPUT_REQUESTS: Record<string, InputRequest> = {
  date_of_birth_year: {
    type: 'numeric_input',
    range: { min: 1930, max: 2010, step: 1, default: 1985, format: 'year' },
    field: 'date_of_birth_year',
    required: true,
  },
  income: {
    type: 'numeric_input',
    range: { min: 0, max: 500_000, step: 5_000, default: 75_000, format: 'currency' },
    field: 'annual_income',
    required: true,
  },
  super_balance: {
    type: 'numeric_input',
    range: { min: 0, max: 3_000_000, step: 10_000, default: 50_000, format: 'currency' },
    field: 'super_balance',
    required: true,
  },
  intended_retirement_age: {
    type: 'numeric_input',
    range: { min: 55, max: 75, step: 1, default: 67, format: 'number' },
    field: 'intended_retirement_age',
    required: true,
  },
  expenses: {
    type: 'numeric_input',
    range: { min: 0, max: 200_000, step: 5_000, default: 50_000, format: 'currency' },
    field: 'expenses',
    required: true,
  },
  relationship_status: {
    type: 'single_select',
    options: [
      { label: 'Single', value: 'single' },
      { label: 'Partnered/de facto', value: 'partnered' },
      { label: 'Married', value: 'married' },
      { label: 'Separated/divorced', value: 'separated' },
    ],
    field: 'relationship_status',
    required: true,
  },
  is_homeowner: {
    type: 'single_select',
    options: [
      { label: 'Own (with mortgage)', value: 'own_with_mortgage' },
      { label: 'Own (outright)', value: 'own_outright' },
      { label: 'Rent', value: 'rent' },
      { label: 'Living with family', value: 'living_with_family' },
      { label: 'Other', value: 'other' },
    ],
    field: 'housing_status',
    required: true,
  },
  has_hecs_help_debt: {
    type: 'single_select',
    options: [
      { label: 'Yes', value: 'true' },
      { label: 'No', value: 'false' },
    ],
    field: 'has_hecs_help_debt',
    required: true,
  },
  hecs_help_balance: {
    type: 'numeric_input',
    range: { min: 0, max: 200_000, step: 1_000, default: 25_000, format: 'currency' },
    field: 'hecs_help_balance',
    required: true,
  },
  mortgage_balance: {
    type: 'numeric_input',
    range: { min: 0, max: 3_000_000, step: 10_000, default: 400_000, format: 'currency' },
    field: 'mortgage_balance',
    required: true,
  },
  mortgage_rate: {
    type: 'numeric_input',
    range: { min: 0, max: 15, step: 0.05, default: 6.0, format: 'percent' },
    field: 'mortgage_rate',
    required: true,
  },
  mortgage_repayment: {
    type: 'numeric_input',
    range: { min: 0, max: 10_000, step: 100, default: 2_500, format: 'currency' },
    field: 'mortgage_repayment',
    required: true,
  },
  assets: {
    type: 'numeric_input',
    range: { min: 0, max: 5_000_000, step: 10_000, default: 50_000, format: 'currency' },
    field: 'assets',
    required: true,
  },
  liabilities: {
    type: 'numeric_input',
    range: { min: 0, max: 3_000_000, step: 10_000, default: 0, format: 'currency' },
    field: 'liabilities',
    required: true,
  },
  super_fees: {
    type: 'free_text',
    field: 'super_fees',
    required: false,
    allow_free_text: true,
  },
};

// ── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(availableFields: string[]): string {
  return `You are Signal, an Australian financial guidance assistant. You help users understand their financial position through projections powered by a unified calculation engine.

YOUR ROLE:
- Classify user messages into financial intents
- Check data availability before running projections
- Run projections with engine tools and explain results in plain language
- You NEVER give personal financial advice or product recommendations
- You NEVER compute numbers yourself — always use the engine tools

INTENTS:
- super_at_age: Super balance at a specific age ("How much super will I have at 67?")
- super_longevity: Whether super lasts through retirement ("Will my super last?")
- take_home_pay: Take-home pay calculation ("What's my take-home pay?")
- aged_pension: Age pension eligibility and amount ("Will I get the aged pension?")
- compare_retirement_age: Compare retirement ages ("Retire at 60 vs 67?")
- fee_impact: Impact of super fund fees over time
- extra_mortgage_payment: Impact of extra mortgage payments
- household_net_worth: Household net worth projection
- education: General financial question — answer directly without the engine

WORKFLOW:
1. Classify the user's intent
2. For calculation intents: call get_required_fields to check data availability
3. If fields are missing: ask the user ONE question, in priority order
4. If all fields present: call run_projection (or compare_scenarios for comparisons)
5. Explain results in plain language with assumptions listed

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

When asking for a field, the get_required_fields tool returns an input_request object. Reference the field naturally in your question — the frontend will render the appropriate input widget.

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

USER'S AVAILABLE PROFILE FIELDS: [${availableFields.length > 0 ? availableFields.join(', ') : 'none yet'}]
Only these fields have data. Do NOT ask for fields that are already available unless the user wants to update them.`;
}

// ── Tool Context (captures side-effects during the tool loop) ────────────────

interface ToolContext {
  profileData: ProfileData;
  lastProjectionResult: ProjectionResult | null;
  lastProjectionSummary: ProjectionSummary | null;
  lastComparisonResult: ComparisonResult | null;
  lastInputRequest: InputRequest | null;
  classifiedIntent: string | null;
  lastOverrides: ScenarioOverrides | null;
}

// ── Tool Handlers ────────────────────────────────────────────────────────────

function handleGetRequiredFields(
  input: { intent: string },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  const requiredFields = getRequiredVariables(input.intent);
  if (requiredFields.length === 0) {
    return {
      intent: input.intent,
      error: `Unknown intent: ${input.intent}. No required fields defined.`,
    };
  }

  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  const inputRequest =
    missing.length > 0 ? (FIELD_INPUT_REQUESTS[missing[0]] ?? null) : null;
  if (inputRequest) {
    ctx.lastInputRequest = inputRequest;
  }

  return {
    intent: input.intent,
    required_fields: requiredFields,
    missing_fields: missing,
    available_data: available,
    input_request: inputRequest,
  };
}

function handleRunProjection(
  input: {
    intent: string;
    target_age?: number;
    projection_years?: number;
    overrides?: ScenarioOverrides;
  },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  const requiredFields = getRequiredVariables(input.intent);
  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  if (missing.length > 0) {
    return {
      success: false,
      error: `Cannot run projection — missing fields: ${missing.join(', ')}. Call get_required_fields first.`,
    };
  }

  const overrides: ScenarioOverrides = {
    ...input.overrides,
    ...(input.projection_years != null ? { projection_years: input.projection_years } : {}),
    ...(input.target_age != null ? { retirement_age: input.target_age } : {}),
  };
  ctx.lastOverrides = overrides;

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

    return { success: true, summary, warnings: result.warnings };
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
  },
  ctx: ToolContext,
): Record<string, unknown> {
  ctx.classifiedIntent = input.intent;

  const requiredFields = getRequiredVariables(input.intent);
  const { available, missing } = checkFieldAvailability(ctx.profileData, requiredFields);

  if (missing.length > 0) {
    return {
      success: false,
      error: `Cannot compare — missing fields: ${missing.join(', ')}`,
    };
  }

  try {
    const scenarioInputs = input.variations.map((v) =>
      buildScenarioFromProfile(available, v.overrides as ScenarioOverrides, v.name),
    );

    const result = compareScenarios(scenarioInputs);
    ctx.lastComparisonResult = result;

    return { success: true, comparison: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Comparison failed',
    };
  }
}

function executeToolCall(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Record<string, unknown> {
  switch (name) {
    case 'get_required_fields':
      return handleGetRequiredFields(input as { intent: string }, ctx);
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
    lastProjectionResult: null,
    lastProjectionSummary: null,
    lastComparisonResult: null,
    lastInputRequest: null,
    classifiedIntent: null,
    lastOverrides: null,
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

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map(
      (block) => ({
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: JSON.stringify(executeToolCall(block.name, block.input, ctx)),
      }),
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
  const messageText = textBlocks.map((b) => b.text).join('\n');

  const assumptions = buildAssumptionsList(ctx);
  const hasProjection = ctx.lastProjectionResult !== null;
  const hasComparison = ctx.lastComparisonResult !== null;

  return {
    message: messageText,
    agent_used:
      ctx.classifiedIntent && ctx.classifiedIntent !== 'education'
        ? 'calculation'
        : 'education',
    intent_classified: ctx.classifiedIntent,
    projection_result: ctx.lastProjectionResult,
    projection_summary: ctx.lastProjectionSummary,
    comparison_result: ctx.lastComparisonResult,
    assumptions,
    disclaimers:
      hasProjection || hasComparison
        ? [
            'This is a projection based on assumptions, not financial advice. ' +
              'Consider speaking to a licensed financial adviser for personal advice.',
          ]
        : [],
    input_request: hasProjection || hasComparison ? null : ctx.lastInputRequest,
  };
}
