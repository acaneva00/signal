/**
 * Financial Year Rates Resolver
 * 
 * Returns the correct rates for any financial year in a projection.
 * If a specific rate file exists, uses it. Otherwise, indexes forward
 * from the latest known rates using economic assumptions.
 * 
 * Indexation rules:
 * - Centrelink thresholds: inflation per year
 * - Tax bracket thresholds: frozen by default (unless overridden)
 * - HELP thresholds: wage growth per year
 * - Super caps: wage growth per year (rounded to nearest $2,500)
 * - SG rate: from schedule in assumptions, or 12% once reached
 * - Pension rates: inflation per year
 * - ASFA standards: inflation per year
 */

import type {
  TaxBracket,
  LITOConfig,
  SAPTOConfig,
  MedicareLevyConfig,
  HELPRepaymentRate,
} from './fy2025';
import type {
  ContributionCaps,
  PreservationAge,
  MinimumDrawdownRate,
} from './super-fy2025';
import type {
  PensionRates,
  IncomeTest,
  AssetsTest,
  DeemedIncomeRates,
  WorkBonus,
} from './centrelink-fy2025';
import type {
  RetirementStandardBudget,
  RetirementStandardLumpSums,
} from './asfa';

import * as fy2025Module from './fy2025';
import * as fy2026Module from './fy2026';
import * as superFY2025Module from './super-fy2025';
import * as centrelinkFY2025Module from './centrelink-fy2025';
import * as asfaModule from './asfa';
import * as economicModule from './economic';

// Unified rates type combining all rate categories
export interface FYRates {
  financialYear: number;
  
  // Tax rates
  tax: {
    brackets: TaxBracket[];
    lito: LITOConfig;
    sapto: SAPTOConfig;
    medicareLevy: MedicareLevyConfig;
    helpRepaymentRates: HELPRepaymentRate[];
    div293Threshold: number;
  };
  
  // Superannuation rates
  super: {
    sgRate: number;
    contributionCaps: ContributionCaps;
    preservationAges: PreservationAge[];
    minimumDrawdownRates: MinimumDrawdownRate[];
  };
  
  // Centrelink rates
  centrelink: {
    agePensionRates: PensionRates;
    incomeTest: IncomeTest;
    assetsTest: AssetsTest;
    deemingRates: DeemedIncomeRates;
    workBonus: WorkBonus;
  };
  
  // ASFA Retirement Standard
  asfa: {
    retirementStandard: RetirementStandardBudget;
    lumpSumAtRetirement: RetirementStandardLumpSums;
  };
  
  // Economic assumptions used (for reference)
  assumptions: {
    inflationRate: number;
    wageGrowthRate: number;
  };
}

// Projection assumptions
export interface Assumptions {
  inflationRate: number; // as decimal (e.g., 0.025 for 2.5%)
  wageGrowthRate: number; // as decimal (e.g., 0.035 for 3.5%)
  
  // Optional: SG rate schedule (if different from legislated)
  sgRateSchedule?: {
    [fy: number]: number; // e.g., { 2025: 0.115, 2026: 0.12 }
  };
  
  // Optional: Override tax bracket indexation (default: false/frozen)
  indexTaxBrackets?: boolean;
}

/**
 * Get rates for a specific financial year
 * 
 * @param fy Financial year (e.g., 2025 for FY2024-25)
 * @param assumptions Economic assumptions for indexation
 * @returns Complete rate set for the financial year
 */
export function getRatesForFY(fy: number, assumptions: Assumptions): FYRates {
  // Try to load exact rate file for this FY
  const exactRates = loadExactRates(fy);
  if (exactRates) {
    return enrichWithAssumptions(exactRates, assumptions);
  }
  
  // No exact file - index forward from latest known rates
  return indexRatesForward(fy, assumptions);
}

/**
 * Load exact rates if a file exists for the FY
 */
function loadExactRates(fy: number): FYRates | null {
  if (fy === 2025) {
    return loadFY2025();
  } else if (fy === 2026) {
    return loadFY2026();
  }
  return null;
}

/**
 * Load FY2024-25 rates
 */
