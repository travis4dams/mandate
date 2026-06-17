// SPEC-STAFF-3: staffing economy — hire from operating_budget, fireStaff
import { describe, it, expect, beforeEach } from "vitest";
import {
  hireStaff,
  fireStaff,
  loadDivisionCatalog,
  staffedFlagKey,
  generateCandidates,
  InsufficientBudgetError,
  DivisionAlreadyStaffedError,
  _resetDivisionCatalogCache,
  _resetInstitutionParamsCache,
  type Division,
  type Candidate,
  type InstitutionParams,
} from "../src/engine/institution";
import { makeState } from "../src/engine/state";
import { loadNamePools } from "../src/engine/names";
import { _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PARAMS: InstitutionParams & { candidate_slate_size: number } = {
  initial_operating_budget: 1000,
  budget_monthly_growth: 0.01,
  initial_political_capital: 100,
  political_capital_baseline: 80,
  political_capital_recovery: 0.1,
  candidate_slate_size: 3,
  candidate_refresh_months: 12,
};

const DIVISION: Division = {
  id: "research",
  name: "division.research.name",
  desc: "division.research.desc",
  hire_cost: 10,
  investment: 0.2,
  channel: "fog",
  skill_weights: { forecasting: 0.5, markets: 0.2, supervision: 0.05, communication: 0.15, crisis: 0.1 },
};

const CANDIDATE: Candidate = {
  name: "Test Director",
  competence: 0.8,
  lean: "centrist",
  skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 },
  disposition: 0.1,
};

beforeEach(() => {
  _resetInstitutionParamsCache();
  _resetDivisionCatalogCache();
  _resetValidateFileCache();
  _resetRegistries();
});

// ---------------------------------------------------------------------------
// SPEC-STAFF-3: hireStaff deducts from operating_budget, not political_capital
// ---------------------------------------------------------------------------

