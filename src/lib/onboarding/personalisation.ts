import Anthropic from '@anthropic-ai/sdk'
import { type CalculationIntentName, getPlainEnglish } from '@/lib/intents'

export interface OnboardingGreetingData {
  age_bracket?: string
  household?: string
  income_bracket?: string
  financial_confidence?: string
  priority_areas?: string[]
}

export interface QuizSessionData {
  age_bracket?: 'under_25' | '25_34' | '35_44' | '45_54' | '55_64' | '65_plus'
  household?: 'single' | 'partnered' | 'single_with_kids' | 'partnered_with_kids'
  income_bracket?: 'under_50k' | '50k_100k' | '100k_150k' | '150k_200k' | '200k_plus'
  financial_confidence?: 'just_starting' | 'getting_there' | 'pretty_savvy' | 'very_confident'
  priority_areas?: string[]
  personalised_greeting?: string
  suggested_intents?: string[]
}

const PRIORITY_TO_INTENTS: Record<string, CalculationIntentName[]> = {
  super_retirement: ['super_at_age', 'super_longevity', 'compare_super_projection', 'compare_super_longevity'],
  take_home_pay: ['take_home_pay'],
  mortgage_debt: ['extra_mortgage_payment'],
  net_worth: ['household_net_worth'],
  aged_pension: ['aged_pension'],
  all_of_it: ['super_at_age', 'take_home_pay', 'household_net_worth'],
}

const AGE_DEFAULT_INTENTS: Record<string, CalculationIntentName[]> = {
  under_25: ['take_home_pay', 'super_at_age'],
  '25_34': ['take_home_pay', 'super_at_age'],
  '35_44': ['super_at_age', 'household_net_worth'],
  '45_54': ['super_at_age', 'household_net_worth'],
  '55_64': ['super_longevity', 'aged_pension'],
  '65_plus': ['super_longevity', 'aged_pension'],
}

const OPENING_LINES: Record<string, string> = {
  under_25: "You're at a great stage to build strong financial foundations.",
  '25_34': "You're at a great stage to build strong financial foundations.",
  '35_44': 'This is the decade where financial decisions really compound.',
  '45_54': "You're in the zone where the big levers — super and debt — make the most difference.",
  '55_64': 'With retirement on the horizon, getting the picture clear now pays off.',
  '65_plus': "Let's make sure your money is working as hard as it should be.",
}

const HOUSEHOLD_MODIFIERS: Record<string, string> = {
  partnered: " I can model your household as a couple when you're ready.",
  partnered_with_kids: " I can model your household as a couple when you're ready.",
  single_with_kids: " I'll keep in mind you're managing on a single income.",
}

const PRIORITY_SENTENCES: Record<string, string> = {
  take_home_pay:
    'A good place to start is seeing exactly how much of your income lands in your pocket after tax.',
  super_at_age:
    'I can show you where your super is projected to land at retirement — and what it would take to change that number.',
  super_longevity:
    'I can show you where your super is projected to land at retirement — and what it would take to change that number.',
  extra_mortgage_payment:
    'I can show you how much time and interest an extra mortgage repayment saves.',
  household_net_worth:
    "We can build out a full picture of your household's net worth trajectory.",
  aged_pension:
    "I can work out whether you're likely to qualify for the age pension and what that's worth.",
  compare_super_projection:
    'I can compare how your super would look at retirement if you switched to a different fund.',
  compare_super_longevity:
    'I can compare which fund would make your super last longer in retirement.',
}

const CONFIDENCE_LINES: Record<string, string> = {
  just_starting: "I'll keep explanations plain and jargon-free.",
  getting_there: "I'll give you the numbers with enough context to act on them.",
  pretty_savvy: "I'll give you the numbers straight — ask me to go deeper on anything.",
  very_confident: "I'll give you the full detail. Ask me anything.",
}

function deriveIntents(data: QuizSessionData): CalculationIntentName[] {
  const raw: CalculationIntentName[] = []

  if (data.priority_areas && data.priority_areas.length > 0) {
    for (const area of data.priority_areas) {
      const mapped = PRIORITY_TO_INTENTS[area]
      if (mapped) raw.push(...mapped)
    }
  }

  if (raw.length === 0) {
    const age = data.age_bracket ?? 'under_25'
    raw.push(...(AGE_DEFAULT_INTENTS[age] ?? AGE_DEFAULT_INTENTS.under_25))
  }

  const unique = [...new Set(raw)]
  return unique.slice(0, 3)
}

export function generatePersonalisedGreeting(sessionData: QuizSessionData): {
  greeting: string
  suggested_intents: string[]
} {
  const intents = deriveIntents(sessionData)

  const age = sessionData.age_bracket ?? 'under_25'
  let greeting = OPENING_LINES[age] ?? OPENING_LINES.under_25

  const householdMod = sessionData.household
    ? HOUSEHOLD_MODIFIERS[sessionData.household]
    : undefined
  if (householdMod) greeting += householdMod

  const topIntent = intents[0]
  const prioritySentence = topIntent ? PRIORITY_SENTENCES[topIntent] : undefined
  if (prioritySentence) greeting += '\n\n' + prioritySentence

  const confidence = sessionData.financial_confidence ?? 'getting_there'
  greeting += ' ' + (CONFIDENCE_LINES[confidence] ?? CONFIDENCE_LINES.getting_there)

  greeting += '\n\nHere are a few things you can ask me right now:'

  for (const intent of intents) {
    const desc = getPlainEnglish(intent)
    if (desc) greeting += `\n• ${desc}`
  }

  return { greeting, suggested_intents: intents }
}

// ── AI-Generated Greeting ────────────────────────────────────────────────────

const AI_GREETING_SYSTEM = `You are Signal, an AI financial companion for Australians. Write a short, warm opening message for a new user based on the information below.

Rules:
- Maximum 3 sentences. No more.
- Reference their life stage and household situation IMPLICITLY — convey understanding without stating facts back at them.
- Weave in one or two of their priority topics naturally.
- End with a brief open invitation to explore, not a question.
- Never use phrases like "based on your profile", "I can see that", "you mentioned", or "as a [age group]".
- No bullet points, no lists. Flowing prose only.
- Tone: warm, direct, knowledgeable. Not salesy. Not generic.
- Do not use the user's name in the message.
- Return only the prose message. Nothing else.`

const AI_MODEL = 'claude-sonnet-4-20250514'

export async function generateAIGreeting(data: OnboardingGreetingData): Promise<string> {
  const userMessage = [
    `Age bracket: ${data.age_bracket ?? 'unknown'}`,
    `Household: ${data.household ?? 'unknown'}`,
    `Income bracket: ${data.income_bracket ?? 'unknown'}`,
    `Financial confidence: ${data.financial_confidence ?? 'unknown'}`,
    `Priority areas: ${data.priority_areas?.join(', ') || 'none specified'}`,
  ].join('\n')

  const anthropic = new Anthropic()

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 256,
    system: AI_GREETING_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  if (!text) throw new Error('Empty AI greeting response')
  return text
}
