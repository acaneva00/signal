/**
 * Main Projection Engine
 *
 * Runs a monthly loop from the current month through to the month the
 * youngest household member turns 90. At each step it orchestrates all
 * sub-modules in the order specified by PRD Section 8.2 (steps 1–15).
 *
 * Monthly resolution gives accurate mortgage amortisation, smooth charts,
 * and aligns with real pay/contribution cycles. Tax is estimated monthly
 * via PAYG withholding then trued-up at each June EOFY.
 */

import type {
  Scenario,
  ProjectionResult,
  MonthSnapshot,
  PersonMonthDetail,
  Person,
  IncomeStream,
  Expense,
  Asset,
  SuperFund,
  Liability,
  ScheduledCashFlow,
  Assumptions,
  AllocationRules,
} from './models';

import {
  calculateIndividualTax,
  calculateMonthlyPayg,
  calculateDiv293,
} from './tax';

import {
  calculateSuperMonth,
  updateCatchUpStateAtFYEnd,
  getFinancialYear,
  isSuperAccessible,
  type FYContributionState,
  type CatchUpState,
  type BringForwardState,
  type SuperMonthResult,
} from './super';

import {
  calculateAgePension,
  calculateDeemedIncome,
  calculateCentrelinkAssetValue as clAssetValue,
  type CentrelinkRates,
  type CentrelinkResult,
  FORTNIGHTS_PER_YEAR,
} from './centrelink';

import {
  calculateAssetMonth,
  growAsset,
  applyDrawdown,
  isFinancialAsset,
  calculateCentrelinkAssetValue,
  type AssetMonthResult,
} from './assets';

import {
  calculateLiabilityMonth,
  updateLiability,
  applyHecsIndexation,
  type LiabilityMonthResult,
} from './liabilities';

import {
  calculateCapitalGain,
  applyCapitalLosses,
} from './cgt';

import {
  allocateSurplus,
  processDeficit,
  DEFAULT_SURPLUS_RULES,
  DEFAULT_DRAWDOWN_RULES,
  type SuperFundSummary,
} from './allocation';

import { getRatesForFY, type FYRates } from './rates/resolver';

// ── Per-Person Mutable State ─────────────────────────────────────────────────

interface PersonState {
  person: Person;
  isRetired: boolean;
  age: number;
  fyContributions: FYContributionState;
  catchUpState: CatchUpState;
  bringForwardState: BringForwardState;
  fyStartSuperBalance: number;

  // Annual accumulators (reset each July)
  fyEmploymentIncome: number;
  fyAssetIncome: number;
  fySuperPensionDrawdown: number;
  fyCentrelinkPayments: number;
  fyDeductions: number;
  fyFrankingCredits: number;
  fyPaygWithheld: number;
  fyConcessionalContributions: number;
  fyCapitalGains: number;
  capitalLossesCarried: number;
}

// ── Centrelink State ─────────────────────────────────────────────────────────

interface CentrelinkState {
  monthlyPayment: number;
  lastResult: CentrelinkResult | null;
  workBonusBalance: number;
}

// ── Entry Point ──────────────────────────────────────────────────────────────

