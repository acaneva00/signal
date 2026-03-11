/**
 * Lightweight keyword-based intent classifier.
 *
 * Used for fast, deterministic routing when the AI orchestrator
 * is not in the loop (e.g. comparison flows, tests).
 */

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
  for (const pattern of COMPARE_FUND_PATTERNS) {
    if (pattern.test(message)) return 'compare_fund';
  }
  return 'education';
}
