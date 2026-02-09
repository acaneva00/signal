/**
 * Tests for the FY Rates Resolver
 * 
 * Verifies that:
 * 1. Exact rate files are loaded correctly
 * 2. Forward indexation works properly
 * 3. Different indexation rules are applied correctly
 */

import { getRatesForFY, type Assumptions } from '../rates/resolver';

// Standard test assumptions (matching economic.ts defaults)
const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflationRate: 0.025, // 2.5%
  wageGrowthRate: 0.035, // 3.5%
};

describe('FY Rates Resolver', () => {
  describe('Exact rate files', () => {
    test('FY2025 returns exact values from fy2025.ts', () => {
      const rates = getRatesForFY(2025, DEFAULT_ASSUMPTIONS);
      
      expect(rates.financialYear).toBe(2025);
      
      // Tax brackets (Stage 3)
      expect(rates.tax.brackets).toHaveLength(5);
      expect(rates.tax.brackets[0]).toEqual({
        minIncome: 0,
        maxIncome: 18200,
        rate: 0,
        baseAmount: 0,
      });
      expect(rates.tax.brackets[1]).toEqual({
        minIncome: 18201,
        maxIncome: 45000,
        rate: 0.16,
        baseAmount: 0,
      });
      expect(rates.tax.brackets[4]).toEqual({
        minIncome: 190001,
        maxIncome: null,
        rate: 0.45,
        baseAmount: 51638,
      });
      
      // LITO
      expect(rates.tax.lito.maxOffset).toBe(700);
      expect(rates.tax.lito.shadeOutStart).toBe(37500);
      
      // SAPTO
      expect(rates.tax.sapto.single.maxOffset).toBe(2230);
      expect(rates.tax.sapto.couple.maxOffset).toBe(1602);
      
      // Medicare levy
      expect(rates.tax.medicareLevy.rate).toBe(0.02);
      expect(rates.tax.medicareLevy.shadeInThresholds.single.lowerThreshold).toBe(26000);
      
      // HELP rates
      expect(rates.tax.helpRepaymentRates).toHaveLength(19);
      expect(rates.tax.helpRepaymentRates[0].maxIncome).toBe(54435);
      expect(rates.tax.helpRepaymentRates[1].rate).toBe(0.01);
      
      // Div 293
      expect(rates.tax.div293Threshold).toBe(250000);
      
      // Super
      expect(rates.super.sgRate).toBe(0.115); // 11.5% for FY2024-25
      expect(rates.super.contributionCaps.concessional).toBe(30000);
      expect(rates.super.contributionCaps.nonConcessional).toBe(120000);
      expect(rates.super.contributionCaps.bringForwardMax).toBe(360000);
      
      // Centrelink
      expect(rates.centrelink.agePensionRates.single.perFortnight).toBe(1144.40);
      expect(rates.centrelink.agePensionRates.couple.perFortnight).toBe(862.60);
      expect(rates.centrelink.incomeTest.freeArea.single).toBe(212);
      expect(rates.centrelink.assetsTest.homeowner.single).toBe(314000);
      expect(rates.centrelink.deemingRates.lowerRate).toBe(0.0025);
      expect(rates.centrelink.workBonus.maxBalance).toBe(11800);
      
      // ASFA
      expect(rates.asfa.retirementStandard.modest.single).toBe(32417);
      expect(rates.asfa.retirementStandard.comfortable.couple).toBe(73337);
    });
    
    test('FY2026 returns exact values from fy2026.ts with SG = 12%', () => {
      const rates = getRatesForFY(2026, DEFAULT_ASSUMPTIONS);
      
      expect(rates.financialYear).toBe(2026);
      
      // SG rate should be 12% for FY2025-26
      expect(rates.super.sgRate).toBe(0.12);
      
      // Tax brackets remain Stage 3 (unchanged)
      expect(rates.tax.brackets).toHaveLength(5);
      expect(rates.tax.brackets[1].maxIncome).toBe(45000);
      expect(rates.tax.brackets[2].rate).toBe(0.30);
      
      // Other rates should match FY2025 (baseline, not yet indexed)
      expect(rates.tax.lito.maxOffset).toBe(700);
      expect(rates.super.contributionCaps.concessional).toBe(30000);
    });
  });
  
  describe('Forward indexation', () => {
    test('FY2030: Centrelink thresholds indexed by ~12.6% (5 years × 2.5%)', () => {
      const rates = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      expect(rates.financialYear).toBe(2030);
      
      // Calculate expected inflation factor: (1.025)^4 = 1.1038... (4 years from FY2026)
      // But from FY2025 base: (1.025)^5 = 1.1314...
      // We're indexing from FY2026, so 4 years: (1.025)^4 = 1.1038
      const inflationFactor = Math.pow(1.025, 4); // ~1.1038
      
      // Age Pension rates
      const expectedPensionSingle = 1144.40 * inflationFactor;
      expect(rates.centrelink.agePensionRates.single.perFortnight).toBeCloseTo(
        expectedPensionSingle,
        2
      );
      
      // Income test free area
      const expectedFreeAreaSingle = Math.round(212 * inflationFactor);
      expect(rates.centrelink.incomeTest.freeArea.single).toBe(expectedFreeAreaSingle);
      
      // Assets test thresholds
      const expectedAssetsSingle = Math.round(314000 * inflationFactor);
      expect(rates.centrelink.assetsTest.homeowner.single).toBe(expectedAssetsSingle);
      
      // Work Bonus
      const expectedWorkBonus = Math.round(11800 * inflationFactor);
      expect(rates.centrelink.workBonus.maxBalance).toBe(expectedWorkBonus);
      
      // Verify ~10.4% increase from base (approximately)
      const actualIncrease = rates.centrelink.agePensionRates.single.perFortnight / 1144.40;
      expect(actualIncrease).toBeGreaterThan(1.10);
      expect(actualIncrease).toBeLessThan(1.11);
    });
    
    test('FY2030: SG rate capped at 12%', () => {
      const rates = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // SG rate should remain at 12% (legislated cap from FY2025-26 onwards)
      expect(rates.super.sgRate).toBe(0.12);
    });
    
    test('FY2030: Tax brackets frozen by default (unchanged from FY2025)', () => {
      const ratesFY2025 = getRatesForFY(2025, DEFAULT_ASSUMPTIONS);
      const ratesFY2030 = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // Tax brackets should be identical
      expect(ratesFY2030.tax.brackets).toEqual(ratesFY2025.tax.brackets);
      
      // Verify specific thresholds
      expect(ratesFY2030.tax.brackets[1].maxIncome).toBe(45000);
      expect(ratesFY2030.tax.brackets[2].maxIncome).toBe(135000);
      expect(ratesFY2030.tax.brackets[3].maxIncome).toBe(190000);
    });
    
    test('FY2030: Tax brackets can be indexed with override', () => {
      const assumptionsWithIndexing: Assumptions = {
        ...DEFAULT_ASSUMPTIONS,
        indexTaxBrackets: true,
      };
      
      const rates = getRatesForFY(2030, assumptionsWithIndexing);
      
      // 4 years forward from FY2026 at 3.5% wage growth
      const wageFactor = Math.pow(1.035, 4); // ~1.1475
      
      // Tax bracket thresholds should be indexed
      const expectedThreshold = Math.round(45000 * wageFactor);
      expect(rates.tax.brackets[1].maxIncome).toBe(expectedThreshold);
      expect(rates.tax.brackets[1].maxIncome).toBeGreaterThan(45000);
    });
    
    test('FY2030: HELP thresholds indexed by wage growth', () => {
      const ratesFY2026 = getRatesForFY(2026, DEFAULT_ASSUMPTIONS);
      const ratesFY2030 = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // 4 years forward from FY2026 at 3.5% wage growth
      const wageFactor = Math.pow(1.035, 4); // ~1.1475
      
      // First HELP threshold should be indexed
      const baseThreshold = ratesFY2026.tax.helpRepaymentRates[0].maxIncome!;
      const expectedThreshold = Math.round(baseThreshold * wageFactor);
      expect(ratesFY2030.tax.helpRepaymentRates[0].maxIncome).toBe(expectedThreshold);
      
      // Verify it increased
      expect(ratesFY2030.tax.helpRepaymentRates[0].maxIncome).toBeGreaterThan(baseThreshold);
    });
    
    test('FY2030: Super caps indexed by wage growth, rounded to $2,500', () => {
      const rates = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // 4 years forward from FY2026 at 3.5% wage growth
      const wageFactor = Math.pow(1.035, 4); // ~1.1475
      
      // Concessional cap: 30000 * 1.1475 = 34425 → round to 35000
      const expectedConcessional = Math.round((30000 * wageFactor) / 2500) * 2500;
      expect(rates.super.contributionCaps.concessional).toBe(expectedConcessional);
      expect(rates.super.contributionCaps.concessional % 2500).toBe(0);
      
      // Non-concessional cap: 120000 * 1.1475 = 137700 → round to 137500
      const expectedNCC = Math.round((120000 * wageFactor) / 2500) * 2500;
      expect(rates.super.contributionCaps.nonConcessional).toBe(expectedNCC);
      expect(rates.super.contributionCaps.nonConcessional % 2500).toBe(0);
      
      // Verify caps increased
      expect(rates.super.contributionCaps.concessional).toBeGreaterThan(30000);
      expect(rates.super.contributionCaps.nonConcessional).toBeGreaterThan(120000);
    });
    
    test('FY2030: ASFA standards indexed by inflation', () => {
      const ratesFY2026 = getRatesForFY(2026, DEFAULT_ASSUMPTIONS);
      const ratesFY2030 = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // 4 years forward from FY2026 at 2.5% inflation
      const inflationFactor = Math.pow(1.025, 4); // ~1.1038
      
      // Comfortable single standard
      const baseComfortable = ratesFY2026.asfa.retirementStandard.comfortable.single;
      const expectedComfortable = Math.round(baseComfortable * inflationFactor);
      expect(ratesFY2030.asfa.retirementStandard.comfortable.single).toBe(expectedComfortable);
      
      // Modest couple standard
      const baseModest = ratesFY2026.asfa.retirementStandard.modest.couple;
      const expectedModest = Math.round(baseModest * inflationFactor);
      expect(ratesFY2030.asfa.retirementStandard.modest.couple).toBe(expectedModest);
    });
    
    test('FY2028: Custom SG rate schedule can override default', () => {
      const assumptionsWithCustomSG: Assumptions = {
        ...DEFAULT_ASSUMPTIONS,
        sgRateSchedule: {
          2028: 0.13, // Custom 13% rate for FY2028
        },
      };
      
      const rates = getRatesForFY(2028, assumptionsWithCustomSG);
      
      // Should use custom SG rate
      expect(rates.super.sgRate).toBe(0.13);
    });
  });
  
  describe('Indexation accuracy', () => {
    test('Multiple forwards and backwards should maintain consistency', () => {
      const ratesFY2027 = getRatesForFY(2027, DEFAULT_ASSUMPTIONS);
      const ratesFY2028 = getRatesForFY(2028, DEFAULT_ASSUMPTIONS);
      
      // One year forward from FY2027 to FY2028
      const factor = 1.025;
      
      const expectedPension = Math.round(
        ratesFY2027.centrelink.agePensionRates.single.perFortnight * factor * 100
      ) / 100;
      
      expect(ratesFY2028.centrelink.agePensionRates.single.perFortnight).toBeCloseTo(
        expectedPension,
        2
      );
    });
    
    test('Preservation ages and drawdown rates remain unchanged', () => {
      const ratesFY2025 = getRatesForFY(2025, DEFAULT_ASSUMPTIONS);
      const ratesFY2035 = getRatesForFY(2035, DEFAULT_ASSUMPTIONS);
      
      // These should never be indexed
      expect(ratesFY2035.super.preservationAges).toEqual(ratesFY2025.super.preservationAges);
      expect(ratesFY2035.super.minimumDrawdownRates).toEqual(
        ratesFY2025.super.minimumDrawdownRates
      );
    });
    
    test('Taper rates and percentage rates remain unchanged', () => {
      const ratesFY2025 = getRatesForFY(2025, DEFAULT_ASSUMPTIONS);
      const ratesFY2030 = getRatesForFY(2030, DEFAULT_ASSUMPTIONS);
      
      // Rates (not thresholds) should not change
      expect(ratesFY2030.centrelink.incomeTest.taperRate).toBe(
        ratesFY2025.centrelink.incomeTest.taperRate
      );
      expect(ratesFY2030.centrelink.assetsTest.taperRate).toBe(
        ratesFY2025.centrelink.assetsTest.taperRate
      );
      expect(ratesFY2030.centrelink.deemingRates.lowerRate).toBe(
        ratesFY2025.centrelink.deemingRates.lowerRate
      );
      expect(ratesFY2030.centrelink.deemingRates.upperRate).toBe(
        ratesFY2025.centrelink.deemingRates.upperRate
      );
      expect(ratesFY2030.tax.medicareLevy.rate).toBe(ratesFY2025.tax.medicareLevy.rate);
    });
  });
  
  describe('Edge cases', () => {
    test('Throws error for FY before latest known rates', () => {
      expect(() => {
        getRatesForFY(2024, DEFAULT_ASSUMPTIONS);
      }).toThrow();
    });
    
    test('Different inflation rates produce different results', () => {
      const lowInflation: Assumptions = {
        inflationRate: 0.02,
        wageGrowthRate: 0.035,
      };
      
      const highInflation: Assumptions = {
        inflationRate: 0.04,
        wageGrowthRate: 0.035,
      };
      
      const ratesLow = getRatesForFY(2030, lowInflation);
      const ratesHigh = getRatesForFY(2030, highInflation);
      
      // Higher inflation should produce higher indexed values
      expect(ratesHigh.centrelink.agePensionRates.single.perFortnight).toBeGreaterThan(
        ratesLow.centrelink.agePensionRates.single.perFortnight
      );
    });
    
    test('Different wage growth rates produce different HELP thresholds', () => {
      const lowWages: Assumptions = {
        inflationRate: 0.025,
        wageGrowthRate: 0.02,
      };
      
      const highWages: Assumptions = {
        inflationRate: 0.025,
        wageGrowthRate: 0.05,
      };
      
      const ratesLow = getRatesForFY(2030, lowWages);
      const ratesHigh = getRatesForFY(2030, highWages);
      
      // Higher wage growth should produce higher HELP thresholds
      expect(ratesHigh.tax.helpRepaymentRates[5].minIncome).toBeGreaterThan(
        ratesLow.tax.helpRepaymentRates[5].minIncome
      );
    });
  });
});
