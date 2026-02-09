/**
 * Central export for all Australian tax, super, and Centrelink rates
 * 
 * Import specific rates as needed:
 * ```typescript
 * import { TAX_BRACKETS, LITO } from '@/engine/rates';
 * import { SG_RATES, CONTRIBUTION_CAPS } from '@/engine/rates';
 * import { AGE_PENSION_RATES } from '@/engine/rates';
 * ```
 * 
 * For FY2025-26 rates (with 12% SG), import directly from fy2026.ts:
 * ```typescript
 * import { TAX_BRACKETS, HELP_REPAYMENT_RATES } from '@/engine/rates/fy2026';
 * ```
 */

// FY2024-25 Tax rates (default exports)
export {
  TAX_BRACKETS,
  LITO,
  SAPTO,
  MEDICARE_LEVY,
  HELP_REPAYMENT_RATES,
  DIV_293_THRESHOLD,
  type TaxBracket,
  type LITOConfig,
  type SAPTOConfig,
  type MedicareLevyConfig,
  type HELPRepaymentRate,
} from './fy2025';

// Superannuation rates
export {
  SG_RATES,
  CONTRIBUTION_CAPS,
  PRESERVATION_AGES,
  MINIMUM_DRAWDOWN_RATES,
  getSGRate,
  getPreservationAge,
  getMinimumDrawdownRate,
  type SuperGuaranteeRate,
  type ContributionCaps,
  type PreservationAge,
  type MinimumDrawdownRate,
} from './super-fy2025';

// Centrelink rates
export {
  AGE_PENSION_RATES,
  INCOME_TEST,
  ASSETS_TEST,
  DEEMING_RATES,
  WORK_BONUS,
  calculateDeemedIncome,
  calculatePensionIncomeTest,
  calculatePensionAssetsTest,
  calculateAgePension,
  type PensionRates,
  type IncomeTest,
  type AssetsTest,
  type DeemedIncomeRates,
  type WorkBonus,
} from './centrelink-fy2025';

// Economic assumptions
export {
  INVESTMENT_RETURNS,
  ECONOMIC_ASSUMPTIONS,
  getInvestmentReturn,
  calculateRealReturn,
  projectFutureValue,
  inflationAdjust,
  type InvestmentReturnsByRisk,
  type EconomicAssumptions,
} from './economic';

// ASFA Retirement Standard
export {
  RETIREMENT_STANDARD,
  LUMP_SUM_AT_RETIREMENT,
  getAnnualBudget,
  getLumpSumTarget,
  getMonthlyBudget,
  getFortnightlyBudget,
  type RetirementStandardBudget,
  type RetirementStandardLumpSums,
} from './asfa';

// Rate Resolver (for projections across multiple financial years)
export {
  getRatesForFY,
  type FYRates,
  type Assumptions,
} from './resolver';
