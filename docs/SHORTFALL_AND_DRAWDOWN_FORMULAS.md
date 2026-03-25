# Shortfall and Secondary Drawdown Formulas

## 1. Monthly Gross Shortfall (Reactive)

```
monthlyGrossShortfall = max(0,
  totalExpenses
  - monthlyEarnedIncome
  - monthlyPassiveIncome
  - scheduledNet
  + totalPayg
)
```

Where:
- **totalExpenses** = sum of applicable expenses for the month (CPI-indexed if inflation_adjusted)
- **monthlyEarnedIncome** = total employment income for the month
- **monthlyPassiveIncome** = totalAssetIncome + totalCentrelinkPayments + totalSuperPension (min ABP)
- **scheduledNet** = one-off scheduled cash flows (non-super) in July
- **totalPayg** = PAYG withholding (monthly estimate, or EOFY true-up in June)

## 2. Two-Pass: Annual Gross Shortfall (Transition Year)

**When:** First retirement month in the FY, `projection_scope === 'super_only'`

```
firstRetMonth = (retirementMonth === 12) ? 1 : retirementMonth + 1

monthsInPension = (firstRetMonth <= 6)
  ? (7 - firstRetMonth)
  : (12 - firstRetMonth + 1) + 6

annualMinABP = pensionStartBalance × minRate × (monthsInPension / 12)

annualExpenses = totalExpenses × monthsInPension

annualTaxablePassive = annualCentrelink + annualAssetIncome
annualPassiveTax = estimate via calculateIndividualTax (split 50/50 for couples)
annualNetPassive = annualTaxablePassive - annualPassiveTax

annualGrossShortfall = max(0,
  annualExpenses - annualMinABP - annualNetPassive
)

fyMonthlyAdditionalDrawTarget = annualGrossShortfall / monthsInPension
```

Where:
- **minRate** = getMinimumDrawdownRate(age), e.g. 4% for age 64
- **annualCentrelink** = ps.fyCentrelinkPayments × scale (scale = 12 / monthsElapsed)
- **annualAssetIncome** = ps.fyAssetIncome × scale

## 3. Two-Pass: Annual Gross Shortfall (Full Retirement Year)

**When:** `month === 7`, `projection_scope === 'super_only'`, person retired

```
annualMinABP = fy_opening_balance × minRate   // same as super.ts (ATO: fixed 1 July balance)
```

Where `fy_opening_balance` is the fund balance at 1 July (set by engine at month 7). Per ATO rules, minimum pension is calculated once at the start of the FY on the opening balance.

```
annualTaxablePassive = annualCentrelink + annualAssetIncome
annualPassiveTax = estimate via calculateIndividualTax (split 50/50 for couples)
annualNetPassive = annualTaxablePassive - annualPassiveTax

annualGrossShortfall = max(0,
  annualExpenses - annualMinABP - annualNetPassive
)

fyMonthlyAdditionalDrawTarget = annualGrossShortfall / 12
```

Passive income (Age Pension, asset income) is taxable; min ABP is tax-free for 60+. Pass 1 uses net-of-tax passive income so the shortfall target reflects actual spendable income.

## 4. Amount to Draw (Deficit Block)

```
useTwoPass = isSuperOnly && isRetiredThisMonth && fyMonthlyAdditionalDrawTarget != null && fyMonthlyAdditionalDrawTarget >= 0

monthlyAmountToDraw = useTwoPass ? fyMonthlyAdditionalDrawTarget : monthlyGrossShortfall

amountToPass = (useTwoPass && anySuperAccessible)
  ? min(monthlyAmountToDraw, sum(accessibleSuperFunds.balance))
  : monthlyAmountToDraw
```

## 5. Secondary Source Drawdown (processDeficit)

Drawdown order for `super_only`: super → cash → fixed_interest → shares → property

For each rule, draw up to `remaining` from available sources:

```
drawAmount = min(remaining, fund.balance)   // for super
drawAmount = min(remaining, asset.current_value)  // for cash/shares/etc.

remaining -= drawAmount
```

**Additional ABP** = sum of `super_drawdowns` from processDeficit (beyond min ABP already drawn in super module).

## 6. Chart Shortfall

```
totalIncome = employmentIncomeAnnual + superDrawdownMinAnnual + superDrawdownAdditionalAnnual
  + agePensionAnnualNet + nonSuperIncomeAnnualNet + nonSuperDrawdownCashAnnual
  + nonSuperDrawdownSaleAnnual + taxRefundAnnual

shortfall = max(0, retirementSpendingTargetForPoint - totalIncome)
```

## 7. Future Shortfalls (Age 84+)

When super balance is exhausted:
- **accessibleSuperBalance** = 0
- **amountToPass** = min(fyMonthlyAdditionalDrawTarget, 0) = 0 when using two-pass
- No additional ABP can be drawn; shortfall remains unfunded