describe("hireStaff budget economy (SPEC-STAFF-3)", () => {
  it("deducts hire_cost from operating_budget", () => {
    // SPEC-STAFF-3
    const state = makeState({ vars: { operating_budget: 100 } });
    const result = hireStaff(state, DIVISION, CANDIDATE);
    expect(result.vars.operating_budget).toBeCloseTo(90); // 100 - 10
  });

  it("does not touch political_capital", () => {
    // SPEC-STAFF-3: political_capital must be unchanged by hiring
    const state = makeState({ vars: { operating_budget: 100, political_capital: 50 } });
    const result = hireStaff(state, DIVISION, CANDIDATE);
    expect(result.vars.political_capital).toBe(50);
  });

  it("allows hire when operating_budget exactly equals hire_cost", () => {
    // SPEC-STAFF-3: boundary — budget = cost → balance = 0, not negative
    const state = makeState({ vars: { operating_budget: 10 } }); // hire_cost=10
    const result = hireStaff(state, DIVISION, CANDIDATE);
    expect(result.vars.operating_budget).toBeCloseTo(0);
    expect(result.flags[staffedFlagKey("research")]).toBe(true);
  });

  it("throws InsufficientBudgetError when budget is below hire_cost", () => {
    // SPEC-STAFF-3
    const state = makeState({ vars: { operating_budget: 5 } }); // hire_cost=10
    expect(() => hireStaff(state, DIVISION, CANDIDATE)).toThrow(InsufficientBudgetError);
  });

  it("InsufficientBudgetError message contains have and need amounts", () => {
    // SPEC-STAFF-3: error message must be descriptive
    const state = makeState({ vars: { operating_budget: 3 } });
    try {
      hireStaff(state, DIVISION, CANDIDATE);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientBudgetError);
      expect((e as Error).message).toMatch(/10/); // need
      expect((e as Error).message).toMatch(/3/);  // have
    }
  });

  it("defaults operating_budget to params.initial_operating_budget when absent", () => {
    // SPEC-STAFF-3: bare state + params supplied → uses initial_operating_budget
    const state = makeState({ vars: {} });
    const result = hireStaff(state, DIVISION, CANDIDATE, PARAMS);
    expect(result.vars.operating_budget).toBeCloseTo(PARAMS.initial_operating_budget - DIVISION.hire_cost);
  });

  it("defaults operating_budget to 0 when absent and no params provided", () => {
    // SPEC-STAFF-3: bare state, no params → budget = 0 < hire_cost → InsufficientBudgetError
    const state = makeState({ vars: {} });
    expect(() => hireStaff(state, DIVISION, CANDIDATE)).toThrow(InsufficientBudgetError);
  });

  it("still throws DivisionAlreadyStaffedError when already staffed", () => {
    // SPEC-STAFF-3: DivisionAlreadyStaffedError is preserved
    const state = makeState({
      vars: { operating_budget: 100 },
      flags: { [staffedFlagKey("research")]: true },
    });
    expect(() => hireStaff(state, DIVISION, CANDIDATE)).toThrow(DivisionAlreadyStaffedError);
  });

  it("is a pure function — input state is not mutated", () => {
    // SPEC-STAFF-3
    const state = makeState({ vars: { operating_budget: 100, political_capital: 50 } });
    const varsBefore = { ...state.vars };
    const flagsBefore = { ...state.flags };
    hireStaff(state, DIVISION, CANDIDATE);
    expect(state.vars).toEqual(varsBefore);
    expect(state.flags).toEqual(flagsBefore);
  });

  it("starting budget of 1000 covers a hire_cost-10 division", () => {
    // SPEC-STAFF-3: the initial_operating_budget (1000) affords all typical divisions
    const state = makeState({ vars: { operating_budget: PARAMS.initial_operating_budget } });
    expect(() => hireStaff(state, DIVISION, CANDIDATE)).not.toThrow();
  });

  it("starting budget affords the entire real division catalog", () => {
    // SPEC-STAFF-3: core contract — at game start the Chair can staff every division immediately
    const catalog = loadDivisionCatalog();
    const pools = loadNamePools();
    let state = makeState({ vars: { operating_budget: PARAMS.initial_operating_budget } });
    for (const division of catalog) {
      const [candidate] = generateCandidates(division.id, 42, pools, PARAMS);
      if (!candidate) throw new Error(`no candidate for ${division.id}`);
      state = hireStaff(state, division, candidate, PARAMS);
    }
    // All divisions staffed and budget still non-negative
    for (const division of catalog) {
      expect(state.flags[staffedFlagKey(division.id)]).toBe(true);
    }
    expect((state.vars.operating_budget ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// SPEC-STAFF-3: fireStaff
// ---------------------------------------------------------------------------

describe("fireStaff (SPEC-STAFF-3)", () => {
  it("clears the staffed flag after firing", () => {
    // SPEC-STAFF-3
    let state = makeState({ vars: { operating_budget: 100 } });
    state = hireStaff(state, DIVISION, CANDIDATE);
    expect(state.flags[staffedFlagKey("research")]).toBe(true);
    const fired = fireStaff(state, DIVISION);
    expect(fired.flags[staffedFlagKey("research")]).toBe(false);
  });

  it("removes all staff.<id>.* vars after firing", () => {
    // SPEC-STAFF-3: staff vars must be cleared so the division reads as unstaffed
    let state = makeState({ vars: { operating_budget: 100 } });
    state = hireStaff(state, DIVISION, CANDIDATE);
    expect(state.vars["staff.research.competence"]).toBeDefined();
    const fired = fireStaff(state, DIVISION);
    expect(fired.vars["staff.research.competence"]).toBeUndefined();
    expect(fired.vars["staff.research.eff"]).toBeUndefined();
    expect(fired.vars["staff.research.lean"]).toBeUndefined();
    expect(fired.vars["staff.research.disposition"]).toBeUndefined();
  });

  it("preserves other vars and flags unchanged after firing", () => {
    // SPEC-STAFF-3
    let state = makeState({
      vars: { operating_budget: 100, inflation: 0.03, "staff.monetary_affairs.competence": 0.7 },
      flags: { crisis: true, "staffed.monetary_affairs": true },
    });
    state = hireStaff(state, DIVISION, CANDIDATE);
    const fired = fireStaff(state, DIVISION);
    expect(fired.vars.inflation).toBe(0.03);
    expect(fired.vars["staff.monetary_affairs.competence"]).toBe(0.7);
    expect(fired.flags.crisis).toBe(true);
    expect(fired.flags["staffed.monetary_affairs"]).toBe(true);
  });

  it("allows re-hiring after firing (full hire-fire-hire cycle)", () => {
    // SPEC-STAFF-3: after fireStaff, the division can be re-staffed
    let state = makeState({ vars: { operating_budget: 100 } });
    state = hireStaff(state, DIVISION, CANDIDATE);
    state = fireStaff(state, DIVISION);
    expect(state.flags[staffedFlagKey("research")]).toBe(false);
    // Re-hire succeeds
    const rehired = hireStaff(state, DIVISION, CANDIDATE);
    expect(rehired.flags[staffedFlagKey("research")]).toBe(true);
  });

  it("is a pure function — input state is not mutated by fireStaff", () => {
    // SPEC-STAFF-3
    let state = makeState({ vars: { operating_budget: 100 } });
    state = hireStaff(state, DIVISION, CANDIDATE);
    const varsBefore = { ...state.vars };
    const flagsBefore = { ...state.flags };
    fireStaff(state, DIVISION);
    expect(state.vars).toEqual(varsBefore);
    expect(state.flags).toEqual(flagsBefore);
  });

  it("fireStaff on an unstaffed division sets the flag to false (idempotent clear)", () => {
    // SPEC-STAFF-3: firing an already-unstaffed division should not throw
    const state = makeState({ vars: { operating_budget: 100 } });
    expect(() => fireStaff(state, DIVISION)).not.toThrow();
    const result = fireStaff(state, DIVISION);
    expect(result.flags[staffedFlagKey("research")]).toBe(false);
  });
});
