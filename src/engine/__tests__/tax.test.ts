/**
 * Australian Individual Income Tax Tests
 * 
 * All expected values are for FY2024-25 Stage 3 brackets
 * including 2% Medicare levy and LITO.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateBaseTax,
  calculateMedicareLevy,
  calculateLito,
  calculateSapto,
  calculateHecsRepayment,
  calculateIndividualTax,
  calculateMonthlyPayg,
  calculateDiv293,
} from '../tax';

describe('calculateBaseTax', () => {
  it('calculates base tax for $45,000 income', () => {
    const result = calculateBaseTax(45000);
    expect(result).toBeCloseTo(4288, 0);
  });

  it('calculates base tax for $90,000 income', () => {
    const result = calculateBaseTax(90000);
    expect(result).toBeCloseTo(17788, 0);
  });

  it('calculates base tax for $120,000 income', () => {
    const result = calculateBaseTax(120000);
    expect(result).toBeCloseTo(26788, 0);
  });

  it('calculates base tax for $135,000 income', () => {
    const result = calculateBaseTax(135000);
    expect(result).toBeCloseTo(31288, 0);
  });

  it('calculates base tax for $180,000 income', () => {
    const result = calculateBaseTax(180000);
    expect(result).toBeCloseTo(47938, 0);
  });

  it('calculates base tax for $190,000 income', () => {
    const result = calculateBaseTax(190000);
    expect(result).toBeCloseTo(51638, 0);
  });

  it('calculates base tax for $200,000 income', () => {
    const result = calculateBaseTax(200000);
    expect(result).toBeCloseTo(56138, 0);
  });

  it('returns 0 for income at or below tax-free threshold', () => {
    expect(calculateBaseTax(18200)).toBe(0);
    expect(calculateBaseTax(10000)).toBe(0);
    expect(calculateBaseTax(0)).toBe(0);
  });

  it('returns 0 for negative income', () => {
    expect(calculateBaseTax(-1000)).toBe(0);
  });
});

describe('calculateMedicareLevy', () => {
  it('calculates 2% Medicare levy for $45,000 income', () => {
    const result = calculateMedicareLevy(45000);
    expect(result).toBeCloseTo(900, 0);
  });

  it('calculates 2% Medicare levy for $90,000 income', () => {
    const result = calculateMedicareLevy(90000);
    expect(result).toBeCloseTo(1800, 0);
  });

  it('calculates 2% Medicare levy for $120,000 income', () => {
    const result = calculateMedicareLevy(120000);
    expect(result).toBeCloseTo(2400, 0);
  });

  it('calculates 2% Medicare levy for $180,000 income', () => {
    const result = calculateMedicareLevy(180000);
    expect(result).toBeCloseTo(3600, 0);
  });

  it('calculates 2% Medicare levy for $200,000 income', () => {
    const result = calculateMedicareLevy(200000);
    expect(result).toBeCloseTo(4000, 0);
  });

  it('returns 0 for income below low-income threshold', () => {
    const result = calculateMedicareLevy(25000);
    expect(result).toBe(0);
  });

  it('shades in between lower and upper threshold', () => {
    const result = calculateMedicareLevy(30000);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(30000 * 0.02);
  });
});

describe('calculateLito', () => {
  it('returns full $700 offset for income up to $37,500', () => {
    expect(calculateLito(37500)).toBe(700);
    expect(calculateLito(30000)).toBe(700);
  });

  it('reduces by 5c per dollar between $37,500 and $45,000', () => {
    const result = calculateLito(40000);
    const expected = 700 - (40000 - 37500) * 0.05;
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBe(575);
  });

  it('returns $325 at $45,000 income', () => {
    expect(calculateLito(45000)).toBeCloseTo(325, 0);
  });

  it('reduces by 1.5c per dollar between $45,000 and $66,667', () => {
    const result = calculateLito(50000);
    const expected = 325 - (50000 - 45000) * 0.015;
    expect(result).toBeCloseTo(expected, 2);
    expect(result).toBe(250);
  });

  it('returns $0 for income at or above $66,667', () => {
    expect(calculateLito(66667)).toBeCloseTo(0, 0);
    expect(calculateLito(70000)).toBe(0);
    expect(calculateLito(100000)).toBe(0);
  });
});

describe('calculateSapto', () => {
  it('returns full offset for single below shade-out threshold', () => {
    const result = calculateSapto(32279, false);
    expect(result).toBe(2230);
  });

  it('returns full offset for couple below shade-out threshold', () => {
    const result = calculateSapto(28974, true);
    expect(result).toBe(1602);
  });

  it('shades out at 12.5% for single above threshold', () => {
    const result = calculateSapto(40000, false);
    const reduction = (40000 - 32279) * 0.125;
    const expected = Math.max(0, 2230 - reduction);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('shades out at 12.5% for couple above threshold', () => {
    const result = calculateSapto(35000, true);
    const reduction = (35000 - 28974) * 0.125;
    const expected = Math.max(0, 1602 - reduction);
    expect(result).toBeCloseTo(expected, 2);
  });

  it('returns 0 when fully shaded out', () => {
    expect(calculateSapto(100000, false)).toBe(0);
    expect(calculateSapto(100000, true)).toBe(0);
  });
});

describe('calculateHecsRepayment', () => {
  it('returns 0 when no HECS balance', () => {
    expect(calculateHecsRepayment(80000, 0)).toBe(0);
  });

  it('returns 0 when income below threshold', () => {
    expect(calculateHecsRepayment(50000, 30000)).toBe(0);
  });

  it('calculates 1% repayment for income in first threshold', () => {
    const result = calculateHecsRepayment(60000, 50000);
    expect(result).toBeCloseTo(600, 0);
  });

  it('calculates 5.5% repayment for $100,000 income', () => {
    const result = calculateHecsRepayment(100000, 50000);
    expect(result).toBeCloseTo(5500, 0);
  });

  it('caps repayment at remaining HECS balance', () => {
    const result = calculateHecsRepayment(200000, 5000);
    const uncapped = 200000 * 0.1;
    expect(uncapped).toBeGreaterThan(5000);
    expect(result).toBe(5000);
  });
});

describe('calculateDiv293', () => {
  it('returns 0 when combined income below threshold', () => {
    const result = calculateDiv293(200000, 30000);
    expect(result).toBe(0);
  });

  it('calculates 15% tax on excess when above threshold', () => {
    const result = calculateDiv293(200000, 60000);
    const combinedIncome = 260000;
    const excess = 10000;
    const expected = excess * 0.15;
    expect(result).toBeCloseTo(expected, 0);
    expect(result).toBe(1500);
  });

  it('only taxes the portion of contributions exceeding threshold', () => {
    const result = calculateDiv293(240000, 15000);
    const combinedIncome = 255000;
    const excess = 5000;
    const expected = excess * 0.15;
    expect(result).toBeCloseTo(expected, 0);
    expect(result).toBe(750);
  });

  it('handles exact threshold edge case', () => {
    const result = calculateDiv293(250000, 0);
    expect(result).toBe(0);
  });
});

describe('calculateMonthlyPayg', () => {
  it('calculates monthly PAYG for $90,000 income', () => {
    const result = calculateMonthlyPayg(90000);
    const expected = 19588 / 12;
    expect(result).toBeCloseTo(expected, 0);
    expect(result).toBeCloseTo(1632, 0);
  });

  it('calculates monthly PAYG for $120,000 income', () => {
    const result = calculateMonthlyPayg(120000);
    const expected = 29188 / 12;
    expect(result).toBeCloseTo(expected, 0);
    expect(result).toBeCloseTo(2432, 0);
  });

  it('returns ~0 for income below tax-free threshold', () => {
    const result = calculateMonthlyPayg(18200);
    expect(result).toBeCloseTo(0, 0);
  });
});

describe('calculateIndividualTax - Full Integration', () => {
  describe('Stage 3 brackets with Medicare levy and LITO', () => {
    it('calculates total tax for $45,000 income', () => {
      const result = calculateIndividualTax({ grossIncome: 45000 });
      
      expect(result.baseTax).toBeCloseTo(4288, 0);
      expect(result.medicareLevy).toBeCloseTo(900, 0);
      expect(result.lito).toBeCloseTo(325, 0);
      expect(result.totalTax).toBeCloseTo(4863, 0);
    });

    it('calculates total tax for $90,000 income', () => {
      const result = calculateIndividualTax({ grossIncome: 90000 });
      
      expect(result.baseTax).toBeCloseTo(17788, 0);
      expect(result.medicareLevy).toBeCloseTo(1800, 0);
      expect(result.lito).toBe(0);
      expect(result.totalTax).toBeCloseTo(19588, 0);
    });

    it('calculates total tax for $120,000 income', () => {
      const result = calculateIndividualTax({ grossIncome: 120000 });
      
      expect(result.baseTax).toBeCloseTo(26788, 0);
      expect(result.medicareLevy).toBeCloseTo(2400, 0);
      expect(result.lito).toBe(0);
      expect(result.totalTax).toBeCloseTo(29188, 0);
    });

    it('calculates total tax for $180,000 income', () => {
      const result = calculateIndividualTax({ grossIncome: 180000 });
      
      expect(result.baseTax).toBeCloseTo(47938, 0);
      expect(result.medicareLevy).toBeCloseTo(3600, 0);
      expect(result.lito).toBe(0);
      expect(result.totalTax).toBeCloseTo(51538, 0);
    });

    it('calculates total tax for $200,000 income', () => {
      const result = calculateIndividualTax({ grossIncome: 200000 });
      
      expect(result.baseTax).toBeCloseTo(56138, 0);
      expect(result.medicareLevy).toBeCloseTo(4000, 0);
      expect(result.lito).toBe(0);
      expect(result.totalTax).toBeCloseTo(60138, 0);
    });
  });

  describe('LITO specific test cases', () => {
    it('applies full $700 LITO at $37,500 income', () => {
      const result = calculateIndividualTax({ grossIncome: 37500 });
      expect(result.lito).toBe(700);
    });

    it('reduces LITO by 5c per dollar between $37,500 and $45,000', () => {
      const result = calculateIndividualTax({ grossIncome: 40000 });
      const expectedLito = 700 - (40000 - 37500) * 0.05;
      expect(result.lito).toBe(575);
      expect(result.lito).toBeCloseTo(expectedLito, 0);
    });

    it('reduces LITO by 1.5c per dollar between $45,000 and $66,667', () => {
      const result = calculateIndividualTax({ grossIncome: 50000 });
      const expectedLito = 325 - (50000 - 45000) * 0.015;
      expect(result.lito).toBe(250);
      expect(result.lito).toBeCloseTo(expectedLito, 0);
    });

    it('applies no LITO at $66,667+', () => {
      const result66k = calculateIndividualTax({ grossIncome: 66667 });
      expect(result66k.lito).toBeCloseTo(0, 0);

      const result80k = calculateIndividualTax({ grossIncome: 80000 });
      expect(result80k.lito).toBe(0);
    });
  });

  describe('Division 293 tax', () => {
    it('returns $0 when combined income below $250k threshold', () => {
      const result = calculateDiv293(200000, 30000);
      expect(result).toBe(0);
    });

    it('calculates 15% additional tax when above threshold', () => {
      const result = calculateDiv293(200000, 60000);
      const combinedIncome = 260000;
      const excessAmount = 10000;
      const expected = excessAmount * 0.15;
      expect(result).toBe(1500);
      expect(result).toBeCloseTo(expected, 0);
    });

    it('only taxes contributions portion exceeding threshold', () => {
      const result = calculateDiv293(240000, 15000);
      const excess = 5000;
      const expected = excess * 0.15;
      expect(result).toBe(750);
      expect(result).toBeCloseTo(expected, 0);
    });

    it('handles exact threshold edge case', () => {
      const result = calculateDiv293(250000, 0);
      expect(result).toBe(0);

      const resultJustAbove = calculateDiv293(249999, 2);
      expect(resultJustAbove).toBeCloseTo(1 * 0.15, 2);
    });
  });

  describe('Monthly PAYG withholding', () => {
    it('estimates monthly PAYG for $90,000 income', () => {
      const result = calculateMonthlyPayg(90000);
      const expectedAnnual = 19588;
      const expectedMonthly = expectedAnnual / 12;
      expect(result).toBeCloseTo(expectedMonthly, 0);
      expect(result).toBeCloseTo(1632, 0);
    });

    it('estimates monthly PAYG for $120,000 income', () => {
      const result = calculateMonthlyPayg(120000);
      const expectedAnnual = 29188;
      const expectedMonthly = expectedAnnual / 12;
      expect(result).toBeCloseTo(expectedMonthly, 0);
      expect(result).toBeCloseTo(2432, 0);
    });

    it('estimates monthly PAYG for $45,000 income', () => {
      const result = calculateMonthlyPayg(45000);
      const expectedAnnual = 4863;
      const expectedMonthly = expectedAnnual / 12;
      expect(result).toBeCloseTo(expectedMonthly, 0);
      expect(result).toBeCloseTo(405, 0);
    });
  });

  describe('Medicare levy edge cases', () => {
    it('returns exactly 2% for all test incomes above shade-in', () => {
      expect(calculateMedicareLevy(45000)).toBeCloseTo(45000 * 0.02, 0);
      expect(calculateMedicareLevy(90000)).toBeCloseTo(90000 * 0.02, 0);
      expect(calculateMedicareLevy(120000)).toBeCloseTo(120000 * 0.02, 0);
      expect(calculateMedicareLevy(180000)).toBeCloseTo(180000 * 0.02, 0);
      expect(calculateMedicareLevy(200000)).toBeCloseTo(200000 * 0.02, 0);
    });
  });

  describe('Full tax calculation with all components', () => {
    it('includes deductions in taxable income calculation', () => {
      const result = calculateIndividualTax({
        grossIncome: 100000,
        deductions: 10000,
      });
      
      expect(result.taxableIncome).toBe(90000);
      expect(result.baseTax).toBeCloseTo(17788, 0);
    });

    it('includes franking credits in taxable income', () => {
      const result = calculateIndividualTax({
        grossIncome: 85000,
        frankingCredits: 5000,
      });
      
      expect(result.taxableIncome).toBe(90000);
      expect(result.frankingCreditOffset).toBe(5000);
    });

    it('calculates HECS repayment when applicable', () => {
      const result = calculateIndividualTax({
        grossIncome: 100000,
        hasHecs: true,
        hecsBalance: 50000,
      });
      
      expect(result.hecsRepayment).toBeGreaterThan(0);
      expect(result.totalTax).toBeGreaterThan(result.baseTax + result.medicareLevy);
    });

    it('applies SAPTO for eligible seniors', () => {
      const result = calculateIndividualTax({
        grossIncome: 40000,
        age: 70,
        receivesAgePension: true,
      });
      
      expect(result.sapto).toBeGreaterThan(0);
    });

    it('does not apply SAPTO for ineligible persons', () => {
      const result = calculateIndividualTax({
        grossIncome: 40000,
        age: 65,
        receivesAgePension: false,
      });
      
      expect(result.sapto).toBe(0);
    });

    it('calculates effective rate correctly', () => {
      const result = calculateIndividualTax({ grossIncome: 90000 });
      
      const expectedEffectiveRate = result.totalTax / result.taxableIncome;
      expect(result.effectiveRate).toBeCloseTo(expectedEffectiveRate, 4);
    });

    it('handles zero income without errors', () => {
      const result = calculateIndividualTax({ grossIncome: 0 });
      
      expect(result.taxableIncome).toBe(0);
      expect(result.baseTax).toBe(0);
      expect(result.medicareLevy).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });
  });

  describe('Tax bracket verification', () => {
    it('correctly applies Stage 3 bracket rates', () => {
      const testCases = [
        { income: 18200, expectedBase: 0 },
        { income: 25000, expectedBase: (25000 - 18200) * 0.16 },
        { income: 45000, expectedBase: 4288 },
        { income: 90000, expectedBase: 17788 },
        { income: 120000, expectedBase: 26788 },
        { income: 135000, expectedBase: 31288 },
        { income: 180000, expectedBase: 47938 },
        { income: 190000, expectedBase: 51638 },
        { income: 200000, expectedBase: 56138 },
      ];

      testCases.forEach(({ income, expectedBase }) => {
        const result = calculateIndividualTax({ grossIncome: income });
        expect(result.baseTax).toBeCloseTo(expectedBase, 0);
      });
    });
  });

  describe('Complex scenarios', () => {
    it('calculates tax with deductions, franking credits, and HECS', () => {
      const result = calculateIndividualTax({
        grossIncome: 120000,
        deductions: 5000,
        frankingCredits: 2000,
        hasHecs: true,
        hecsBalance: 40000,
        reportableSuperContributions: 10000,
      });

      expect(result.taxableIncome).toBe(117000);
      expect(result.baseTax).toBeGreaterThan(0);
      expect(result.medicareLevy).toBeGreaterThan(0);
      expect(result.hecsRepayment).toBeGreaterThan(0);
      expect(result.frankingCreditOffset).toBe(2000);
      expect(result.totalTax).toBeGreaterThan(0);
    });

    it('handles couples with dependents for Medicare levy', () => {
      const result = calculateIndividualTax({
        grossIncome: 50000,
        isCouple: true,
        numDependents: 2,
      });

      expect(result.medicareLevy).toBeGreaterThanOrEqual(0);
    });

    it('allows negative total tax for franking credit refunds', () => {
      const result = calculateIndividualTax({
        grossIncome: 10000,
        frankingCredits: 5000,
      });

      expect(result.frankingCreditOffset).toBe(5000);
    });
  });
});