function loadFY2025(): FYRates {
  return {
    financialYear: 2025,
    tax: {
      brackets: JSON.parse(JSON.stringify(fy2025Module.TAX_BRACKETS)),
      lito: JSON.parse(JSON.stringify(fy2025Module.LITO)),
      sapto: JSON.parse(JSON.stringify(fy2025Module.SAPTO)),
      medicareLevy: JSON.parse(JSON.stringify(fy2025Module.MEDICARE_LEVY)),
      helpRepaymentRates: JSON.parse(JSON.stringify(fy2025Module.HELP_REPAYMENT_RATES)),
      div293Threshold: fy2025Module.DIV_293_THRESHOLD,
    },
    super: {
      sgRate: 0.115, // 11.5% for FY2024-25
      contributionCaps: JSON.parse(JSON.stringify(superFY2025Module.CONTRIBUTION_CAPS)),
      preservationAges: JSON.parse(JSON.stringify(superFY2025Module.PRESERVATION_AGES)),
      minimumDrawdownRates: JSON.parse(JSON.stringify(superFY2025Module.MINIMUM_DRAWDOWN_RATES)),
    },
    centrelink: {
      agePensionRates: JSON.parse(JSON.stringify(centrelinkFY2025Module.AGE_PENSION_RATES)),
      incomeTest: JSON.parse(JSON.stringify(centrelinkFY2025Module.INCOME_TEST)),
      assetsTest: JSON.parse(JSON.stringify(centrelinkFY2025Module.ASSETS_TEST)),
      deemingRates: JSON.parse(JSON.stringify(centrelinkFY2025Module.DEEMING_RATES)),
      workBonus: JSON.parse(JSON.stringify(centrelinkFY2025Module.WORK_BONUS)),
    },
    asfa: {
      retirementStandard: JSON.parse(JSON.stringify(asfaModule.RETIREMENT_STANDARD)),
      lumpSumAtRetirement: JSON.parse(JSON.stringify(asfaModule.LUMP_SUM_AT_RETIREMENT)),
    },
    assumptions: {
      inflationRate: economicModule.ECONOMIC_ASSUMPTIONS.inflation,
      wageGrowthRate: economicModule.ECONOMIC_ASSUMPTIONS.wageGrowth,
    },
  };
}

/**
 * Load FY2025-26 rates
 */
function loadFY2026(): FYRates {
  return {
    financialYear: 2026,
    tax: {
      brackets: JSON.parse(JSON.stringify(fy2026Module.TAX_BRACKETS)),
      lito: JSON.parse(JSON.stringify(fy2026Module.LITO)),
      sapto: JSON.parse(JSON.stringify(fy2026Module.SAPTO)),
      medicareLevy: JSON.parse(JSON.stringify(fy2026Module.MEDICARE_LEVY)),
      helpRepaymentRates: JSON.parse(JSON.stringify(fy2026Module.HELP_REPAYMENT_RATES)),
      div293Threshold: fy2026Module.DIV_293_THRESHOLD,
    },
    super: {
      sgRate: 0.12, // 12% for FY2025-26+
      contributionCaps: JSON.parse(JSON.stringify(superFY2025Module.CONTRIBUTION_CAPS)),
      preservationAges: JSON.parse(JSON.stringify(superFY2025Module.PRESERVATION_AGES)),
      minimumDrawdownRates: JSON.parse(JSON.stringify(superFY2025Module.MINIMUM_DRAWDOWN_RATES)),
    },
    centrelink: {
      agePensionRates: JSON.parse(JSON.stringify(centrelinkFY2025Module.AGE_PENSION_RATES)),
      incomeTest: JSON.parse(JSON.stringify(centrelinkFY2025Module.INCOME_TEST)),
      assetsTest: JSON.parse(JSON.stringify(centrelinkFY2025Module.ASSETS_TEST)),
      deemingRates: JSON.parse(JSON.stringify(centrelinkFY2025Module.DEEMING_RATES)),
      workBonus: JSON.parse(JSON.stringify(centrelinkFY2025Module.WORK_BONUS)),
    },
    asfa: {
      retirementStandard: JSON.parse(JSON.stringify(asfaModule.RETIREMENT_STANDARD)),
      lumpSumAtRetirement: JSON.parse(JSON.stringify(asfaModule.LUMP_SUM_AT_RETIREMENT)),
    },
    assumptions: {
      inflationRate: economicModule.ECONOMIC_ASSUMPTIONS.inflation,
      wageGrowthRate: economicModule.ECONOMIC_ASSUMPTIONS.wageGrowth,
    },
  };
}

/**
 * Index rates forward from the latest known rates
 */
