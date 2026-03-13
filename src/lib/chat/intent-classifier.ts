/**
 * Lightweight keyword-based intent classifier.
 *
 * Used for fast, deterministic routing when the AI orchestrator
 * is not in the loop (e.g. comparison flows, tests).
 */

const COMPARE_SUPER_LONGIVITY_PATTERNS: RegExp[] = [
  /which fund.*last longer/i,
  /super last.*compare/i,
  /compare.*(?:super|fund).*last/i,
  /last longer.*(?:super|fund)/i,
];

const COMPARE_SUPER_PROJECTION_PATTERNS: RegExp[] = [
  /compare.*(?:balance|super).*at retirement/i,
  /what if.*(?:switch|switched|changed).*(?:super|fund)/i,
  /what if.*(?:i was with|with) (?:australian|aussie|vanguard|hostplus)/i,
  /how would.*(?:super|balance).*compare.*(?:switch|fund)/i,
];

const COMPARE_FUND_PATTERNS: RegExp[] = [
  /compare.*(?:super|fund)/i,
  /(?:super|fund).*compare/i,
  /how.*(?:my|does).*compare/i,
  /paying too much.*fee/i,
  /fees?\s+(?:are\s+)?too\s+(?:much|high)/i,
  /overpay.*(?:super|fund|fee)/i,
  /(?:super|fund).*expensive/i,
  /switch.*(?:super|fund)/i,
  /am i paying too much/i,
];

export async function classifyIntent(message: string): Promise<string> {
  for (const pattern of COMPARE_SUPER_LONGIVITY_PATTERNS) {
    if (pattern.test(message)) return 'compare_super_longevity';
  }
  for (const pattern of COMPARE_SUPER_PROJECTION_PATTERNS) {
    if (pattern.test(message)) return 'compare_super_projection';
  }
  for (const pattern of COMPARE_FUND_PATTERNS) {
    if (pattern.test(message)) return 'compare_fund';
  }
  return 'education';
}
