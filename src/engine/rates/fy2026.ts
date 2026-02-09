/**
 * Australian Tax Rates for FY2025-26 (1 July 2025 - 30 June 2026)
 * 
 * IMPORTANT: These rates are based on legislated changes and FY2024-25 baseline values.
 * Values subject to indexation (HELP thresholds, Medicare levy thresholds, SAPTO thresholds)
 * should be updated when the ATO publishes official rates for FY2025-26.
 * 
 * Legislated changes for FY2025-26:
 * - SG rate increases to 12% (see super-fy2025.ts)
 * - Tax brackets remain unchanged (Stage 3 continues)
 * 
 * Sources:
 * - Tax brackets (Stage 3): https://www.ato.gov.au/rates/individual-income-tax-rates/
 * - LITO: https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/offsets-and-rebates/low-income-tax-offset
 * - SAPTO: https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/offsets-and-rebates/seniors-and-pensioners-tax-offset
 * - Medicare levy: https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy
 * - HELP repayment: https://www.ato.gov.au/individuals-and-families/education-and-study/help-hecs-and-tsl/help-repayment-thresholds-and-rates
 * - Div 293: https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/division-293-tax
 */

export interface TaxBracket {
  minIncome: number;
  maxIncome: number | null; // null for top bracket
  rate: number; // as decimal (e.g., 0.16 for 16%)
  baseAmount: number; // tax on income up to minIncome
}

export interface LITOConfig {
  maxOffset: number;
  shadeOutStart: number;
  shadeOutRate: number; // as decimal
  shadeOutEnd: number;
}

export interface SAPTOConfig {
  single: {
    maxOffset: number;
    shadeOutStart: number;
    shadeOutRate: number;
  };
  couple: {
    maxOffset: number;
    shadeOutStart: number;
    shadeOutRate: number;
  };
}

export interface MedicareLevyConfig {
  rate: number; // as decimal
  shadeInThresholds: {
    single: {
      lowerThreshold: number;
      upperThreshold: number;
    };
    family: {
      lowerThreshold: number;
      upperThreshold: number;
      perChildAdditional: number;
    };
    seniorsAndPensioners: {
      single: {
        lowerThreshold: number;
        upperThreshold: number;
      };
      family: {
        lowerThreshold: number;
        upperThreshold: number;
        perChildAdditional: number;
      };
    };
  };
}

export interface HELPRepaymentRate {
  minIncome: number;
  maxIncome: number | null;
  rate: number; // as decimal
}

// Tax brackets for FY2025-26 (Stage 3 continues unchanged)
export const TAX_BRACKETS: TaxBracket[] = [
  { minIncome: 0, maxIncome: 18200, rate: 0, baseAmount: 0 },
  { minIncome: 18201, maxIncome: 45000, rate: 0.16, baseAmount: 0 },
  { minIncome: 45001, maxIncome: 135000, rate: 0.30, baseAmount: 4288 },
  { minIncome: 135001, maxIncome: 190000, rate: 0.37, baseAmount: 31288 },
  { minIncome: 190001, maxIncome: null, rate: 0.45, baseAmount: 51638 },
];

// Low Income Tax Offset (LITO)
// NOTE: Values unchanged from FY2024-25. Update when ATO publishes indexed amounts.
export const LITO: LITOConfig = {
  maxOffset: 700,
  shadeOutStart: 37500,
  shadeOutRate: 0.05, // 5c per $1
  shadeOutEnd: 66667,
};

// Seniors and Pensioners Tax Offset (SAPTO)
// NOTE: Thresholds subject to indexation. Update when ATO publishes FY2025-26 rates.
export const SAPTO: SAPTOConfig = {
  single: {
    maxOffset: 2230,
    shadeOutStart: 32279,
    shadeOutRate: 0.125, // 12.5%
  },
  couple: {
    maxOffset: 1602,
    shadeOutStart: 28974,
    shadeOutRate: 0.125, // 12.5%
  },
};

// Medicare Levy
// NOTE: Thresholds subject to indexation. Update when ATO publishes FY2025-26 rates.
export const MEDICARE_LEVY: MedicareLevyConfig = {
  rate: 0.02, // 2%
  shadeInThresholds: {
    single: {
      lowerThreshold: 26000,
      upperThreshold: 32500,
    },
    family: {
      lowerThreshold: 43846,
      upperThreshold: 54808,
      perChildAdditional: 4027,
    },
    seniorsAndPensioners: {
      single: {
        lowerThreshold: 41089,
        upperThreshold: 51362,
      },
      family: {
        lowerThreshold: 57198,
        upperThreshold: 71498,
        perChildAdditional: 4027,
      },
    },
  },
};

// HELP/HECS Repayment rates for FY2025-26
// NOTE: Thresholds indexed annually. These are FY2024-25 baseline values.
// Update when ATO publishes indexed thresholds for FY2025-26 (typically May/June).
export const HELP_REPAYMENT_RATES: HELPRepaymentRate[] = [
  { minIncome: 0, maxIncome: 54435, rate: 0 },
  { minIncome: 54436, maxIncome: 62850, rate: 0.01 },
  { minIncome: 62851, maxIncome: 66620, rate: 0.02 },
  { minIncome: 66621, maxIncome: 70618, rate: 0.025 },
  { minIncome: 70619, maxIncome: 74855, rate: 0.03 },
  { minIncome: 74856, maxIncome: 79346, rate: 0.035 },
  { minIncome: 79347, maxIncome: 84107, rate: 0.04 },
  { minIncome: 84108, maxIncome: 89154, rate: 0.045 },
  { minIncome: 89155, maxIncome: 94503, rate: 0.05 },
  { minIncome: 94504, maxIncome: 100174, rate: 0.055 },
  { minIncome: 100175, maxIncome: 106185, rate: 0.06 },
  { minIncome: 106186, maxIncome: 112556, rate: 0.065 },
  { minIncome: 112557, maxIncome: 119309, rate: 0.07 },
  { minIncome: 119310, maxIncome: 126467, rate: 0.075 },
  { minIncome: 126468, maxIncome: 134056, rate: 0.08 },
  { minIncome: 134057, maxIncome: 142100, rate: 0.085 },
  { minIncome: 142101, maxIncome: 150626, rate: 0.09 },
  { minIncome: 150627, maxIncome: 159663, rate: 0.095 },
  { minIncome: 159664, maxIncome: null, rate: 0.10 },
];

// Division 293 tax threshold
export const DIV_293_THRESHOLD = 250000;
