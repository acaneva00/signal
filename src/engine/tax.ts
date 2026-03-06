/**
 * Australian Individual Income Tax Module
 *
 * Calculates individual income tax including:
 * - Marginal tax rates (2024-25 Stage 3 brackets)
 * - Medicare Levy (2%)
 * - Low Income Tax Offset (LITO)
 * - Senior Australians and Pensioners Tax Offset (SAPTO)
 * - Franking credit gross-up and offset
 * - HELP/HECS-HELP repayments
 * - Division 293 additional super tax
 * - PAYG withholding estimates
 *
 * All calculations are per-individual (Australia has individual taxation).
 * All functions are pure - no side effects.
 */

import { getRatesForFY, type Assumptions } from './rates/resolver';
import type {
  TaxBracket,
  LITOConfig,
  SAPTOConfig,
  HELPRepaymentRate,
} from './rates/fy2025';
import {
  TAX_BRACKETS,
  LITO,
  SAPTO,
  MEDICARE_LEVY,
  HELP_REPAYMENT_RATES,
  DIV_293_THRESHOLD,
} from './rates/fy2025';

export interface TaxResult {
  grossIncome: number;
  deductions: number;
  taxableIncome: number;
  baseTax: number;
  medicareLevy: number;
  lito: number;
  sapto: number;
  frankingCreditOffset: number;
  hecsRepayment: number;
  totalTax: number;
  effectiveRate: number;
}

/**
 * Calculate base income tax using marginal rates
 *
 * @param taxableIncome - Taxable income after deductions
 * @param brackets - Optional override tax brackets (defaults to FY2024-25 Stage 3)
 * @returns Base tax amount before offsets
 */
export function calculateBaseTax(
  taxableIncome: number,
  brackets: TaxBracket[] = TAX_BRACKETS
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  let tax = 0;
  let prevUpper = 0;

  for (const bracket of brackets) {
    const upper = bracket.maxIncome;

    if (upper === null) {
      tax += (taxableIncome - prevUpper) * bracket.rate;
      break;
    } else if (taxableIncome <= upper) {
      tax += (taxableIncome - prevUpper) * bracket.rate;
      break;
    } else {
      tax += (upper - prevUpper) * bracket.rate;
      prevUpper = upper;
    }
  }

  return Math.max(0, tax);
}

/**
 * Calculate Medicare Levy with low-income shade-in
 *
 * @param taxableIncome - Taxable income
 * @param isCouple - Whether person is part of a couple
 * @param numDependents - Number of dependent children
 * @returns Medicare levy amount
 */
export function calculateMedicareLevy(
  taxableIncome: number,
  isCouple: boolean = false,
  numDependents: number = 0
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  const medicareRate = MEDICARE_LEVY.rate;
  let lowerThreshold: number;
  let upperThreshold: number;

  if (isCouple) {
    lowerThreshold =
      MEDICARE_LEVY.shadeInThresholds.family.lowerThreshold +
      numDependents * MEDICARE_LEVY.shadeInThresholds.family.perChildAdditional;
    upperThreshold =
      MEDICARE_LEVY.shadeInThresholds.family.upperThreshold +
      numDependents * MEDICARE_LEVY.shadeInThresholds.family.perChildAdditional;
  } else {
    lowerThreshold = MEDICARE_LEVY.shadeInThresholds.single.lowerThreshold;
    upperThreshold = MEDICARE_LEVY.shadeInThresholds.single.upperThreshold;
  }

  if (taxableIncome <= lowerThreshold) {
    return 0;
  }

  if (taxableIncome <= upperThreshold) {
    return (taxableIncome - lowerThreshold) * 0.1;
  }

  return taxableIncome * medicareRate;
}

/**
 * Calculate Low Income Tax Offset (LITO)
 *
 * @param taxableIncome - Taxable income
 * @returns LITO reduction amount
 */
export function calculateLito(taxableIncome: number): number {
  if (taxableIncome <= LITO.shadeOutStart) {
    return LITO.maxOffset;
  }

  const phase1End = 45000;
  const litoAt45k = 325;

  if (taxableIncome <= phase1End) {
    const reduction = (taxableIncome - LITO.shadeOutStart) * 0.05;
    return Math.max(litoAt45k, LITO.maxOffset - reduction);
  }

  if (taxableIncome <= LITO.shadeOutEnd) {
    const reduction = (taxableIncome - phase1End) * 0.015;
    return Math.max(0, litoAt45k - reduction);
  }

  return 0;
}

/**
 * Calculate Senior Australians and Pensioners Tax Offset (SAPTO)
 *
 * Eligible if: age pension age (67+) AND receiving government pension/allowance
 *
 * @param taxableIncome - Taxable income
 * @param isCouple - Whether person is part of a couple
 * @returns SAPTO reduction amount
 */
