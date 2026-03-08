/**
 * Engine Integration Tests
 *
 * End-to-end tests that run the full monthly projection loop.
 * Validates orchestration of sub-modules, lifecycle events, and
 * cross-month consistency invariants.
 */

import { describe, it, expect } from 'vitest';
import { project } from '../engine';
import type {
  Scenario,
  Person,
  Household,
  IncomeStream,
  Expense,
  Asset,
  SuperFund,
  Liability,
  Assumptions,
  MonthSnapshot,
} from '../models';

// ── Factory Helpers ──────────────────────────────────────────────────────────

function makePerson(overrides: Partial<Person> & { id: string; date_of_birth_year: number }): Person {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    date_of_birth_year: overrides.date_of_birth_year,
    gender: overrides.gender ?? 'other',
    is_australian_resident: overrides.is_australian_resident ?? true,
    employment_status: overrides.employment_status ?? 'employed',
    intended_retirement_age: overrides.intended_retirement_age ?? 67,
    has_hecs_help_debt: overrides.has_hecs_help_debt ?? false,
    hecs_help_balance: overrides.hecs_help_balance ?? 0,
    is_homeowner: overrides.is_homeowner ?? false,
  };
}

function makeIncome(overrides: Partial<IncomeStream> & { person_id: string; gross_annual: number }): IncomeStream {
  return {
    person_id: overrides.person_id,
    income_type: overrides.income_type ?? 'employment',
    gross_annual: overrides.gross_annual,
    includes_super: overrides.includes_super ?? false,
    growth_rate: overrides.growth_rate ?? 0.035,
    start_year: overrides.start_year ?? null,
    end_year: overrides.end_year ?? null,
    salary_sacrifice_amount: overrides.salary_sacrifice_amount ?? 0,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    name: overrides.name ?? 'Living expenses',
    category: overrides.category ?? 'essential',
    annual_amount: overrides.annual_amount ?? 0,
    inflation_adjusted: overrides.inflation_adjusted ?? true,
    start_year: overrides.start_year ?? null,
    end_year: overrides.end_year ?? null,
  };
}

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    asset_class: overrides.asset_class ?? 'cash',
    current_value: overrides.current_value ?? 0,
    cost_base: overrides.cost_base ?? 0,
    ownership_type: overrides.ownership_type ?? 'individual',
    owner_id: overrides.owner_id ?? null,
    ownership_split: overrides.ownership_split ?? {},
    growth_rate: overrides.growth_rate ?? 0,
    income_yield: overrides.income_yield ?? 0,
    franking_rate: overrides.franking_rate ?? 0,
    expense_ratio: overrides.expense_ratio ?? 0,
    is_centrelink_assessable: overrides.is_centrelink_assessable ?? true,
    is_deemed: overrides.is_deemed ?? true,
    is_primary_residence: overrides.is_primary_residence ?? false,
    funded_by_liability_id: overrides.funded_by_liability_id ?? null,
    is_lifestyle_asset: overrides.is_lifestyle_asset ?? false,
    depreciation_rate: overrides.depreciation_rate ?? 0,
  };
}

function makeSuperFund(overrides: Partial<SuperFund> & { person_id: string }): SuperFund {
  return {
    person_id: overrides.person_id,
    balance: overrides.balance ?? 0,
    phase: overrides.phase ?? 'accumulation',
    investment_return: overrides.investment_return ?? 0.07,
    retirement_investment_return: overrides.retirement_investment_return ?? 0.05,
    admin_fee_flat: overrides.admin_fee_flat ?? 0,
    admin_fee_percent: overrides.admin_fee_percent ?? 0,
    insurance_premium: overrides.insurance_premium ?? 0,
    employer_sg_included: overrides.employer_sg_included ?? true,
    voluntary_concessional: overrides.voluntary_concessional ?? 0,
    voluntary_non_concessional: overrides.voluntary_non_concessional ?? 0,
    spouse_contribution: overrides.spouse_contribution ?? 0,
    pension_drawdown_rate: overrides.pension_drawdown_rate ?? null,
  };
}

