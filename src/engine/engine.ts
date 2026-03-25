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
import { getBirthYearFromDate, getBirthMonthFromDate } from './models';

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
  SUPER_ONLY_DRAWDOWN_RULES,
  type SuperFundSummary,
} from './allocation';

import { getRatesForFY, type FYRates } from './rates/resolver';
import { getMinimumDrawdownRate } from './rates/super-fy2025';

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
      age: calculateAge(m.date_of_birth, startYear, startMonth),
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

  // FY accumulators for annual surplus/deficit (reset each July)
  let fyTotalNeeded = 0;
  let fyTotalUnavoidable = 0;
  let fyScheduledNet = 0;
  let fyExpenses = 0;
  let fyTax = 0;
  let fyPension = 0;
  let fyAssetIncome = 0;

  // FY metadata for trajectory (gross shortfall, secondary-by-source)
  let fyGrossShortfall = 0;
  let fyMonthlyAdditionalDrawTarget: number | null = null;
  let fyAnnualExpenses = 0; // set in Pass 1, used for June cap
  let fyActualMinABPDrawn = 0;
  let fyActualAdditionalABPDrawn = 0;
  let fyActualCentrelink = 0;
  let fyActualAssetIncome = 0;
  let fyActualTax = 0;
  let fySecondaryCash = 0;
  let fySecondaryFixedInterest = 0;
  let fySecondarySuper = 0;
  let fySecondaryShares = 0;
  let fySecondaryProperty = 0;
  let fyLumpSum = 0;
  const fyMetadataByYear: Array<{
    fy: number;
    fyGrossShortfall: number;
    fySecondaryCash: number;
    fySecondaryFixedInterest: number;
    fySecondarySuper: number;
    fySecondaryShares: number;
    fySecondaryProperty: number;
    fyLumpSum: number;
  }> = [];

  // ── Monthly Loop ───────────────────────────────────────────────────────────

  let year = startYear;
  let month = startMonth;

  const LUMP_SUM_TRANSIENT_ID = '__lump_sum_transient__';

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

    // Reset FY accumulators at start of FY (July); capture previous FY metadata first
    if (month === 7) {
      if (fyMetadataByYear.length > 0 || fyGrossShortfall > 0 || fySecondaryCash > 0 || fySecondarySuper > 0 || fyLumpSum > 0) {
        const prevFy = getFinancialYear(year, 7) - 1;
        fyMetadataByYear.push({
          fy: prevFy,
          fyGrossShortfall,
          fySecondaryCash,
          fySecondaryFixedInterest,
          fySecondarySuper,
          fySecondaryShares,
          fySecondaryProperty,
          fyLumpSum,
        });
      }
      fyTotalNeeded = 0;
      fyTotalUnavoidable = 0;
      fyScheduledNet = 0;
      fyExpenses = 0;
      fyTax = 0;
      fyPension = 0;
      fyAssetIncome = 0;
      fyGrossShortfall = 0;
      fyMonthlyAdditionalDrawTarget = null;
      fyAnnualExpenses = 0;
      fyActualMinABPDrawn = 0;
      fyActualAdditionalABPDrawn = 0;
      fyActualCentrelink = 0;
      fyActualAssetIncome = 0;
      fyActualTax = 0;
      fySecondaryCash = 0;
      fySecondaryFixedInterest = 0;
      fySecondarySuper = 0;
      fySecondaryShares = 0;
      fySecondaryProperty = 0;
      fyLumpSum = 0;
    }

    // Years elapsed since projection start (for growth/inflation indexing)
    const monthsElapsed = (year - startYear) * 12 + (month - startMonth);

    // ── Step 1: Age persons, check life event triggers ─────────────────

    for (const ps of personState.values()) {
      ps.age = calculateAge(ps.person.date_of_birth, year, month);

      // Retirement occurs in the month person turns retirement age (default: birth month).
      // First month of retirement = month after retirement month (e.g. retire Sept → first retirement month Oct).
      const retirementAge = ps.person.intended_retirement_age ?? 67;
      const retirementYear = getBirthYearFromDate(ps.person.date_of_birth) + retirementAge;
      const retirementMonth = ps.person.intended_retirement_month ?? getBirthMonthFromDate(ps.person.date_of_birth);
      const shouldRetire = (year > retirementYear) || (year === retirementYear && month > retirementMonth);
      if (!ps.isRetired && ps.person.intended_retirement_age != null && shouldRetire) {
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
      // FY-aligned: start_year = from July of that year; end_year = through June of that year
      if (income.start_year != null && (year < income.start_year || (year === income.start_year && month < 7))) continue;
      if (income.end_year != null && (year > income.end_year || (year === income.end_year && month > 6))) continue;

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

    // ── Step 2.5: Super lump sum withdrawals (before super calc so earnings/drawdown use reduced balance)
    const lumpSumByPerson = new Map<string, number>();
    for (const cf of scheduledCashFlows) {
      if (cf.year === year && month === 7 && cf.source === 'super') {
        const amt = Math.abs(cf.amount);
        const pid = cf.person_id ?? members[0]?.id;
        if (pid && amt > 0) {
          const idx = superFunds.findIndex(f => f.person_id === pid);
          if (idx >= 0) {
            const withdraw = Math.min(amt, superFunds[idx].balance);
            superFunds[idx] = { ...superFunds[idx], balance: Math.max(0, superFunds[idx].balance - withdraw) };
            lumpSumByPerson.set(pid, (lumpSumByPerson.get(pid) ?? 0) + withdraw);
          }
        }
      }
    }

    // Lump sum proceeds → cash pool (processDeficit draws from it in normal order)
    const totalLumpSumThisMonth = Array.from(lumpSumByPerson.values()).reduce((s, v) => s + v, 0);
    if (totalLumpSumThisMonth > 0) {
      const cashAsset = assets.find(a => a.asset_class === 'cash');
      if (cashAsset) {
        cashAsset.current_value += totalLumpSumThisMonth;
      } else if (scenario.projection_scope === 'super_only') {
        // Super_only with no cash asset: create transient cash for this month only
        assets.push({
          id: LUMP_SUM_TRANSIENT_ID,
          name: 'Lump sum proceeds (transient)',
          asset_class: 'cash',
          current_value: totalLumpSumThisMonth,
          cost_base: 0,
          ownership_type: 'individual',
          owner_id: members[0]?.id ?? null,
          ownership_split: {},
          growth_rate: 0,
          income_yield: 0,
          franking_rate: 0,
          expense_ratio: 0,
          is_centrelink_assessable: false,
          is_deemed: false,
          is_primary_residence: false,
          funded_by_liability_id: null,
          is_lifestyle_asset: false,
          depreciation_rate: 0,
        });
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

      const retirementAge = ps.person.intended_retirement_age ?? 67;
      const retirementYear = getBirthYearFromDate(ps.person.date_of_birth) + retirementAge;
      const retirementMonth = ps.person.intended_retirement_month ?? getBirthMonthFromDate(ps.person.date_of_birth);

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
        retirementMonth,
        retirementYear,
      });

      superResults.set(fund.person_id, superOut.result);
      ps.fyContributions = superOut.updatedFYContributions;
      ps.bringForwardState = superOut.updatedBringForwardState;

      // Update fund balance for next month; set pension_start_balance when transitioning to pension
      let updatedFund: typeof fund = {
        ...fund,
        balance: superOut.result.closingBalance,
        phase: superOut.result.phase,
      };
      if (fund.phase === 'accumulation' && superOut.result.phase === 'pension') {
        updatedFund = { ...updatedFund, pension_start_balance: fund.balance };
      }
      if (month === 7 && fund.phase === 'pension') {
        updatedFund = {
          ...updatedFund,
          pension_start_balance: null,
          fy_opening_balance: fund.balance,
        };
      }
      superFunds[i] = updatedFund;

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

    const primaryMember = scenario.household.members[0];
    const primaryRetirementAge = primaryMember?.intended_retirement_age ?? 67;
    const primaryRetirementYear = primaryMember
      ? getBirthYearFromDate(primaryMember.date_of_birth) + primaryRetirementAge
      : 0;
    const primaryRetirementMonth = primaryMember
      ? (primaryMember.intended_retirement_month ?? getBirthMonthFromDate(primaryMember.date_of_birth))
      : 12;
    const isSuperOnly = scenario.projection_scope === 'super_only';
    const isInTransitionFY = primaryRetirementYear > 0 && fy === getFinancialYear(primaryRetirementYear, primaryRetirementMonth);
    const isRetiredThisMonth = (year > primaryRetirementYear) || (year === primaryRetirementYear && month > primaryRetirementMonth);

    let totalExpenses = 0;
    for (const exp of expenses) {
      // start_year / end_year = financial year (e.g. 2026 = July 2025–June 2026)
      if (exp.start_year != null && fy < exp.start_year) continue;
      if (exp.end_year != null && fy > exp.end_year) continue;

      // Super-only transition year: apply retirement expenses only for months when person is retired
      if (isSuperOnly && isInTransitionFY && exp.start_year != null && !isRetiredThisMonth) continue;

      let monthlyAmount = exp.annual_amount / 12;
      if (exp.inflation_adjusted) {
        monthlyAmount *= inflationFactor;
      }
      totalExpenses += monthlyAmount;
    }

    // One-off scheduled cash flows for this month (general only; super lump sums handled above)
    let scheduledNet = 0;
    for (const cf of scheduledCashFlows) {
      if (cf.year === year && month === 7 && cf.source !== 'super') {
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

      const lumpSumThisMonth = lumpSumByPerson.get(ps.person.id) ?? 0;
      const detail: PersonMonthDetail = {
        person_id: ps.person.id,
        age: ps.age,
        employment_income: monthlyEmpIncome,
        asset_income: assetIncome,
        super_sg_contributions: sr?.employerSG ?? 0,
        super_voluntary_concessional: (sr?.voluntaryConcessional ?? 0) + (sr?.salarySacrifice ?? 0),
        super_voluntary_non_concessional: sr?.voluntaryNonConcessional ?? 0,
        super_balance: superFunds.find(f => f.person_id === ps.person.id)?.balance ?? sr?.closingBalance ?? 0,
        super_investment_return: sr ? (sr.grossEarnings - sr.earningsTax) : 0,
        super_fees: sr ? (sr.adminFees + sr.insurancePremium) : 0,
        super_pension_drawdown: pensionDrawdown,
        super_lump_sum_withdrawal: lumpSumThisMonth,
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

    // Accumulate FY totals for annual surplus/deficit
    fyTotalNeeded +=
      totalExpenses +
      totalLoanRepayments +
      totalPayg +
      totalSGContrib +
      totalVolConcessional +
      totalNCC;
    fyTotalUnavoidable += totalGrossIncome;
    fyScheduledNet += scheduledNet;
    fyExpenses += totalExpenses;
    fyTax += totalPayg;
    fyPension += totalCentrelinkPayments;
    fyAssetIncome += totalAssetIncome;

    // ── Pass 1: FY pre-compute for two-pass additional ABP (super_only, retired) ─
    if (isSuperOnly && fyMonthlyAdditionalDrawTarget === null) {
      const primaryId = members[0]?.id;
      const primaryPs = primaryId ? personState.get(primaryId) : null;
      const primaryFund = primaryId ? superFunds.find(f => f.person_id === primaryId) : null;

      if (primaryPs && primaryPs.isRetired) {
        if (isInTransitionFY && isRetiredThisMonth) {
          // Transition year: first retirement month in FY
          const pensionStartBalance = primaryFund?.pension_start_balance ?? null;
          if (pensionStartBalance != null && pensionStartBalance > 0) {
            const firstRetMonth = primaryRetirementMonth === 12 ? 1 : primaryRetirementMonth + 1;
            const monthsInPension = firstRetMonth <= 6
              ? 7 - firstRetMonth
              : (12 - firstRetMonth + 1) + 6;
            const minRate = getMinimumDrawdownRate(primaryPs.age);
            const annualMinABP = pensionStartBalance * minRate * (monthsInPension / 12);

            const annualExpenses = totalExpenses * monthsInPension;
            fyAnnualExpenses = annualExpenses;
            const monthsElapsed = month - 6;
            const scale = monthsElapsed > 0 ? 12 / monthsElapsed : 1;
            const annualEmploymentIncome = primaryPs.fyEmploymentIncome * scale;
            const annualAssetIncome = primaryPs.fyAssetIncome * scale;
            const annualCentrelink = primaryPs.fyCentrelinkPayments * scale;

            const annualTaxableIncome = annualEmploymentIncome + annualCentrelink + annualAssetIncome;
            const annualFranking = primaryPs.fyFrankingCredits * scale;
            const annualDeductions = primaryPs.fyDeductions * scale;

            let annualNetPassive = annualCentrelink + annualAssetIncome;
            if (annualTaxableIncome > 0) {
              const grossPerPerson = isCouple ? annualTaxableIncome / 2 : annualTaxableIncome;
              const frankingPerPerson = isCouple ? annualFranking / 2 : annualFranking;
              const deductionsPerPerson = isCouple ? annualDeductions / 2 : annualDeductions;
              const taxResult = calculateIndividualTax({
                grossIncome: grossPerPerson,
                deductions: deductionsPerPerson,
                frankingCredits: frankingPerPerson,
                isCouple,
                numDependents,
                age: primaryPs.age,
                receivesAgePension: annualCentrelink > 0,
                hasHecs: primaryPs.person.has_hecs_help_debt,
                hecsBalance: primaryPs.person.hecs_help_balance,
                reportableSuperContributions: 0,
                taxBrackets: rates.tax.brackets,
              });
              const annualTotalTax = isCouple ? 2 * taxResult.totalTax : taxResult.totalTax;
              const effectiveRate = annualTotalTax / annualTaxableIncome;
              annualNetPassive = annualCentrelink * (1 - effectiveRate) + annualAssetIncome * (1 - effectiveRate);
            }

            const annualGrossShortfall = Math.max(
              0,
              annualExpenses - annualMinABP - annualNetPassive,
            );
            fyMonthlyAdditionalDrawTarget = annualGrossShortfall / monthsInPension;
          }
        } else if (!isInTransitionFY && month === 7) {
          // Full retirement year: at FY start (use fy_opening_balance to match super.ts)
          const openingBal = primaryFund?.fy_opening_balance ?? primaryPs.fyStartSuperBalance;
          if (openingBal > 0) {
            const minRate = getMinimumDrawdownRate(primaryPs.age);
            const annualMinABP = openingBal * minRate;
            const annualExpenses = totalExpenses * 12;
            fyAnnualExpenses = annualExpenses;
            const annualAssetIncome = totalAssetIncome * 12;
            const annualCentrelink = totalCentrelinkPayments * 12;

            const annualTaxableIncome = annualCentrelink + annualAssetIncome;

            const primaryDetail = personDetails.find(d => d.person_id === primaryId);
            const annualFranking = (primaryDetail?.franking_credits ?? 0) * 12;
            const annualDeductions = (primaryDetail?.deductions ?? 0) * 12;

            let annualNetPassive = annualCentrelink + annualAssetIncome;
            if (annualTaxableIncome > 0) {
              const grossPerPerson = isCouple ? annualTaxableIncome / 2 : annualTaxableIncome;
              const frankingPerPerson = isCouple ? annualFranking / 2 : annualFranking;
              const deductionsPerPerson = isCouple ? annualDeductions / 2 : annualDeductions;
              const taxResult = calculateIndividualTax({
                grossIncome: grossPerPerson,
                deductions: deductionsPerPerson,
                frankingCredits: frankingPerPerson,
                isCouple,
                numDependents,
                age: primaryPs.age,
                receivesAgePension: annualCentrelink > 0,
                hasHecs: primaryPs.person.has_hecs_help_debt,
                hecsBalance: primaryPs.person.hecs_help_balance,
                reportableSuperContributions: 0,
                taxBrackets: rates.tax.brackets,
              });
              const annualTotalTax = isCouple ? 2 * taxResult.totalTax : taxResult.totalTax;
              const effectiveRate = annualTotalTax / annualTaxableIncome;
              annualNetPassive = annualCentrelink * (1 - effectiveRate) + annualAssetIncome * (1 - effectiveRate);
            }

            const annualGrossShortfall = Math.max(
              0,
              annualExpenses - annualMinABP - annualNetPassive,
            );
            fyMonthlyAdditionalDrawTarget = annualGrossShortfall / 12;
          }
        }
      }
    }

    // ── Step 15: Grow/revalue all assets (before surplus/deficit so drawdown is not overwritten)
    for (let i = 0; i < assets.length; i++) {
      const ar = assetResults.find(r => r.assetId === assets[i].id);
      if (ar) {
        assets[i] = growAsset(assets[i], ar);
      }
    }

    // ── Steps 12 & 13: Surplus or deficit allocation ────────────────────────
    // Deficit: monthly. Surplus: annual (June only).

    const surplusRules = allocationRules?.surplus_priority ?? DEFAULT_SURPLUS_RULES;
    const drawdownRules =
      (allocationRules?.drawdown_priority?.length ?? 0) > 0
        ? allocationRules!.drawdown_priority
        : scenario.projection_scope === 'super_only'
          ? SUPER_ONLY_DRAWDOWN_RULES
          : DEFAULT_DRAWDOWN_RULES;
    let additionalSuperDrawdownFromDeficit = 0;
    let drawdownCashThisMonth = 0;
    let drawdownSaleThisMonth = 0;

    // Monthly deficit processing: monthlyAmountToDraw = monthlyGrossShortfall (no lump sum netting)
    // Cash available from earned+passive is net of tax; deficit = expenses - (gross - tax) - scheduledNet
    const monthlyEarnedIncome = totalEmploymentIncome;
    const monthlyPassiveIncome = totalAssetIncome + totalCentrelinkPayments + totalSuperPension;
    // Two-pass: use pre-computed monthly target for super-only retired FYs (avoids over-draw from reactive logic)
    const useTwoPass =
      isSuperOnly &&
      isRetiredThisMonth &&
      fyMonthlyAdditionalDrawTarget != null &&
      fyMonthlyAdditionalDrawTarget >= 0;

    // Tax for shortfall: reactive+retired use estimated monthly tax (totalPayg is 0 for retirees in non-June)
    let taxForShortfall = totalPayg;
    if (!useTwoPass && isRetiredThisMonth) {
      const annualEmploymentIncome = totalEmploymentIncome * 12;
      const annualPassive = (totalAssetIncome + totalCentrelinkPayments) * 12;
      const annualTaxableIncome = annualEmploymentIncome + annualPassive;
      if (annualTaxableIncome > 0) {
        const primaryId = members[0]?.id;
        const primaryPs = primaryId ? personState.get(primaryId) : null;
        if (primaryPs) {
          const monthsElapsed = month - 6;
          const scale = monthsElapsed > 0 ? 12 / monthsElapsed : 1;
          const annualFranking = primaryPs.fyFrankingCredits * scale;
          const annualDeductions = primaryPs.fyDeductions * scale;
          const grossPerPerson = isCouple ? annualTaxableIncome / 2 : annualTaxableIncome;
          const frankingPerPerson = isCouple ? annualFranking / 2 : annualFranking;
          const deductionsPerPerson = isCouple ? annualDeductions / 2 : annualDeductions;
          const taxResult = calculateIndividualTax({
            grossIncome: grossPerPerson,
            deductions: deductionsPerPerson,
            frankingCredits: frankingPerPerson,
            isCouple,
            numDependents,
            age: primaryPs.age,
            receivesAgePension: annualPassive > 0,
            hasHecs: primaryPs.person.has_hecs_help_debt,
            hecsBalance: primaryPs.person.hecs_help_balance,
            reportableSuperContributions: 0,
            taxBrackets: rates.tax.brackets,
          });
          const annualTotalTax = isCouple ? 2 * taxResult.totalTax : taxResult.totalTax;
          taxForShortfall = annualTotalTax / 12;
        }
      }
    }

    const monthlyGrossShortfall = Math.max(
      0,
      totalExpenses - monthlyEarnedIncome - monthlyPassiveIncome - scheduledNet + taxForShortfall,
    );

    // Step 4: Accumulate actual income (outside deficit block) — runs first, includes this month
    if (useTwoPass) {
      fyActualMinABPDrawn += totalSuperPension;
      fyActualCentrelink += totalCentrelinkPayments;
      fyActualAssetIncome += totalAssetIncome;
      fyActualTax += totalPayg;
    }

    // Mid-year recalibration at Centrelink reassessment points (September, March)
    if (useTwoPass && isRetiredThisMonth && (month === 9 || month === 3) && fyAnnualExpenses > 0) {
      const primaryId = members[0]?.id;
      const primaryPs = primaryId ? personState.get(primaryId) : null;
      if (primaryPs) {
        const firstRetMonth = primaryRetirementMonth === 12 ? 1 : primaryRetirementMonth + 1;
        const monthsElapsed = isInTransitionFY
          ? (month <= 6 ? (12 - firstRetMonth + 1) + month : month - firstRetMonth + 1)
          : (month <= 6 ? month + 6 : month - 6);
        const monthsInPension = isInTransitionFY
          ? (firstRetMonth <= 6 ? 7 - firstRetMonth : (12 - firstRetMonth + 1) + 6)
          : 12;
        const monthsRemaining = monthsInPension - monthsElapsed;

        const totalTaxableActual = fyActualCentrelink + fyActualAssetIncome;
        const effectiveRateActual = totalTaxableActual > 0 ? fyActualTax / totalTaxableActual : 0;
        const netPassiveReceivedSoFar = totalTaxableActual * (1 - effectiveRateActual);

        const currentMonthlyPassive = totalCentrelinkPayments + totalAssetIncome;
        const grossPerPerson = isCouple ? (currentMonthlyPassive * 12) / 2 : currentMonthlyPassive * 12;
        const taxResult = calculateIndividualTax({
          grossIncome: grossPerPerson,
          deductions: 0,
          frankingCredits: 0,
          isCouple,
          numDependents,
          age: primaryPs.age,
          receivesAgePension: totalCentrelinkPayments > 0,
          hasHecs: primaryPs.person.has_hecs_help_debt ?? false,
          hecsBalance: primaryPs.person.hecs_help_balance ?? 0,
          reportableSuperContributions: 0,
          taxBrackets: rates.tax.brackets,
        });
        const annualTaxOnCurrentPassive = isCouple ? 2 * taxResult.totalTax : taxResult.totalTax;
        const effectiveRateCurrent =
          currentMonthlyPassive * 12 > 0 ? annualTaxOnCurrentPassive / (currentMonthlyPassive * 12) : 0;
        // Project passive for remaining months only; current month's passive is in netPassiveReceivedSoFar
        const netPassiveRemainingProjected =
          currentMonthlyPassive * (1 - effectiveRateCurrent) * monthsRemaining;

        const remainingMinABP =
          fyActualMinABPDrawn > 0 ? (fyActualMinABPDrawn / monthsElapsed) * monthsRemaining : 0;

        const incomeSecured =
          fyActualMinABPDrawn +
          fyActualAdditionalABPDrawn +
          netPassiveReceivedSoFar +
          remainingMinABP +
          netPassiveRemainingProjected;

        const remainingShortfall = Math.max(0, fyAnnualExpenses - incomeSecured);

        const monthsToDistribute = monthsRemaining + 1; // current month + remaining months
        fyMonthlyAdditionalDrawTarget =
          monthsToDistribute > 0 ? remainingShortfall / monthsToDistribute : 0;
      }
    }

    let monthlyAmountToDraw = useTwoPass
      ? fyMonthlyAdditionalDrawTarget!
      : monthlyGrossShortfall;

    // Step 5: June true-up — close FY to fyAnnualExpenses (min ABP + additional ABP + net passive)
    // Use remainingAllowable as the June draw, not min(target, remainingAllowable): when
    // remainingAllowable > target (EOFY tax, recalibration lag), min() under-funded the FY
    // (see debug H3_JuneFYEnd shortfallVsCap > 0 while super balance positive).
    if (useTwoPass && month === 6 && isRetiredThisMonth && fyAnnualExpenses > 0) {
      const totalTaxableActual = fyActualCentrelink + fyActualAssetIncome;
      const effectiveRateActual = totalTaxableActual > 0
        ? fyActualTax / totalTaxableActual
        : 0;
      const netPassiveActual = totalTaxableActual * (1 - effectiveRateActual);
      const incomeAccountedFor = fyActualMinABPDrawn + fyActualAdditionalABPDrawn + netPassiveActual;
      const remainingAllowable = Math.max(0, fyAnnualExpenses - incomeAccountedFor);
      monthlyAmountToDraw = remainingAllowable;
    }

    if (monthlyAmountToDraw > 0) {
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

      // Pass full target to processDeficit; it cascades cash → super, capping each source
      // by its own balance. Residual (if sources exhausted) is genuine shortfall.
      const amountToPass = monthlyAmountToDraw;

      const deficitResult = processDeficit(
        amountToPass,
        drawdownRules,
        assets,
        liabilities,
        { superAccessible: anySuperAccessible, superFunds: accessibleSuperFunds },
      );

      let monthlySecondaryCash = 0;
      let monthlySecondaryFixedInterest = 0;
      let monthlySecondaryShares = 0;
      let monthlySecondaryProperty = 0;
      for (const action of deficitResult.actions) {
        if (action.action === 'draw_cash') {
          drawdownCashThisMonth += action.amount;
          monthlySecondaryCash += action.amount;
        } else if (action.action === 'draw_fixed_interest') {
          drawdownCashThisMonth += action.amount;
          monthlySecondaryFixedInterest += action.amount;
        } else if (action.action === 'draw_shares') {
          drawdownSaleThisMonth += action.amount;
          monthlySecondaryShares += action.amount;
        } else if (action.action === 'dispose_property') {
          drawdownSaleThisMonth += action.amount;
          monthlySecondaryProperty += action.amount;
        }
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
      additionalSuperDrawdownFromDeficit = deficitResult.super_drawdowns.reduce(
        (s, sd) => s + sd.amount,
        0,
      );

      // Step 6: Accumulate additional ABP drawn (inside deficit block, after processDeficit)
      if (useTwoPass) {
        fyActualAdditionalABPDrawn += additionalSuperDrawdownFromDeficit;
      }

      // CGT from deficit disposals
      for (const cgtEvent of deficitResult.cgt_events) {
        const ownerAsset = assets.find(a => a.id === cgtEvent.asset_id);
        if (ownerAsset?.owner_id) {
          const ps = personState.get(ownerAsset.owner_id);
          if (ps) {
            ps.fyCapitalGains += cgtEvent.net_gain;
          }
        }
      }

      if (deficitResult.actions.length === 0 && monthlyAmountToDraw > 0.01) {
        warnings.push(
          `${year}-${String(month).padStart(2, '0')}: Cannot fund deficit of $${monthlyAmountToDraw.toFixed(0)} — insufficient liquid assets`,
        );
      }

      // Accumulate FY metadata (secondary sources)
      fySecondaryCash += monthlySecondaryCash;
      fySecondaryFixedInterest += monthlySecondaryFixedInterest;
      fySecondarySuper += additionalSuperDrawdownFromDeficit;
      fySecondaryShares += monthlySecondaryShares;
      fySecondaryProperty += monthlySecondaryProperty;
    }
    fyGrossShortfall += monthlyGrossShortfall;
    fyLumpSum += totalLumpSumThisMonth;

    // Surplus allocation: annual only (June)
    if (month === 6) {
      const totalFYEmploymentIncome = Array.from(personState.values()).reduce((s, ps) => s + ps.fyEmploymentIncome, 0);
      const surplusIncome = scenario.projection_scope === 'super_only'
        ? fyTotalUnavoidable - totalFYEmploymentIncome
        : fyTotalUnavoidable;
      const fySurplus = Math.max(
        0,
        surplusIncome + fyScheduledNet - fyTotalNeeded,
      );

      if (fySurplus > 0) {
        // Only allocate surplus in the first retirement-year FY (chart "year 1") — never accumulation or later years.
        const primaryMemberForSurplus = scenario.household.members[0];
        const retirementAgeForSurplus = primaryMemberForSurplus?.intended_retirement_age ?? 67;
        const primaryRetirementYearForSurplus = primaryMemberForSurplus
          ? getBirthYearFromDate(primaryMemberForSurplus.date_of_birth) + retirementAgeForSurplus
          : 0;
        const primaryRetirementMonthForSurplus = primaryMemberForSurplus
          ? (primaryMemberForSurplus.intended_retirement_month ?? getBirthMonthFromDate(primaryMemberForSurplus.date_of_birth))
          : 12;
        const firstRetMonth = primaryRetirementMonthForSurplus === 12 ? 1 : primaryRetirementMonthForSurplus + 1;
        const firstRetYear = primaryRetirementMonthForSurplus === 12 ? primaryRetirementYearForSurplus + 1 : primaryRetirementYearForSurplus;
        const firstRetirementFY = getFinancialYear(firstRetYear, firstRetMonth);
        const isFirstRetirementFY = primaryRetirementYearForSurplus > 0 && fy === firstRetirementFY;
        const skipSurplusAllocation = totalExpenses === 0 || !isFirstRetirementFY;

        if (!skipSurplusAllocation) {
          const actions = allocateSurplus(
            fySurplus,
            surplusRules,
            assets,
            liabilities,
            totalExpenses,
          );
          for (const action of actions) {
            applyAllocationAction(action, assets, liabilities, superFunds);
          }
        }
      }
    }

    if (month === 6) {
      for (const ps of personState.values()) {
        const nextFund = superFunds.find(f => f.person_id === ps.person.id);
        ps.fyStartSuperBalance = nextFund?.balance ?? 0;
      }
    }

    // ── Step 14: Scheduled disposal events and CGT ────────────────────
    // (Handled above for deficit drawdown; scheduled disposals handled via scheduled_cash_flows)

    // Update liabilities
    for (let i = 0; i < liabilities.length; i++) {
      const lr = liabilityResults.find(r => r.liabilityId === liabilities[i].id);
      if (lr) {
        liabilities[i] = updateLiability(liabilities[i], lr);
      }
    }

    // Remove transient lump-sum cash asset (super_only) so it is not persisted
    const transientIdx = assets.findIndex(a => a.id === LUMP_SUM_TRANSIENT_ID);
    if (transientIdx >= 0) {
      assets.splice(transientIdx, 1);
    }

    // ── Record MonthSnapshot ──────────────────────────────────────────

    const totalAssets = assets.reduce((s, a) => s + a.current_value, 0);
    const totalSuper = superFunds.reduce((s, f) => s + f.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.current_balance, 0);
    const lumpSumThisMonth = personDetails.reduce((s, p) => s + (p.super_lump_sum_withdrawal ?? 0), 0);

    const snapshot: MonthSnapshot = {
      year,
      month,
      persons: personDetails,

      total_gross_income: totalGrossIncome + additionalSuperDrawdownFromDeficit,
      total_employment_income: totalEmploymentIncome,
      total_asset_income: totalAssetIncome,
      total_centrelink_payments: totalCentrelinkPayments,
      total_super_pension_income: totalSuperPension + additionalSuperDrawdownFromDeficit,
      total_expenses: totalExpenses,
      total_loan_repayments: totalLoanRepayments,
      total_tax: totalPayg,
      scheduled_cashflows_net: scheduledNet,
      lump_sum_withdrawals_this_month: lumpSumThisMonth,
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

      drawdown_cash_this_month: drawdownCashThisMonth,
      drawdown_sale_this_month: drawdownSaleThisMonth,
      drawdown_super_additional_this_month: additionalSuperDrawdownFromDeficit,
    };

    snapshots.push(snapshot);

    // Advance to next month
    ({ year, month } = nextMonth(year, month));
  }

  // Push final FY metadata (loop ended before next July)
  const lastSnapForFy = snapshots[snapshots.length - 1];
  if (lastSnapForFy && (fyGrossShortfall > 0 || fySecondaryCash > 0 || fySecondarySuper > 0 || fyLumpSum > 0)) {
    const lastFy = getFinancialYear(lastSnapForFy.year, lastSnapForFy.month);
    fyMetadataByYear.push({
      fy: lastFy,
      fyGrossShortfall,
      fySecondaryCash,
      fySecondaryFixedInterest,
      fySecondarySuper,
      fySecondaryShares,
      fySecondaryProperty,
      fyLumpSum,
    });
  }

  // Determine end year from last snapshot
  const lastSnap = snapshots[snapshots.length - 1];

  const primaryMember = scenario.household.members[0];
  const retirementAge =
    primaryMember?.intended_retirement_age ?? 67;

  const retirementExpense = scenario.expenses.find(
    (e) => e.name === 'Retirement expenses',
  );
  const retirementSpendingTarget =
    retirementExpense?.annual_amount ?? 0;

  return {
    scenario_name: scenario.name,
    start_year: startYear,
    end_year: lastSnap?.year ?? startYear,
    snapshots,
    warnings,
    metadata: {
      total_months: snapshots.length,
      monthly_resolution: true,
      retirement_age: retirementAge,
      retirement_spending_target: retirementSpendingTarget,
      projection_scope: scenario.projection_scope,
      fy_metadata_by_year: fyMetadataByYear,
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
  const youngestBirthYear = Math.max(...members.map(m => getBirthYearFromDate(m.date_of_birth)));
  const targetAge = 90;
  const endYear = youngestBirthYear + targetAge;

  // If projection_years is set and produces an earlier end, use that
  const projEndYear = scenario.start_year + scenario.projection_years;
  const finalYear = Math.min(endYear, projEndYear);

  return { year: finalYear, month: 6 }; // End at June (EOFY)
}

function calculateAge(dateOfBirth: string, currentYear: number, currentMonth: number): number {
  const [y, m] = dateOfBirth.split('-').map(Number);
  if (currentMonth >= m) return currentYear - y;
  return currentYear - y - 1;
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

/** Apply a surplus allocation action by mutating the assets/liabilities/superFunds arrays. */
function applyAllocationAction(
  action: { action: string; target_id: string; amount: number },
  assets: Asset[],
  liabilities: Liability[],
  superFunds: SuperFund[],
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
    case 'super_contribution': {
      const idx = superFunds.findIndex(f => f.person_id === action.target_id);
      const targetIdx = idx >= 0 ? idx : 0;
      if (targetIdx < superFunds.length) {
        superFunds[targetIdx] = {
          ...superFunds[targetIdx],
          balance: superFunds[targetIdx].balance + action.amount,
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
