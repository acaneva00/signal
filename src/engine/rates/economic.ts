/**
 * Economic Assumptions and Investment Return Rates
 * 
 * These are default assumptions used for financial projections.
 * They should be reviewed and updated as economic conditions change.
 * 
 * Last updated: FY2024-25
 * 
 * Sources:
 * - Investment returns based on historical long-term averages and industry standards
 * - Inflation: RBA target range and long-term forecasts
 * - Wage growth: Fair Work Commission decisions and ABS data
 */

export interface InvestmentReturnsByRisk {
  conservative: number; // as decimal (e.g., 0.05 for 5%)
  balanced: number;
  growth: number;
}

export interface EconomicAssumptions {
  inflation: number; // as decimal
  wageGrowth: number; // as decimal
}

// Default investment return assumptions by risk profile
// These are long-term average returns (nominal, before fees and tax)
export const INVESTMENT_RETURNS: InvestmentReturnsByRisk = {
  conservative: 0.05,  // 5% - High allocation to fixed interest and cash
  balanced: 0.07,      // 7% - Moderate allocation to growth and defensive assets
  growth: 0.085,       // 8.5% - High allocation to shares and property
};

// Default economic assumptions
export const ECONOMIC_ASSUMPTIONS: EconomicAssumptions = {
  inflation: 0.025,    // 2.5% - RBA target midpoint
  wageGrowth: 0.035,   // 3.5% - Long-term average
};

/**
 * Risk profiles and typical asset allocations:
 * 
 * Conservative (5% return):
 * - Cash: 20%
 * - Fixed Interest: 50%
 * - Property: 10%
 * - Australian Shares: 10%
 * - International Shares: 10%
 * 
 * Balanced (7% return):
 * - Cash: 10%
 * - Fixed Interest: 30%
 * - Property: 15%
 * - Australian Shares: 25%
 * - International Shares: 20%
 * 
 * Growth (8.5% return):
 * - Cash: 5%
 * - Fixed Interest: 15%
 * - Property: 15%
 * - Australian Shares: 35%
 * - International Shares: 30%
 */

// Helper function to get investment return by risk profile
export function getInvestmentReturn(riskProfile: 'conservative' | 'balanced' | 'growth'): number {
  return INVESTMENT_RETURNS[riskProfile];
}

// Helper function to calculate real return (after inflation)
export function calculateRealReturn(nominalReturn: number, inflation?: number): number {
  const inflationRate = inflation ?? ECONOMIC_ASSUMPTIONS.inflation;
  return (1 + nominalReturn) / (1 + inflationRate) - 1;
}

// Helper function to project future value with returns
export function projectFutureValue(
  presentValue: number,
  returnRate: number,
  years: number
): number {
  return presentValue * Math.pow(1 + returnRate, years);
}

// Helper function to calculate inflation-adjusted value
export function inflationAdjust(
  value: number,
  years: number,
  inflationRate?: number
): number {
  const rate = inflationRate ?? ECONOMIC_ASSUMPTIONS.inflation;
  return value * Math.pow(1 + rate, years);
}