function indexRatesForward(targetFY: number, assumptions: Assumptions): FYRates {
  // Find the latest known FY we have rates for
  const latestKnownFY = 2026; // Update as new rate files are added
  const baseRates = loadExactRates(latestKnownFY);
  
  if (!baseRates) {
    throw new Error(`No base rates available for FY${latestKnownFY}`);
  }
  
  const yearsForward = targetFY - latestKnownFY;
  
  if (yearsForward < 0) {
    throw new Error(`Cannot index backward from FY${latestKnownFY} to FY${targetFY}`);
  }
  
  if (yearsForward === 0) {
    // Same year, just return with updated assumptions
    return enrichWithAssumptions(baseRates, assumptions);
  }
  
  // Deep clone base rates to avoid mutation
  const indexed = JSON.parse(JSON.stringify(baseRates)) as FYRates;
  indexed.financialYear = targetFY;
  indexed.assumptions = {
    inflationRate: assumptions.inflationRate,
    wageGrowthRate: assumptions.wageGrowthRate,
  };
  
  // Calculate compounded growth factors
  const inflationFactor = Math.pow(1 + assumptions.inflationRate, yearsForward);
  const wageFactor = Math.pow(1 + assumptions.wageGrowthRate, yearsForward);
  
  // Index tax rates
  if (assumptions.indexTaxBrackets) {
    indexed.tax.brackets = indexTaxBrackets(indexed.tax.brackets, wageFactor);
  }
  indexed.tax.helpRepaymentRates = indexHELPRates(indexed.tax.helpRepaymentRates, wageFactor);
  indexed.tax.sapto = indexSAPTO(indexed.tax.sapto, inflationFactor);
  indexed.tax.medicareLevy = indexMedicareLevy(indexed.tax.medicareLevy, inflationFactor);
  
  // Index super rates
  indexed.super.sgRate = getSGRateForFY(targetFY, assumptions);
  indexed.super.contributionCaps = indexSuperCaps(indexed.super.contributionCaps, wageFactor);
  
  // Index Centrelink rates
  indexed.centrelink.agePensionRates = indexPensionRates(
    indexed.centrelink.agePensionRates,
    inflationFactor
  );
  indexed.centrelink.incomeTest = indexIncomeTest(indexed.centrelink.incomeTest, inflationFactor);
  indexed.centrelink.assetsTest = indexAssetsTest(indexed.centrelink.assetsTest, inflationFactor);
  indexed.centrelink.deemingRates = indexDeemingRates(
    indexed.centrelink.deemingRates,
    inflationFactor
  );
  indexed.centrelink.workBonus = indexWorkBonus(indexed.centrelink.workBonus, inflationFactor);
  
  // Index ASFA standards
  indexed.asfa.retirementStandard = indexRetirementStandard(
    indexed.asfa.retirementStandard,
    inflationFactor
  );
  indexed.asfa.lumpSumAtRetirement = indexLumpSums(
    indexed.asfa.lumpSumAtRetirement,
    inflationFactor
  );
  
  return indexed;
}

// Indexation helper functions

function indexTaxBrackets(brackets: TaxBracket[], factor: number): TaxBracket[] {
  return brackets.map((bracket, i) => {
    const newMin = Math.round(bracket.minIncome * factor);
    const newMax = bracket.maxIncome === null ? null : Math.round(bracket.maxIncome * factor);
    
    // Recalculate base amount (tax on all income up to this bracket)
    let newBase = 0;
    for (let j = 0; j < i; j++) {
      const prevBracket = brackets[j];
      const prevMax = prevBracket.maxIncome ?? newMin;
      const prevMin = prevBracket.minIncome;
      newBase += (prevMax - prevMin) * prevBracket.rate;
    }
    
    return {
      minIncome: newMin,
      maxIncome: newMax,
      rate: bracket.rate,
      baseAmount: Math.round(newBase),
    };
  });
}

function indexHELPRates(rates: HELPRepaymentRate[], factor: number): HELPRepaymentRate[] {
  return rates.map((rate) => ({
    minIncome: Math.round(rate.minIncome * factor),
    maxIncome: rate.maxIncome === null ? null : Math.round(rate.maxIncome * factor),
    rate: rate.rate,
  }));
}

function indexSAPTO(sapto: SAPTOConfig, factor: number): SAPTOConfig {
  return {
    single: {
      maxOffset: Math.round(sapto.single.maxOffset * factor),
      shadeOutStart: Math.round(sapto.single.shadeOutStart * factor),
      shadeOutRate: sapto.single.shadeOutRate,
    },
    couple: {
      maxOffset: Math.round(sapto.couple.maxOffset * factor),
      shadeOutStart: Math.round(sapto.couple.shadeOutStart * factor),
      shadeOutRate: sapto.couple.shadeOutRate,
    },
  };
}