export function project(scenario: Scenario): ProjectionResult {
  const assumptions = scenario.assumptions ?? defaultAssumptions();
  const allocationRules = scenario.allocation_rules ?? undefined;
  const startYear = scenario.start_year;
  const startMonth = 7; // begin at July (start of Australian FY)

  const endMonth = calculateEndMonth(scenario);

  const warnings: string[] = [];

  // Deep-clone mutable state from scenario inputs
  const members = scenario.household.members.map(p => ({ ...p }));
  const incomes = scenario.income_streams.map(i => ({ ...i }));
  const expenses = scenario.expenses.map(e => ({ ...e }));
  let assets = scenario.assets.map(a => ({ ...a }));
  let superFunds = scenario.super_funds.map(s => ({ ...s }));
  let liabilities = scenario.liabilities.map(l => ({ ...l }));
  const scheduledCashFlows = [...scenario.scheduled_cash_flows];

  const isCouple = scenario.household.relationship_status === 'partnered';
  const numDependents = scenario.household.num_dependents;

  // Per-person state
  const personState = new Map<string, PersonState>();
  for (const m of members) {
    const fy = getFinancialYear(startYear, startMonth);
    const fund = superFunds.find(f => f.person_id === m.id);
    personState.set(m.id, {
      person: m,
      isRetired: m.employment_status === 'retired',
      age: startYear - m.date_of_birth_year,
      fyContributions: { financialYear: fy, concessionalUsed: 0, nonConcessionalUsed: 0 },
      catchUpState: { unusedCapByFY: {} },
      bringForwardState: { triggeredInFY: null, totalUsedInWindow: 0 },
      fyStartSuperBalance: fund?.balance ?? 0,
      fyEmploymentIncome: 0,
      fyAssetIncome: 0,
      fySuperPensionDrawdown: 0,
      fyCentrelinkPayments: 0,
      fyDeductions: 0,
      fyFrankingCredits: 0,
      fyPaygWithheld: 0,
      fyConcessionalContributions: 0,
      fyCapitalGains: 0,
      capitalLossesCarried: 0,
    });
  }

  // Centrelink state (reassessed March + September)
  const clState: CentrelinkState = {
    monthlyPayment: 0,
    lastResult: null,
    workBonusBalance: 0,
  };

  // FY rates cache
  let currentFYRates: FYRates | null = null;
  let currentFY = 0;

  const snapshots: MonthSnapshot[] = [];

  // ── Monthly Loop ───────────────────────────────────────────────────────────

  let year = startYear;
  let month = startMonth;

  while (beforeOrEqual(year, month, endMonth.year, endMonth.month)) {
    const fy = getFinancialYear(year, month);

    // Refresh FY rates when FY changes
    if (fy !== currentFY) {
      currentFYRates = getRatesForFY(fy, {
        inflationRate: assumptions.inflation_rate,
        wageGrowthRate: assumptions.wage_growth_rate,
      });
      currentFY = fy;
    }
    const rates = currentFYRates!;

    // Years elapsed since projection start (for growth/inflation indexing)
    const monthsElapsed = (year - startYear) * 12 + (month - startMonth);

    // ── Step 1: Age persons, check life event triggers ─────────────────

    for (const ps of personState.values()) {
      ps.age = year - ps.person.date_of_birth_year + (month > 6 ? 0 : -1);
      // More precise: age is year of current birthday
      ps.age = calculateAge(ps.person.date_of_birth_year, year, month);

      if (
        !ps.isRetired &&
        ps.person.intended_retirement_age != null &&
        ps.age >= ps.person.intended_retirement_age
      ) {
        ps.isRetired = true;
        ps.person.employment_status = 'retired';
      }
    }

    // ── Step 2: Monthly employment / business income ───────────────────

    const monthlyIncomeByPerson = new Map<string, number>();
    const monthlySalarySacByPerson = new Map<string, number>();

    for (const income of incomes) {
      const ps = personState.get(income.person_id);
      if (!ps) continue;
      if (income.start_year != null && year < income.start_year) continue;
      if (income.end_year != null && year > income.end_year) continue;

      const isEmployment = income.income_type === 'employment' || income.income_type === 'self_employment';
      if (ps.isRetired && isEmployment) continue;

      // Income grows at each July (FY boundary)
      const yearsGrown = fy - getFinancialYear(startYear, startMonth);
      const growthFactor = Math.pow(1 + income.growth_rate, Math.max(0, yearsGrown));
      let monthlyGross = (income.gross_annual * growthFactor) / 12;

      // If salary package includes SG, extract the base salary portion
      if (income.includes_super) {
        const sgRate = rates.super.sgRate;
        monthlyGross = monthlyGross / (1 + sgRate);
      }

      const prev = monthlyIncomeByPerson.get(income.person_id) ?? 0;
      monthlyIncomeByPerson.set(income.person_id, prev + monthlyGross);

      if (income.salary_sacrifice_amount > 0 && isEmployment && !ps.isRetired) {
        const prevSS = monthlySalarySacByPerson.get(income.person_id) ?? 0;
        monthlySalarySacByPerson.set(income.person_id, prevSS + income.salary_sacrifice_amount / 12);
      }
    }

    // ── Step 3 & 4: Super (SG + voluntary contributions) ──────────────

    const superResults = new Map<string, SuperMonthResult>();

    for (let i = 0; i < superFunds.length; i++) {
      const fund = superFunds[i];
      const ps = personState.get(fund.person_id);
      if (!ps) continue;

      const monthlyEmpIncome = monthlyIncomeByPerson.get(fund.person_id) ?? 0;
      const monthlySS = monthlySalarySacByPerson.get(fund.person_id) ?? 0;

      const superOut = calculateSuperMonth({
        fund,
        age: ps.age,
        year,
        month,
        monthlyEmploymentIncome: monthlyEmpIncome,
        monthlySalarySacrifice: monthlySS,
        sgRate: rates.super.sgRate,
        concessionalCap: rates.super.contributionCaps.concessional,
        nonConcessionalCap: rates.super.contributionCaps.nonConcessional,
        bringForwardTSBThreshold: rates.super.contributionCaps.bringForwardTSBThreshold,
        isRetired: ps.isRetired,
        preservationAge: assumptions.super_preservation_age,
        fyContributions: ps.fyContributions,
        fyStartBalance: ps.fyStartSuperBalance,
        catchUpState: ps.catchUpState,
        bringForwardState: ps.bringForwardState,
      });

      superResults.set(fund.person_id, superOut.result);
      ps.fyContributions = superOut.updatedFYContributions;
      ps.bringForwardState = superOut.updatedBringForwardState;

      // Update fund balance for next month
      superFunds[i] = {
        ...fund,
        balance: superOut.result.closingBalance,
        phase: superOut.result.phase,
      };

      // Salary sacrifice reduces taxable employment income
      if (monthlySS > 0) {
        const current = monthlyIncomeByPerson.get(fund.person_id) ?? 0;
        monthlyIncomeByPerson.set(fund.person_id, Math.max(0, current - monthlySS));
      }

      // Track FY concessional contributions
      ps.fyConcessionalContributions += superOut.result.totalConcessional;
    }

    // ── Step 5: Super earnings already calculated inside calculateSuperMonth

    // ── Step 6: Monthly asset income ───────────────────────────────────

    const assetResults: AssetMonthResult[] = [];

    for (const asset of assets) {
      const ar = calculateAssetMonth(asset);
      assetResults.push(ar);
    }

    // ── Step 7: Monthly liability repayments ───────────────────────────

    const liabilityResults: LiabilityMonthResult[] = [];
    let totalLoanRepayments = 0;

    for (const liab of liabilities) {
      const lr = calculateLiabilityMonth(liab);
      liabilityResults.push(lr);
      totalLoanRepayments += lr.totalRepayment;
    }

    // ── Step 8: Monthly living expenses ────────────────────────────────

    // CPI-index at each July (FY boundary)
    const fyIndex = fy - getFinancialYear(startYear, startMonth);
    const inflationFactor = Math.pow(1 + assumptions.inflation_rate, Math.max(0, fyIndex));

    let totalExpenses = 0;
    for (const exp of expenses) {
      if (exp.start_year != null && year < exp.start_year) continue;
      if (exp.end_year != null && year > exp.end_year) continue;

      let monthlyAmount = exp.annual_amount / 12;
      if (exp.inflation_adjusted) {
        monthlyAmount *= inflationFactor;
      }
      totalExpenses += monthlyAmount;
    }

    // One-off scheduled cash flows for this month
    let scheduledNet = 0;
    for (const cf of scheduledCashFlows) {
      // Scheduled cash flows trigger in July of their year
      if (cf.year === year && month === 7) {
        scheduledNet += cf.amount;
      }
    }

    // ── Build per-person monthly detail ────────────────────────────────

    const personDetails: PersonMonthDetail[] = [];

    for (const ps of personState.values()) {
      const monthlyEmpIncome = monthlyIncomeByPerson.get(ps.person.id) ?? 0;
      const sr = superResults.get(ps.person.id);

      // Asset income attributed to this person
      let assetIncome = 0;
      let frankingCredits = 0;
      for (const ar of assetResults) {
        assetIncome += ar.incomeByPerson[ps.person.id] ?? 0;
        frankingCredits += ar.frankingByPerson[ps.person.id] ?? 0;
      }

      // Tax-deductible interest from investment loans
      let deductions = 0;
      for (const lr of liabilityResults) {
        if (lr.taxDeductibleInterest > 0 && lr.deductiblePersonId === ps.person.id) {
          deductions += lr.taxDeductibleInterest;
        }
      }

      // PAYG withholding estimate (monthly)
      const annualSalaryEstimate = monthlyEmpIncome * 12;
      const monthlyPayg = annualSalaryEstimate > 0
        ? calculateMonthlyPayg(annualSalaryEstimate)
        : 0;

      // Track FY accumulators
      ps.fyEmploymentIncome += monthlyEmpIncome;
      ps.fyAssetIncome += assetIncome;
      ps.fyDeductions += deductions;
      ps.fyFrankingCredits += frankingCredits;
      ps.fyPaygWithheld += monthlyPayg;
      if (sr) {
        ps.fySuperPensionDrawdown += sr.pensionDrawdown;
      }

      const pensionDrawdown = sr?.pensionDrawdown ?? 0;

      // Centrelink monthly share
      const clMonthlyPerPerson = members.length > 0
        ? clState.monthlyPayment / members.length
        : 0;
      ps.fyCentrelinkPayments += clMonthlyPerPerson;

      const detail: PersonMonthDetail = {
        person_id: ps.person.id,
        age: ps.age,
        employment_income: monthlyEmpIncome,
        asset_income: assetIncome,
        super_sg_contributions: sr?.employerSG ?? 0,
        super_voluntary_concessional: (sr?.voluntaryConcessional ?? 0) + (sr?.salarySacrifice ?? 0),
        super_voluntary_non_concessional: sr?.voluntaryNonConcessional ?? 0,
        super_balance: sr?.closingBalance ?? (superFunds.find(f => f.person_id === ps.person.id)?.balance ?? 0),
        super_pension_drawdown: pensionDrawdown,
        taxable_income: 0,
        tax_payable: 0,
        medicare_levy: 0,
        hecs_repayment: 0,
        tax_offsets: 0,
        net_tax: monthlyPayg,
        centrelink_income_tested: 0,
        franking_credits: frankingCredits,
        deductions,
      };
      personDetails.push(detail);
    }

    // ── Step 9: EOFY tax true-up (June) ───────────────────────────────

    let eofyTaxAdjustment = 0;

    if (month === 6) {
      for (const ps of personState.values()) {
        const detail = personDetails.find(d => d.person_id === ps.person.id)!;

        // Annual gross assessable income
        let annualGross =
          ps.fyEmploymentIncome +
          ps.fyAssetIncome +
          ps.fySuperPensionDrawdown +
          ps.fyCentrelinkPayments;

        // Super pension tax-free if 60+
        if (ps.age >= 60) {
          annualGross -= ps.fySuperPensionDrawdown;
        }

        const receivesPension = ps.fyCentrelinkPayments > 0;

        const taxResult = calculateIndividualTax({
          grossIncome: annualGross,
          deductions: ps.fyDeductions,
          frankingCredits: ps.fyFrankingCredits,
          isCouple,
          numDependents,
          age: ps.age,
          receivesAgePension: receivesPension,
          hasHecs: ps.person.has_hecs_help_debt,
          hecsBalance: ps.person.hecs_help_balance,
          reportableSuperContributions: ps.fyConcessionalContributions,
          taxBrackets: rates.tax.brackets,
        });

        // Apply capital gains to tax
        let additionalTaxFromCGT = 0;
        if (ps.fyCapitalGains > 0) {
          const lossResult = applyCapitalLosses(ps.fyCapitalGains, ps.capitalLossesCarried);
          ps.capitalLossesCarried = lossResult.remainingLosses;
          additionalTaxFromCGT = lossResult.taxableGain; // added to taxable income
        }

        const annualTax = Math.max(0, taxResult.totalTax) + additionalTaxFromCGT * taxResult.effectiveRate;
        const trueUp = annualTax - ps.fyPaygWithheld;

        eofyTaxAdjustment += trueUp;

        // Update detail with annual figures
        detail.taxable_income = taxResult.taxableIncome;
        detail.tax_payable = taxResult.baseTax;
        detail.medicare_levy = taxResult.medicareLevy;
        detail.hecs_repayment = taxResult.hecsRepayment;
        detail.tax_offsets = taxResult.lito + taxResult.sapto + taxResult.frankingCreditOffset;
        detail.net_tax = trueUp;

        // HECS balance reduction
        if (taxResult.hecsRepayment > 0) {
          ps.person.hecs_help_balance = Math.max(0, ps.person.hecs_help_balance - taxResult.hecsRepayment);
        }

        // Div 293
        const div293 = calculateDiv293(annualGross, ps.fyConcessionalContributions);
        if (div293 > 0) {
          eofyTaxAdjustment += div293;
        }

        // HECS indexation
        if (ps.person.has_hecs_help_debt) {
          for (let li = 0; li < liabilities.length; li++) {
            if (liabilities[li].liability_type === 'hecs_help' && liabilities[li].owner_id === ps.person.id) {
              liabilities[li] = applyHecsIndexation(liabilities[li], assumptions.inflation_rate);
            }
          }
        }

        // Update catch-up state at FY end
        ps.catchUpState = updateCatchUpStateAtFYEnd(
          ps.catchUpState,
          fy,
          rates.super.contributionCaps.concessional,
          ps.fyContributions.concessionalUsed,
        );

        // Reset FY accumulators
        const nextFund = superFunds.find(f => f.person_id === ps.person.id);
        ps.fyStartSuperBalance = nextFund?.balance ?? 0;
        ps.fyEmploymentIncome = 0;
        ps.fyAssetIncome = 0;
        ps.fySuperPensionDrawdown = 0;
        ps.fyCentrelinkPayments = 0;
        ps.fyDeductions = 0;
        ps.fyFrankingCredits = 0;
        ps.fyPaygWithheld = 0;
        ps.fyConcessionalContributions = 0;
        ps.fyCapitalGains = 0;
      }
    }

    // ── Step 10: Centrelink reassessment (March and September) ─────────

    if (month === 3 || month === 9) {
      const ages = members.map(m => {
        const ps = personState.get(m.id)!;
        return ps.age;
      });

      const anyEligible = ages.some(a => a >= 67);

      if (anyEligible) {
        const { financial, nonFinancial } = calculateCentrelinkAssetValue(assets);

        // Add super in pension phase to financial assets for deeming
        let superInPension = 0;
        for (const fund of superFunds) {
          if (fund.phase === 'pension') {
            superInPension += fund.balance;
          }
        }

        const totalFinancial = financial + superInPension;
        const totalAssessable = totalFinancial + nonFinancial;

        const totalEmploymentAnnual = Array.from(personState.values())
          .reduce((sum, ps) => sum + (monthlyIncomeByPerson.get(ps.person.id) ?? 0) * 12, 0);

        // Non-deemed ordinary income (rental, etc.)
        let otherOrdinary = 0;
        for (const asset of assets) {
          if (!isFinancialAsset(asset) && asset.income_yield > 0 && !asset.is_primary_residence) {
            otherOrdinary += asset.current_value * asset.income_yield;
          }
        }

        const isHomeowner = members.some(m => m.is_homeowner);

        const clResult = calculateAgePension(
          {
            ages,
            isCouple,
            isHomeowner,
            employmentIncomeAnnual: totalEmploymentAnnual,
            otherOrdinaryIncomeAnnual: otherOrdinary,
            financialAssets: totalFinancial,
            assessableAssets: totalAssessable,
            workBonusBalance: clState.workBonusBalance,
          },
          {
            pensionRates: rates.centrelink.agePensionRates,
            incomeTest: rates.centrelink.incomeTest,
            assetsTest: rates.centrelink.assetsTest,
            deemingRates: rates.centrelink.deemingRates,
            workBonus: rates.centrelink.workBonus,
          },
        );

        clState.lastResult = clResult;
        // Convert fortnightly to monthly: fortnightly × 26 / 12
        clState.monthlyPayment = (clResult.totalPaymentFn * FORTNIGHTS_PER_YEAR) / 12;
      } else {
        clState.monthlyPayment = 0;
        clState.lastResult = null;
      }
    }

    // ── Step 11: Monthly household net cash flow ───────────────────────

    const totalEmploymentIncome = personDetails.reduce((s, d) => s + d.employment_income, 0);
    const totalAssetIncome = personDetails.reduce((s, d) => s + d.asset_income, 0);
    const totalSuperPension = personDetails.reduce((s, d) => s + d.super_pension_drawdown, 0);
    const totalCentrelinkPayments = clState.monthlyPayment;

    const totalGrossIncome =
      totalEmploymentIncome +
      totalAssetIncome +
      totalSuperPension +
      totalCentrelinkPayments;

    // PAYG withholding (monthly estimate, except at EOFY when true-up applies)
    const totalPayg = month === 6
      ? eofyTaxAdjustment
      : personDetails.reduce((s, d) => s + d.net_tax, 0);

    const totalSGContrib = personDetails.reduce((s, d) => s + d.super_sg_contributions, 0);
    const totalVolConcessional = personDetails.reduce((s, d) => s + d.super_voluntary_concessional, 0);
    const totalNCC = personDetails.reduce((s, d) => s + d.super_voluntary_non_concessional, 0);

    const netCashFlow =
      totalGrossIncome +
      scheduledNet -
      totalExpenses -
      totalLoanRepayments -
      totalPayg -
      totalSGContrib -
      totalVolConcessional -
      totalNCC;

    // ── Steps 12 & 13: Surplus or deficit allocation ──────────────────

    const surplusRules = allocationRules?.surplus_priority ?? DEFAULT_SURPLUS_RULES;
    const drawdownRules = allocationRules?.drawdown_priority ?? DEFAULT_DRAWDOWN_RULES;

    if (netCashFlow > 0) {
      const actions = allocateSurplus(
        netCashFlow,
        surplusRules,
        assets,
        liabilities,
        totalExpenses,
      );

      for (const action of actions) {
        applyAllocationAction(action, assets, liabilities);
      }
    } else if (netCashFlow < 0) {
      const anySuperAccessible = Array.from(personState.values()).some(ps =>
        isSuperAccessible(ps.age, assumptions.super_preservation_age, ps.isRetired),
      );

      const accessibleSuperFunds: SuperFundSummary[] = anySuperAccessible
        ? superFunds
          .filter(f => {
            const ps = personState.get(f.person_id);
            return ps && isSuperAccessible(ps.age, assumptions.super_preservation_age, ps.isRetired);
          })
          .map(f => ({ person_id: f.person_id, balance: f.balance }))
        : [];

      const deficitResult = processDeficit(
        Math.abs(netCashFlow),
        drawdownRules,
        assets,
        liabilities,
        { superAccessible: anySuperAccessible, superFunds: accessibleSuperFunds },
      );

      for (const action of deficitResult.actions) {
        if (action.action === 'draw_super') continue;
        applyDrawdownAction(action, assets, liabilities);
      }

      for (const sd of deficitResult.super_drawdowns) {
        const idx = superFunds.findIndex(f => f.person_id === sd.person_id);
        if (idx >= 0) {
          superFunds[idx] = {
            ...superFunds[idx],
            balance: Math.max(0, superFunds[idx].balance - sd.amount),
          };
        }
      }

      // Step 14: CGT from deficit disposals
      for (const cgtEvent of deficitResult.cgt_events) {
        const ownerAsset = assets.find(a => a.id === cgtEvent.asset_id);
        if (ownerAsset?.owner_id) {
          const ps = personState.get(ownerAsset.owner_id);
          if (ps) {
            ps.fyCapitalGains += cgtEvent.net_gain;
          }
        }
      }

      if (deficitResult.actions.length === 0 && Math.abs(netCashFlow) > 0.01) {
        warnings.push(
          `${year}-${String(month).padStart(2, '0')}: Cannot fund deficit of $${Math.abs(netCashFlow).toFixed(0)} — insufficient liquid assets`,
        );
      }
    }

    // ── Step 14: Scheduled disposal events and CGT ────────────────────
    // (Handled above for deficit drawdown; scheduled disposals handled via scheduled_cash_flows)

    // ── Step 15: Grow/revalue all assets ──────────────────────────────

    for (let i = 0; i < assets.length; i++) {
      const ar = assetResults.find(r => r.assetId === assets[i].id);
      if (ar) {
        assets[i] = growAsset(assets[i], ar);
      }
    }

    // Update liabilities
    for (let i = 0; i < liabilities.length; i++) {
      const lr = liabilityResults.find(r => r.liabilityId === liabilities[i].id);
      if (lr) {
        liabilities[i] = updateLiability(liabilities[i], lr);
      }
    }

    // ── Record MonthSnapshot ──────────────────────────────────────────

    const totalAssets = assets.reduce((s, a) => s + a.current_value, 0);
    const totalSuper = superFunds.reduce((s, f) => s + f.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.current_balance, 0);

    const snapshot: MonthSnapshot = {
      year,
      month,
      persons: personDetails,

      total_gross_income: totalGrossIncome,
      total_employment_income: totalEmploymentIncome,
      total_asset_income: totalAssetIncome,
      total_centrelink_payments: totalCentrelinkPayments,
      total_super_pension_income: totalSuperPension,
      total_expenses: totalExpenses,
      total_loan_repayments: totalLoanRepayments,
      total_tax: totalPayg,
      scheduled_cashflows_net: scheduledNet,
      net_cash_flow: netCashFlow,

      total_assets: totalAssets,
      total_super: totalSuper,
      total_liabilities: totalLiabilities,
      net_worth: totalAssets + totalSuper - totalLiabilities,

      age_pension_monthly: clState.monthlyPayment,
      centrelink_income_test_result: clState.lastResult?.incomeTestPensionFn ?? 0,
      centrelink_assets_test_result: clState.lastResult?.assetsTestPensionFn ?? 0,

      asset_values: Object.fromEntries(assets.map(a => [a.id, a.current_value])),
      liability_balances: Object.fromEntries(liabilities.map(l => [l.id, l.current_balance])),
    };

    snapshots.push(snapshot);

    // Advance to next month
    ({ year, month } = nextMonth(year, month));
  }

  // Determine end year from last snapshot
  const lastSnap = snapshots[snapshots.length - 1];

  return {
    scenario_name: scenario.name,
    start_year: startYear,
    end_year: lastSnap?.year ?? startYear,
    snapshots,
    warnings,
    metadata: {
      total_months: snapshots.length,
      monthly_resolution: true,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultAssumptions(): Assumptions {
  return {
    inflation_rate: 0.03,
    wage_growth_rate: 0.035,
    tax_bracket_indexation: 0,
    centrelink_indexation: 0.025,
    sg_rate: 0.12,
    sg_rate_schedule: {},
    concessional_cap: 30_000,
    non_concessional_cap: 120_000,
    super_preservation_age: 60,
    deeming_rate_lower: 0.0025,
    deeming_rate_upper: 0.0225,
    deeming_threshold_single: 60_400,
    deeming_threshold_couple: 100_200,
    default_returns: {
      cash: { growth: 0.0, income: 0.04 },
      australian_shares: { growth: 0.04, income: 0.04, franking: 0.70 },
      international_shares: { growth: 0.06, income: 0.02 },
      property_investment: { growth: 0.03, income: 0.035 },
      property_home: { growth: 0.04, income: 0.0 },
      fixed_interest: { growth: 0.0, income: 0.045 },
      mixed_balanced: { growth: 0.03, income: 0.03, franking: 0.30 },
    },
  };
}

function calculateEndMonth(scenario: Scenario): { year: number; month: number } {
  const members = scenario.household.members;

  // Find youngest member
  const youngestBirthYear = Math.max(...members.map(m => m.date_of_birth_year));
  const targetAge = 90;
  const endYear = youngestBirthYear + targetAge;

  // If projection_years is set and produces an earlier end, use that
  const projEndYear = scenario.start_year + scenario.projection_years;
  const finalYear = Math.min(endYear, projEndYear);

  return { year: finalYear, month: 6 }; // End at June (EOFY)
}

function calculateAge(birthYear: number, currentYear: number, currentMonth: number): number {
  // Simplified: assumes birthday is January. For monthly resolution
  // we treat the age as changing at the start of each calendar year.
  return currentYear - birthYear;
}

function beforeOrEqual(y1: number, m1: number, y2: number, m2: number): boolean {
  return y1 < y2 || (y1 === y2 && m1 <= m2);
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

/** Apply a surplus allocation action by mutating the assets/liabilities arrays. */
function applyAllocationAction(
  action: { action: string; target_id: string; amount: number },
  assets: Asset[],
  liabilities: Liability[],
): void {
  switch (action.action) {
    case 'add_to_buffer':
    case 'remainder_to_cash':
    case 'investment_contribution': {
      const idx = assets.findIndex(a => a.id === action.target_id);
      if (idx >= 0) {
        assets[idx] = { ...assets[idx], current_value: assets[idx].current_value + action.amount };
      }
      break;
    }
    case 'extra_debt_repayment': {
      const idx = liabilities.findIndex(l => l.id === action.target_id);
      if (idx >= 0) {
        liabilities[idx] = {
          ...liabilities[idx],
          current_balance: Math.max(0, liabilities[idx].current_balance - action.amount),
        };
      }
      break;
    }
  }
}

/** Apply a drawdown action by mutating the assets/liabilities arrays. */
function applyDrawdownAction(
  action: { action: string; source_id: string; amount: number },
  assets: Asset[],
  liabilities: Liability[],
): void {
  if (action.action === 'repay_linked_liability') {
    const idx = liabilities.findIndex(l => l.id === action.source_id);
    if (idx >= 0) {
      liabilities[idx] = {
        ...liabilities[idx],
        current_balance: Math.max(0, liabilities[idx].current_balance - action.amount),
      };
    }
    return;
  }

  const idx = assets.findIndex(a => a.id === action.source_id);
  if (idx >= 0) {
    const result = applyDrawdown(assets[idx], action.amount);
    assets[idx] = result.asset;
  }
}