export function calculateSapto(
  taxableIncome: number,
  isCouple: boolean = false
): number {
  const config = isCouple ? SAPTO.couple : SAPTO.single;

  if (taxableIncome <= config.shadeOutStart) {
    return config.maxOffset;
  }

  const reduction = (taxableIncome - config.shadeOutStart) * config.shadeOutRate;
  return Math.max(0, config.maxOffset - reduction);
}

/**
 * Calculate HELP/HECS-HELP compulsory repayment
 *
 * @param repaymentIncome - Income used for HELP calculation (taxable + reportable super)
 * @param hecsBalance - Remaining HECS debt balance
 * @returns HELP repayment amount (capped at debt balance)
 */
export function calculateHecsRepayment(
  repaymentIncome: number,
  hecsBalance: number
): number {
  if (hecsBalance <= 0 || repaymentIncome <= 0) {
    return 0;
  }

  let rate = 0;

  for (const threshold of HELP_REPAYMENT_RATES) {
    if (
      threshold.maxIncome === null ||
      repaymentIncome <= threshold.maxIncome
    ) {
      rate = threshold.rate;
      break;
    }
  }

  const repayment = repaymentIncome * rate;
  return Math.min(repayment, hecsBalance);
}

/**
 * Calculate Division 293 additional tax on concessional super contributions
 *
 * If income + concessional contributions > $250k, additional 15% tax applies
 * to the amount exceeding the threshold.
 *
 * @param income - Taxable income
 * @param concessionalContributions - Concessional super contributions for the year
 * @returns Additional Division 293 tax
 */
export function calculateDiv293(
  income: number,
  concessionalContributions: number
): number {
  const combinedIncome = income + concessionalContributions;

  if (combinedIncome <= DIV_293_THRESHOLD) {
    return 0;
  }

  const excessContributions = Math.min(
    concessionalContributions,
    combinedIncome - DIV_293_THRESHOLD
  );

  return excessContributions * 0.15;
}

/**
 * Calculate estimated monthly PAYG withholding
 *
 * Logic: Calculate annual tax on the salary, divide by 12
 *
 * @param annualSalary - Annual gross salary
 * @returns Estimated monthly PAYG withholding amount
 */
export function calculateMonthlyPayg(annualSalary: number): number {
  const annualTax = calculateIndividualTax({
    grossIncome: annualSalary,
  });

  return annualTax.totalTax / 12;
}

export interface IndividualTaxParams {
  grossIncome: number;
  deductions?: number;
  frankingCredits?: number;
  isCouple?: boolean;
  numDependents?: number;
  age?: number;
  receivesAgePension?: boolean;
  hasHecs?: boolean;
  hecsBalance?: number;
  reportableSuperContributions?: number;
  taxBrackets?: TaxBracket[];
}

/**
 * Complete individual income tax calculation
 *
 * @param params - Tax calculation parameters
 * @returns Complete tax breakdown
 */
export function calculateIndividualTax(
  params: IndividualTaxParams
): TaxResult {
  const {
    grossIncome,
    deductions = 0,
    frankingCredits = 0,
    isCouple = false,
    numDependents = 0,
    age = 40,
    receivesAgePension = false,
    hasHecs = false,
    hecsBalance = 0,
    reportableSuperContributions = 0,
    taxBrackets = TAX_BRACKETS,
  } = params;

  const result: TaxResult = {
    grossIncome,
    deductions,
    taxableIncome: 0,
    baseTax: 0,
    medicareLevy: 0,
    lito: 0,
    sapto: 0,
    frankingCreditOffset: 0,
    hecsRepayment: 0,
    totalTax: 0,
    effectiveRate: 0,
  };

  const taxableIncome = Math.max(0, grossIncome - deductions + frankingCredits);
  result.taxableIncome = taxableIncome;

  result.baseTax = calculateBaseTax(taxableIncome, taxBrackets);

  result.medicareLevy = calculateMedicareLevy(
    taxableIncome,
    isCouple,
    numDependents
  );

  const maxLito = calculateLito(taxableIncome);
  const maxSapto =
    age >= 67 && receivesAgePension
      ? calculateSapto(taxableIncome, isCouple)
      : 0;

  const taxBeforeOffsets = result.baseTax + result.medicareLevy;
  
  result.lito = Math.min(maxLito, taxBeforeOffsets);
  const remainingAfterLito = taxBeforeOffsets - result.lito;
  result.sapto = Math.min(maxSapto, remainingAfterLito);

  result.frankingCreditOffset = frankingCredits;

  if (hasHecs && hecsBalance > 0) {
    const repaymentIncome = taxableIncome + reportableSuperContributions;
    result.hecsRepayment = calculateHecsRepayment(repaymentIncome, hecsBalance);
  }

  result.totalTax =
    result.baseTax +
    result.medicareLevy -
    result.lito -
    result.sapto -
    result.frankingCreditOffset +
    result.hecsRepayment;

  if (taxableIncome > 0) {
    result.effectiveRate = result.totalTax / taxableIncome;
  } else {
    result.effectiveRate = 0;
  }

  return result;
}
