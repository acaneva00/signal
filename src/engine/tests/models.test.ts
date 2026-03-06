import { describe, it, expect } from 'vitest';
import { schemas, ScenarioSchema } from '@/engine/models';

describe('models schemas', () => {
  it('should export all schemas', () => {
    expect(schemas).toBeDefined();
    expect(schemas.Person).toBeDefined();
    expect(schemas.Household).toBeDefined();
    expect(schemas.IncomeStream).toBeDefined();
    expect(schemas.Expense).toBeDefined();
    expect(schemas.Asset).toBeDefined();
    expect(schemas.SuperFund).toBeDefined();
    expect(schemas.Liability).toBeDefined();
    expect(schemas.ScheduledCashFlow).toBeDefined();
    expect(schemas.Assumptions).toBeDefined();
    expect(schemas.SurplusRule).toBeDefined();
    expect(schemas.DrawdownRule).toBeDefined();
    expect(schemas.AllocationRules).toBeDefined();
    expect(schemas.Scenario).toBeDefined();
    expect(schemas.PersonMonthDetail).toBeDefined();
    expect(schemas.MonthSnapshot).toBeDefined();
    expect(schemas.ProjectionResult).toBeDefined();
  });

  it('should parse a minimal Scenario object successfully', () => {
    const minimalScenario = {
      household: {
        members: [
          {
            id: 'person_1',
            date_of_birth_year: 1980,
          },
        ],
      },
    };

    const result = ScenarioSchema.safeParse(minimalScenario);
    
    expect(result.success).toBe(true);
    
    if (result.success) {
      // Verify defaults are applied
      expect(result.data.name).toBe('Unnamed Scenario');
      expect(result.data.start_year).toBe(2025);
      expect(result.data.projection_years).toBe(30);
      expect(result.data.household.members).toHaveLength(1);
      expect(result.data.household.members[0].id).toBe('person_1');
      expect(result.data.household.members[0].date_of_birth_year).toBe(1980);
      expect(result.data.household.members[0].name).toBe('');
      expect(result.data.household.members[0].gender).toBe('other');
      expect(result.data.household.relationship_status).toBe('single');
      expect(result.data.income_streams).toEqual([]);
      expect(result.data.expenses).toEqual([]);
      expect(result.data.assets).toEqual([]);
      expect(result.data.super_funds).toEqual([]);
      expect(result.data.liabilities).toEqual([]);
      expect(result.data.scheduled_cash_flows).toEqual([]);
    }
  });

  it('should fail validation for invalid Scenario', () => {
    const invalidScenario = {
      // Missing required household field
    };

    const result = ScenarioSchema.safeParse(invalidScenario);
    
    expect(result.success).toBe(false);
  });

  it('should validate a complete Scenario with all fields', () => {
    const completeScenario = {
      name: 'Test Scenario',
      start_year: 2026,
      projection_years: 40,
      household: {
        members: [
          {
            id: 'person_1',
            name: 'John Doe',
            date_of_birth_year: 1985,
            gender: 'male',
            is_australian_resident: true,
            employment_status: 'employed',
            intended_retirement_age: 65,
            has_hecs_help_debt: false,
            hecs_help_balance: 0,
            is_homeowner: true,
          },
        ],
        relationship_status: 'single',
        num_dependents: 0,
        dependents_ages: [],
      },
      income_streams: [],
      expenses: [],
      assets: [],
      super_funds: [],
      liabilities: [],
      scheduled_cash_flows: [],
    };

    const result = ScenarioSchema.safeParse(completeScenario);
    
    expect(result.success).toBe(true);
    
    if (result.success) {
      expect(result.data.name).toBe('Test Scenario');
      expect(result.data.start_year).toBe(2026);
      expect(result.data.projection_years).toBe(40);
      expect(result.data.household.members[0].name).toBe('John Doe');
    }
  });
});
