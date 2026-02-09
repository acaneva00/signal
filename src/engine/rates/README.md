# Australian Tax and Financial Rates Configuration

This directory contains typed configuration files for Australian tax, superannuation, and social security rates used in financial calculations.

## Files Overview

| File | Contents | Update Frequency |
|------|----------|------------------|
| `fy2025.ts` | Tax brackets (Stage 3), HELP rates, LITO, SAPTO, Medicare levy, Div 293 threshold (FY2024-25) | Annually (July 1) |
| `fy2026.ts` | Tax brackets (Stage 3), HELP rates, LITO, SAPTO, Medicare levy, Div 293 threshold (FY2025-26) | Annually (July 1) |
| `super-fy2025.ts` | SG rate, concessional cap, NCC cap, bring-forward thresholds, preservation ages, minimum drawdown rates by age | Annually (July 1) |
| `centrelink-fy2025.ts` | Pension rates, income/assets thresholds, deeming rates, Work Bonus | Twice yearly (March 20 & September 20) |
| `economic.ts` | Investment return assumptions (by risk profile), inflation, wage growth | As needed (document changes) |
| `asfa.ts` | ASFA Retirement Standard amounts (modest + comfortable, single + couple) | Quarterly (ASFA publishes) |
| `resolver.ts` | **Rate resolver for projections** - returns correct rates for any FY, with automatic indexation | - |
| `index.ts` | Central export file for all rates | - |

## Usage

Import rates directly from the central index:

```typescript
import {
  TAX_BRACKETS,
  LITO,
  SAPTO,
  AGE_PENSION_RATES,
  CONTRIBUTION_CAPS,
  RETIREMENT_STANDARD,
} from '@/engine/rates';
```

Or import specific modules:

```typescript
import { TAX_BRACKETS, HELP_REPAYMENT_RATES } from '@/engine/rates/fy2025';
import { calculateAgePension } from '@/engine/rates/centrelink-fy2025';
```

For FY2025-26 rates:

```typescript
import { TAX_BRACKETS, LITO } from '@/engine/rates/fy2026';
```

### Rate Resolver (for Multi-Year Projections)

For projections that span multiple financial years, use the rate resolver:

```typescript
import { getRatesForFY, type Assumptions } from '@/engine/rates';

const assumptions: Assumptions = {
  inflationRate: 0.025,    // 2.5%
  wageGrowthRate: 0.035,   // 3.5%
};

// Get rates for any financial year
const ratesFY2025 = getRatesForFY(2025, assumptions); // Exact rates from fy2025.ts
const ratesFY2030 = getRatesForFY(2030, assumptions); // Indexed forward from FY2026

// Use in calculations
const taxOwed = calculateTax(income, ratesFY2030.tax.brackets);
const pension = calculatePension(assets, income, ratesFY2030.centrelink);
```

## Features

- **Fully typed**: All constants use TypeScript interfaces for type safety
- **Helper functions**: Calculation utilities for common operations (e.g., Age Pension, deeming income)
- **Source documentation**: Every file includes ATO/Services Australia URLs
- **Decimal precision**: All rates stored as decimals (e.g., 0.16 for 16%)

## Maintenance

When updating rates:

1. Check official sources linked in file headers
2. Update constants and preserve existing types
3. Update the financial year suffix in filenames if creating new year
4. Test calculations with known examples
5. Document significant changes in git commit messages

### FY2025-26 Notes

The `fy2026.ts` file contains rates for FY2025-26 based on:
- Legislated changes (SG rate to 12%)
- FY2024-25 baseline values for indexed thresholds
- Update HELP, Medicare levy, and SAPTO thresholds when ATO publishes official indexed rates

## Rate Resolver System

The **resolver** (`resolver.ts`) automatically provides rates for any financial year:

### How It Works

1. **Exact Rate Files**: If a rate file exists for the requested FY (e.g., `fy2025.ts`, `fy2026.ts`), it returns those exact values
2. **Forward Indexation**: If no file exists, it indexes forward from the latest known rates using your economic assumptions

### Indexation Rules

Different rate types are indexed differently:

| Rate Type | Indexation Rule |
|-----------|----------------|
| **Centrelink thresholds** | Inflation per year |
| **Tax brackets** | Frozen by default (can override with `indexTaxBrackets: true`) |
| **HELP thresholds** | Wage growth per year |
| **Super caps** | Wage growth per year (rounded to $2,500) |
| **SG rate** | From `sgRateSchedule` or default (capped at 12% from FY2025-26) |
| **Pension rates** | Inflation per year |
| **ASFA standards** | Inflation per year |
| **Preservation ages** | Never indexed (fixed by legislation) |
| **Taper rates & percentages** | Never indexed |

### Usage in Projections

```typescript
// In your monthly projection loop:
for (let month = startMonth; month <= endMonth; month++) {
  const currentFY = Math.floor(month / 12) + 2025;
  const rates = getRatesForFY(currentFY, assumptions);
  
  // Use rates for this month's calculations
  const tax = calculateTax(income, rates.tax.brackets);
  const sgContribution = income * rates.super.sgRate;
  const pension = calculatePension(assets, income, rates.centrelink);
}

## Rate Sources

- **ATO**: https://www.ato.gov.au/rates/
- **Services Australia**: https://www.servicesaustralia.gov.au/
- **ASFA**: https://www.superannuation.asn.au/resources/retirement-standard/

## Examples

### Calculate income tax
```typescript
import { TAX_BRACKETS, LITO } from '@/engine/rates';

function calculateIncomeTax(taxableIncome: number): number {
  const bracket = TAX_BRACKETS.find(
    (b) => taxableIncome >= b.minIncome && (b.maxIncome === null || taxableIncome <= b.maxIncome)
  );
  if (!bracket) throw new Error('Invalid income');
  
  const tax = bracket.baseAmount + (taxableIncome - bracket.minIncome + 1) * bracket.rate;
  return tax;
}
```

### Calculate Age Pension
```typescript
import { calculateAgePension } from '@/engine/rates';

const pension = calculateAgePension(
  30000,  // annual income
  400000, // assessable assets
  false,  // not couple
  true    // homeowner
);
```

### Check preservation age
```typescript
import { getPreservationAge } from '@/engine/rates';

const preservationAge = getPreservationAge(1965); // Returns: 60
```