function makeLiability(overrides: Partial<Liability> & { id: string }): Liability {
  return {
    id: overrides.id,
    name: overrides.name ?? '',
    liability_type: overrides.liability_type ?? 'home_loan',
    current_balance: overrides.current_balance ?? 0,
    interest_rate: overrides.interest_rate ?? 0.06,
    repayment_type: overrides.repayment_type ?? 'principal_and_interest',
    annual_repayment: overrides.annual_repayment ?? null,
    remaining_term_years: overrides.remaining_term_years ?? 25,
    owner_id: overrides.owner_id ?? null,
    linked_asset_id: overrides.linked_asset_id ?? null,
    is_tax_deductible: overrides.is_tax_deductible ?? false,
    deductible_person_id: overrides.deductible_person_id ?? null,
    interest_only_remaining_years: overrides.interest_only_remaining_years ?? 0,
    secured_by_asset_id: overrides.secured_by_asset_id ?? null,
    offset_account_balance: overrides.offset_account_balance ?? 0,
  };
}

function makeAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    inflation_rate: overrides.inflation_rate ?? 0.03,
    wage_growth_rate: overrides.wage_growth_rate ?? 0.035,
    tax_bracket_indexation: overrides.tax_bracket_indexation ?? 0,
    centrelink_indexation: overrides.centrelink_indexation ?? 0.025,
    sg_rate: overrides.sg_rate ?? 0.12,
    sg_rate_schedule: overrides.sg_rate_schedule ?? {},
    concessional_cap: overrides.concessional_cap ?? 30_000,
    non_concessional_cap: overrides.non_concessional_cap ?? 120_000,
    super_preservation_age: overrides.super_preservation_age ?? 60,
    deeming_rate_lower: overrides.deeming_rate_lower ?? 0.0025,
    deeming_rate_upper: overrides.deeming_rate_upper ?? 0.0225,
    deeming_threshold_single: overrides.deeming_threshold_single ?? 60_400,
    deeming_threshold_couple: overrides.deeming_threshold_couple ?? 100_200,
    default_returns: overrides.default_returns ?? {
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

function buildScenario(overrides: Partial<Scenario> & { household: Household }): Scenario {
  return {
    name: overrides.name ?? 'Test Scenario',
    start_year: overrides.start_year ?? 2025,
    projection_years: overrides.projection_years ?? 30,
    household: overrides.household,
    income_streams: overrides.income_streams ?? [],
    expenses: overrides.expenses ?? [],
    assets: overrides.assets ?? [],
    super_funds: overrides.super_funds ?? [],
    liabilities: overrides.liabilities ?? [],
    scheduled_cash_flows: overrides.scheduled_cash_flows ?? [],
    assumptions: overrides.assumptions ?? makeAssumptions(),
    allocation_rules: overrides.allocation_rules,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Projection Engine', () => {
  describe('12-month short run', () => {
    it('should produce exactly 12 MonthSnapshots for a 1-year projection', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 1,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000 })],
        super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000 })],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 10_000, owner_id: 'p1' })],
      });

      const result = project(scenario);

      expect(result.snapshots).toHaveLength(12);
      expect(result.snapshots[0].month).toBe(7);
      expect(result.snapshots[0].year).toBe(2025);
      expect(result.snapshots[11].month).toBe(6);
      expect(result.snapshots[11].year).toBe(2026);
    });
  });

  describe('Single person, 30-year-old, $80k income, $50k super', () => {
    const person = makePerson({ id: 'p1', date_of_birth_year: 1995, intended_retirement_age: 67 });
    const scenario = buildScenario({
      start_year: 2025,
      projection_years: 60,
      household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
      income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000, growth_rate: 0.035 })],
      expenses: [makeExpense({ annual_amount: 40_000 })],
      super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000, investment_return: 0.07 })],
      assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 20_000, owner_id: 'p1' })],
    });

    const result = project(scenario);

    it('should produce snapshots spanning from start to projection end', () => {
      expect(result.snapshots.length).toBeGreaterThan(12);
      expect(result.start_year).toBe(2025);
    });

    it('should grow super balance during accumulation years', () => {
      // At start, super is $50k. After a few years of SG contributions + earnings it should grow.
      const snapshotYear5 = result.snapshots.find(s => s.year === 2030 && s.month === 6);
      if (snapshotYear5) {
        const superBalance = snapshotYear5.persons.find(p => p.person_id === 'p1')?.super_balance ?? 0;
        expect(superBalance).toBeGreaterThan(50_000);
      }
    });

    it('should transition to pension phase after retirement age (67)', () => {
      // Person born 1995, retires at 67 → retirement in 2062
      const postRetirement = result.snapshots.filter(s => s.year >= 2063);

      if (postRetirement.length > 0) {
        // After retirement, employment income should be zero
        for (const snap of postRetirement.slice(0, 12)) {
          expect(snap.total_employment_income).toBe(0);
        }
      }
    });

    it('should have positive super pension drawdown after retirement', () => {
      const postRetirement = result.snapshots.filter(s => s.year >= 2063);

      if (postRetirement.length > 0) {
        // At least some months should show pension drawdown
        const anyDrawdown = postRetirement.some(s => s.total_super_pension_income > 0);
        expect(anyDrawdown).toBe(true);
      }
    });
  });

  describe('Couple scenario — staggered retirement', () => {
    const person1 = makePerson({ id: 'p1', date_of_birth_year: 1965, intended_retirement_age: 60 });
    const person2 = makePerson({ id: 'p2', date_of_birth_year: 1965, intended_retirement_age: 67 });

    const scenario = buildScenario({
      start_year: 2025,
      projection_years: 30,
      household: {
        members: [person1, person2],
        relationship_status: 'partnered',
        num_dependents: 0,
        dependents_ages: [],
      },
      income_streams: [
        makeIncome({ person_id: 'p1', gross_annual: 100_000, growth_rate: 0.03 }),
        makeIncome({ person_id: 'p2', gross_annual: 90_000, growth_rate: 0.03 }),
      ],
      expenses: [makeExpense({ annual_amount: 60_000 })],
      super_funds: [
        makeSuperFund({ person_id: 'p1', balance: 300_000 }),
        makeSuperFund({ person_id: 'p2', balance: 200_000 }),
      ],
      assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 50_000, owner_id: 'p1' })],
    });

    const result = project(scenario);

    it('should continue employment income for working partner after other retires', () => {
      // Person 1 retires at 60 (born 1965 → retires 2025). Person 2 retires at 67 (→ 2032).
      // Between 2025-2032, person 2 should still have employment income.
      const midSnapshots = result.snapshots.filter(s => s.year === 2028);

      for (const snap of midSnapshots) {
        const p2Detail = snap.persons.find(p => p.person_id === 'p2');
        expect(p2Detail?.employment_income).toBeGreaterThan(0);
      }
    });

    it('should stop employment income for person 1 after age 60', () => {
      // Person 1 born 1965, retires at 60 → retirement in 2025
      const laterSnapshots = result.snapshots.filter(s => s.year === 2027);

      for (const snap of laterSnapshots) {
        const p1Detail = snap.persons.find(p => p.person_id === 'p1');
        expect(p1Detail?.employment_income).toBe(0);
      }
    });

    it('should stop all employment income after both retire', () => {
      // Person 2 retires at 67 (2032). After 2033 both should be retired.
      const lateSnapshots = result.snapshots.filter(s => s.year === 2034);

      for (const snap of lateSnapshots) {
        expect(snap.total_employment_income).toBe(0);
      }
    });
  });

  describe('Net worth invariant', () => {
    it('should equal total assets + total super - total liabilities at every snapshot', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 5,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000 })],
        expenses: [makeExpense({ annual_amount: 40_000 })],
        super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000 })],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 20_000, owner_id: 'p1' })],
        liabilities: [makeLiability({
          id: 'loan1',
          current_balance: 30_000,
          interest_rate: 0.05,
          remaining_term_years: 10,
          liability_type: 'personal_loan',
        })],
      });

      const result = project(scenario);

      for (const snap of result.snapshots) {
        const expectedNetWorth = snap.total_assets + snap.total_super - snap.total_liabilities;
        expect(snap.net_worth).toBeCloseTo(expectedNetWorth, 2);
      }
    });
  });

  describe('Homeowner with mortgage', () => {
    it('should reduce principal each month for a P&I mortgage', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990, is_homeowner: true });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 2,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 120_000 })],
        expenses: [makeExpense({ annual_amount: 40_000 })],
        super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000 })],
        assets: [
          makeAsset({
            id: 'home',
            asset_class: 'property_home',
            current_value: 800_000,
            cost_base: 800_000,
            is_primary_residence: true,
            owner_id: 'p1',
            growth_rate: 0.04,
          }),
          makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 30_000, owner_id: 'p1' }),
        ],
        liabilities: [makeLiability({
          id: 'mortgage',
          liability_type: 'home_loan',
          current_balance: 500_000,
          interest_rate: 0.06,
          repayment_type: 'principal_and_interest',
          remaining_term_years: 25,
          secured_by_asset_id: 'home',
          owner_id: 'p1',
        })],
      });

      const result = project(scenario);

      // Get mortgage balance at each month — it should strictly decrease
      const balances = result.snapshots.map(s => s.liability_balances['mortgage']);

      for (let i = 1; i < balances.length; i++) {
        if (balances[i] !== undefined && balances[i - 1] !== undefined) {
          expect(balances[i]).toBeLessThan(balances[i - 1]);
        }
      }

      // After 24 months, principal should be noticeably reduced from $500k
      const finalBalance = balances[balances.length - 1];
      expect(finalBalance).toBeLessThan(500_000);
      expect(finalBalance).toBeGreaterThan(400_000); // shouldn't pay off that fast
    });
  });

  describe('Snapshot consistency', () => {
    it('should have sequential year/month pairs in snapshots', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 3,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000 })],
        super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000 })],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 10_000, owner_id: 'p1' })],
      });

      const result = project(scenario);

      for (let i = 1; i < result.snapshots.length; i++) {
        const prev = result.snapshots[i - 1];
        const curr = result.snapshots[i];

        // Each snapshot should be exactly one month after the previous
        const prevTotal = prev.year * 12 + prev.month;
        const currTotal = curr.year * 12 + curr.month;
        expect(currTotal).toBe(prevTotal + 1);
      }
    });

    it('should include person details for each household member in every snapshot', () => {
      const p1 = makePerson({ id: 'p1', date_of_birth_year: 1985 });
      const p2 = makePerson({ id: 'p2', date_of_birth_year: 1987 });

      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 1,
        household: {
          members: [p1, p2],
          relationship_status: 'partnered',
          num_dependents: 0,
          dependents_ages: [],
        },
        income_streams: [
          makeIncome({ person_id: 'p1', gross_annual: 80_000 }),
          makeIncome({ person_id: 'p2', gross_annual: 70_000 }),
        ],
        super_funds: [
          makeSuperFund({ person_id: 'p1', balance: 50_000 }),
          makeSuperFund({ person_id: 'p2', balance: 40_000 }),
        ],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 10_000, owner_id: 'p1' })],
      });

      const result = project(scenario);

      for (const snap of result.snapshots) {
        expect(snap.persons).toHaveLength(2);
        expect(snap.persons.map(p => p.person_id).sort()).toEqual(['p1', 'p2']);
      }
    });
  });

  describe('Metadata', () => {
    it('should include monthly_resolution flag in metadata', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 1,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
      });

      const result = project(scenario);

      expect(result.metadata.monthly_resolution).toBe(true);
      expect(result.metadata.total_months).toBe(result.snapshots.length);
    });
  });

  describe('Employment income should be non-negative', () => {
    it('should never produce negative employment income', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1995 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 5,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000 })],
        super_funds: [makeSuperFund({ person_id: 'p1', balance: 50_000 })],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 10_000, owner_id: 'p1' })],
      });

      const result = project(scenario);

      for (const snap of result.snapshots) {
        expect(snap.total_employment_income).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Super grows during accumulation', () => {
    it('should show increasing super balance with SG contributions and earnings', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1995 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 2,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
        income_streams: [makeIncome({ person_id: 'p1', gross_annual: 80_000, growth_rate: 0 })],
        super_funds: [makeSuperFund({
          person_id: 'p1',
          balance: 50_000,
          investment_return: 0.07,
          admin_fee_flat: 0,
          admin_fee_percent: 0,
        })],
        assets: [makeAsset({ id: 'cash1', asset_class: 'cash', current_value: 10_000, owner_id: 'p1' })],
      });

      const result = project(scenario);

      // Get super balance from last snapshot
      const lastSnap = result.snapshots[result.snapshots.length - 1];
      const superBalance = lastSnap.persons.find(p => p.person_id === 'p1')?.super_balance ?? 0;

      // After 2 years of 12% SG on $80k + 7% returns on ~$50k+, balance should be well above $50k
      expect(superBalance).toBeGreaterThan(50_000);
    });
  });

  describe('Zero income, zero expense scenario', () => {
    it('should run without errors and produce snapshots', () => {
      const person = makePerson({ id: 'p1', date_of_birth_year: 1990 });
      const scenario = buildScenario({
        start_year: 2025,
        projection_years: 1,
        household: { members: [person], relationship_status: 'single', num_dependents: 0, dependents_ages: [] },
      });

      const result = project(scenario);

      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
    });
  });
});