function indexMedicareLevy(levy: MedicareLevyConfig, factor: number): MedicareLevyConfig {
  return {
    rate: levy.rate,
    shadeInThresholds: {
      single: {
        lowerThreshold: Math.round(levy.shadeInThresholds.single.lowerThreshold * factor),
        upperThreshold: Math.round(levy.shadeInThresholds.single.upperThreshold * factor),
      },
      family: {
        lowerThreshold: Math.round(levy.shadeInThresholds.family.lowerThreshold * factor),
        upperThreshold: Math.round(levy.shadeInThresholds.family.upperThreshold * factor),
        perChildAdditional: Math.round(levy.shadeInThresholds.family.perChildAdditional * factor),
      },
      seniorsAndPensioners: {
        single: {
          lowerThreshold: Math.round(
            levy.shadeInThresholds.seniorsAndPensioners.single.lowerThreshold * factor
          ),
          upperThreshold: Math.round(
            levy.shadeInThresholds.seniorsAndPensioners.single.upperThreshold * factor
          ),
        },
        family: {
          lowerThreshold: Math.round(
            levy.shadeInThresholds.seniorsAndPensioners.family.lowerThreshold * factor
          ),
          upperThreshold: Math.round(
            levy.shadeInThresholds.seniorsAndPensioners.family.upperThreshold * factor
          ),
          perChildAdditional: Math.round(
            levy.shadeInThresholds.seniorsAndPensioners.family.perChildAdditional * factor
          ),
        },
      },
    },
  };
}

function getSGRateForFY(fy: number, assumptions: Assumptions): number {
  // Check custom schedule first
  if (assumptions.sgRateSchedule && assumptions.sgRateSchedule[fy]) {
    return assumptions.sgRateSchedule[fy];
  }
  
  // Use legislated schedule
  if (fy <= 2024) return 0.11; // 11%
  if (fy === 2025) return 0.115; // 11.5%
  return 0.12; // 12% from FY2025-26 onwards
}

function indexSuperCaps(caps: ContributionCaps, factor: number): ContributionCaps {
  // Round to nearest $2,500 as per legislation
  const roundTo2500 = (value: number) => Math.round(value / 2500) * 2500;
  
  return {
    concessional: roundTo2500(caps.concessional * factor),
    nonConcessional: roundTo2500(caps.nonConcessional * factor),
    bringForwardMax: roundTo2500(caps.bringForwardMax * factor),
    bringForwardTSBThreshold: roundTo2500(caps.bringForwardTSBThreshold * factor),
  };
}

function indexPensionRates(rates: PensionRates, factor: number): PensionRates {
  return {
    single: {
      perFortnight: roundToTwoDecimals(rates.single.perFortnight * factor),
      perYear: roundToTwoDecimals(rates.single.perYear * factor),
    },
    couple: {
      perFortnight: roundToTwoDecimals(rates.couple.perFortnight * factor),
      perYear: roundToTwoDecimals(rates.couple.perYear * factor),
    },
  };
}

function indexIncomeTest(test: IncomeTest, factor: number): IncomeTest {
  return {
    freeArea: {
      single: Math.round(test.freeArea.single * factor),
      couple: Math.round(test.freeArea.couple * factor),
    },
    taperRate: test.taperRate,
  };
}

function indexAssetsTest(test: AssetsTest, factor: number): AssetsTest {
  return {
    homeowner: {
      single: Math.round(test.homeowner.single * factor),
      couple: Math.round(test.homeowner.couple * factor),
    },
    nonHomeowner: {
      single: Math.round(test.nonHomeowner.single * factor),
      couple: Math.round(test.nonHomeowner.couple * factor),
    },
    taperRate: test.taperRate,
  };
}

function indexDeemingRates(rates: DeemedIncomeRates, factor: number): DeemedIncomeRates {
  return {
    lowerRate: rates.lowerRate,
    upperRate: rates.upperRate,
    threshold: {
      single: Math.round(rates.threshold.single * factor),
      couple: Math.round(rates.threshold.couple * factor),
    },
  };
}

function indexWorkBonus(bonus: WorkBonus, factor: number): WorkBonus {
  return {
    perFortnight: Math.round(bonus.perFortnight * factor),
    annualAccrual: Math.round(bonus.annualAccrual * factor),
    maxBalance: Math.round(bonus.maxBalance * factor),
  };
}

function indexRetirementStandard(
  standard: RetirementStandardBudget,
  factor: number
): RetirementStandardBudget {
  return {
    modest: {
      single: Math.round(standard.modest.single * factor),
      couple: Math.round(standard.modest.couple * factor),
    },
    comfortable: {
      single: Math.round(standard.comfortable.single * factor),
      couple: Math.round(standard.comfortable.couple * factor),
    },
  };
}

function indexLumpSums(
  lumpSums: RetirementStandardLumpSums,
  factor: number
): RetirementStandardLumpSums {
  return {
    comfortable: {
      single: Math.round(lumpSums.comfortable.single * factor),
      couple: Math.round(lumpSums.comfortable.couple * factor),
    },
  };
}

function enrichWithAssumptions(rates: FYRates, assumptions: Assumptions): FYRates {
  return {
    ...rates,
    assumptions: {
      inflationRate: assumptions.inflationRate,
      wageGrowthRate: assumptions.wageGrowthRate,
    },
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
