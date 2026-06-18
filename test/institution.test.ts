// SPEC-INST-1 + SPEC-INST-2: institution resources + division staffing
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyInstitutionDynamics,
  loadInstitutionParams,
  loadDivisionCatalog,
  staffedFlagKey,
  generateCandidates,
  hireStaff,
  institutionInvestment,
  InsufficientCapitalError,
  InsufficientBudgetError,
  DivisionAlreadyStaffedError,
  _resetInstitutionParamsCache,
  _resetDivisionCatalogCache,
  type InstitutionParams,
  type Division,
  type Candidate,
} from "../src/engine/institution";
import { makeState } from "../src/engine/state";
import { loadNamePools } from "../src/engine/names";
import { registerContentFile, registerContentDir, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

// ---------------------------------------------------------------------------
// Inline params for pure-function tests — avoids I/O dependency.
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

beforeEach(() => {
  _resetInstitutionParamsCache();
  _resetDivisionCatalogCache();
  _resetValidateFileCache();
  _resetRegistries();
});

// ---------------------------------------------------------------------------
// loadInstitutionParams — validated content loader (SPEC-INST-1)
// ---------------------------------------------------------------------------

describe("loadInstitutionParams (SPEC-INST-1)", () => {
  it("loads and returns a valid InstitutionParams object", () => {
    // SPEC-INST-1
    const p = loadInstitutionParams();
    expect(typeof p.initial_operating_budget).toBe("number");
    expect(typeof p.budget_monthly_growth).toBe("number");
    expect(typeof p.initial_political_capital).toBe("number");
    expect(typeof p.political_capital_baseline).toBe("number");
    expect(typeof p.political_capital_recovery).toBe("number");
    expect(typeof p.candidate_slate_size).toBe("number");
    expect(p.initial_operating_budget).toBeGreaterThan(0);
    expect(p.candidate_slate_size).toBeGreaterThanOrEqual(1);
  });

  it("returns the same cached reference on repeated calls", () => {
    // SPEC-INST-1
    const a = loadInstitutionParams();
    const b = loadInstitutionParams();
    expect(a).toBe(b);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-INST-1
    const a = loadInstitutionParams();
    _resetInstitutionParamsCache();
    const b = loadInstitutionParams();
    expect(b.initial_operating_budget).toBe(a.initial_operating_budget);
    expect(a).not.toBe(b);
  });

  it("schema rejects negative initial_operating_budget", () => {
    // SPEC-INST-1
    registerContentFile("content/engine/institution.json", {
      ...PARAMS,
      initial_operating_budget: -1,
    });
    expect(() => loadInstitutionParams()).toThrow();
  });

  it("schema rejects negative candidate_slate_size", () => {
    // SPEC-INST-1
    registerContentFile("content/engine/institution.json", {
      ...PARAMS,
      candidate_slate_size: 0,
    });
    expect(() => loadInstitutionParams()).toThrow();
  });

  it("schema rejects missing required field", () => {
    // SPEC-INST-1
    const { initial_operating_budget: _dropped, ...rest } = PARAMS;
    registerContentFile("content/engine/institution.json", rest);
    expect(() => loadInstitutionParams()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyInstitutionDynamics — pure state transform (SPEC-INST-1)
// ---------------------------------------------------------------------------

describe("applyInstitutionDynamics (SPEC-INST-1)", () => {
  it("operating_budget grows each month: budget * (1 + rate)", () => {
    // SPEC-INST-1
    const state = makeState({ vars: { operating_budget: 1000 } });
    const result = applyInstitutionDynamics(state, PARAMS);
    expect(result.vars.operating_budget).toBeCloseTo(1000 * (1 + PARAMS.budget_monthly_growth));
  });

  it("budget grows monotonically over N months", () => {
    // SPEC-INST-1
    let state = makeState({ vars: {} });
    let prev = PARAMS.initial_operating_budget;
    for (let i = 0; i < 12; i++) {
      state = applyInstitutionDynamics(state, PARAMS);
      const cur = state.vars.operating_budget as number;
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });

  it("budget after N months equals initial * (1 + rate)^N", () => {
    // SPEC-INST-1
    const N = 12;
    let state = makeState({ vars: {} });
    for (let i = 0; i < N; i++) {
      state = applyInstitutionDynamics(state, PARAMS);
    }
    const expected = PARAMS.initial_operating_budget * Math.pow(1 + PARAMS.budget_monthly_growth, N);
    expect(state.vars.operating_budget).toBeCloseTo(expected, 10);
  });

  it("defaults operating_budget to initial_operating_budget when absent", () => {
    // SPEC-INST-1: matches SPEC-PROD-1 default pattern so existing scenarios are unaffected.
    const state = makeState({ vars: {} });
    expect(state.vars.operating_budget).toBeUndefined();
    const result = applyInstitutionDynamics(state, PARAMS);
    expect(result.vars.operating_budget).toBeCloseTo(
      PARAMS.initial_operating_budget * (1 + PARAMS.budget_monthly_growth)
    );
  });

  it("political_capital mean-reverts toward baseline", () => {
    // SPEC-INST-1: capital += recovery * (baseline - capital).
    // Starting above baseline → decreases toward it.
    const state = makeState({ vars: { political_capital: 100 } });
    const result = applyInstitutionDynamics(state, PARAMS);
    // baseline=80, recovery=0.1 → new = 100 + 0.1*(80-100) = 98
    expect(result.vars.political_capital).toBeCloseTo(98);
  });

  it("political_capital mean-reverts from below baseline", () => {
    // SPEC-INST-1: starting below baseline → increases toward it.
    const state = makeState({ vars: { political_capital: 60 } });
    const result = applyInstitutionDynamics(state, PARAMS);
    // new = 60 + 0.1*(80-60) = 62
    expect(result.vars.political_capital).toBeCloseTo(62);
  });

  it("political_capital converges toward baseline over many months", () => {
    // SPEC-INST-1
    let state = makeState({ vars: { political_capital: 0 } });
    for (let i = 0; i < 100; i++) {
      state = applyInstitutionDynamics(state, PARAMS);
    }
    // After 100 months with recovery=0.1, should be very close to baseline=80
    expect(state.vars.political_capital as number).toBeCloseTo(PARAMS.political_capital_baseline, 0);
  });

  it("defaults political_capital to initial_political_capital when absent", () => {
    // SPEC-INST-1
    const state = makeState({ vars: {} });
    const result = applyInstitutionDynamics(state, PARAMS);
    const expected =
      PARAMS.initial_political_capital +
      PARAMS.political_capital_recovery *
        (PARAMS.political_capital_baseline - PARAMS.initial_political_capital);
    expect(result.vars.political_capital).toBeCloseTo(expected);
  });

  it("is a pure function — input state is not mutated", () => {
    // SPEC-INST-1
    const state = makeState({ vars: { operating_budget: 500, political_capital: 90 } });
    const varsBefore = { ...state.vars };
    applyInstitutionDynamics(state, PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  it("preserves all other vars unchanged", () => {
    // SPEC-INST-1
    const state = makeState({ vars: { inflation: 0.03, policy_rate: 0.05 } });
    const result = applyInstitutionDynamics(state, PARAMS);
    expect(result.vars.inflation).toBe(0.03);
    expect(result.vars.policy_rate).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// applyInstitutionDynamics with upkeep — SPEC-INST-3
// ---------------------------------------------------------------------------

describe("applyInstitutionDynamics — staffing upkeep (SPEC-INST-3)", () => {
  const UPKEEP_RATE = 0.1;
  const UPKEEP_PARAMS = { ...PARAMS, upkeep_per_hire_cost: UPKEEP_RATE };

  const DIV_A: Division = {
    id: "div_a",
    name: "div_a.name",
    desc: "div_a.desc",
    hire_cost: 20,
    investment: 0.1,
    channel: "fog",
    skill_weights: { forecasting: 1, markets: 0, supervision: 0, communication: 0, crisis: 0 },
  };

  const DIV_B: Division = {
    id: "div_b",
    name: "div_b.name",
    desc: "div_b.desc",
    hire_cost: 20,
    investment: 0.1,
    channel: "transmission",
    skill_weights: { forecasting: 0, markets: 1, supervision: 0, communication: 0, crisis: 0 },
  };

  it("deducts upkeep proportional to hire_cost for a staffed division", () => {
    // SPEC-INST-3
    const state = makeState({
      vars: { operating_budget: 1000 },
      flags: { "staffed.div_a": true },
    });
    const result = applyInstitutionDynamics(state, UPKEEP_PARAMS, [DIV_A]);
    const expectedGrowth = 1000 * (1 + UPKEEP_PARAMS.budget_monthly_growth);
    const expectedUpkeep = UPKEEP_RATE * DIV_A.hire_cost;
    expect(result.vars.operating_budget).toBeCloseTo(expectedGrowth - expectedUpkeep);
  });

  it("two staffed divisions with equal hire_cost incur exactly twice the upkeep of one", () => {
    // SPEC-INST-3
    const stateOne = makeState({
      vars: { operating_budget: 1000 },
      flags: { "staffed.div_a": true },
    });
    const stateTwo = makeState({
      vars: { operating_budget: 1000 },
      flags: { "staffed.div_a": true, "staffed.div_b": true },
    });
    const one = applyInstitutionDynamics(stateOne, UPKEEP_PARAMS, [DIV_A, DIV_B]);
    const two = applyInstitutionDynamics(stateTwo, UPKEEP_PARAMS, [DIV_A, DIV_B]);
    const oneUpkeep = 1000 * (1 + UPKEEP_PARAMS.budget_monthly_growth) - (one.vars.operating_budget as number);
    const twoUpkeep = 1000 * (1 + UPKEEP_PARAMS.budget_monthly_growth) - (two.vars.operating_budget as number);
    expect(twoUpkeep).toBeCloseTo(oneUpkeep * 2);
  });

  it("an unstaffed catalog produces no upkeep deduction", () => {
    // SPEC-INST-3
    const state = makeState({ vars: { operating_budget: 1000 } });
    const withCatalog = applyInstitutionDynamics(state, UPKEEP_PARAMS, [DIV_A, DIV_B]);
    const withoutCatalog = applyInstitutionDynamics(state, UPKEEP_PARAMS);
    expect(withCatalog.vars.operating_budget).toBeCloseTo(
      withoutCatalog.vars.operating_budget as number
    );
  });

  it("budget floors at 0 and never goes negative even when upkeep exceeds growth", () => {
    // SPEC-INST-3: extreme upkeep rate drains to 0, never negative
    const extremeParams = { ...PARAMS, upkeep_per_hire_cost: 10 }; // 10x hire_cost per month
    const state = makeState({
      vars: { operating_budget: 1 },
      flags: { "staffed.div_a": true },
    });
    const result = applyInstitutionDynamics(state, extremeParams, [DIV_A]);
    expect(result.vars.operating_budget).toBe(0);
  });

  it("is a pure function — input state is not mutated when catalog is supplied", () => {
    // SPEC-INST-3
    const state = makeState({
      vars: { operating_budget: 500 },
      flags: { "staffed.div_a": true },
    });
    const varsBefore = { ...state.vars };
    applyInstitutionDynamics(state, UPKEEP_PARAMS, [DIV_A]);
    expect(state.vars).toEqual(varsBefore);
  });

  it("omitting catalog keeps existing SPEC-INST-1 behaviour regardless of upkeep_per_hire_cost", () => {
    // SPEC-INST-3: backward-compat path
    const state = makeState({
      vars: { operating_budget: 1000 },
      flags: { "staffed.div_a": true },
    });
    const result = applyInstitutionDynamics(state, UPKEEP_PARAMS);
    expect(result.vars.operating_budget).toBeCloseTo(1000 * (1 + UPKEEP_PARAMS.budget_monthly_growth));
  });
});

// ---------------------------------------------------------------------------
// loadDivisionCatalog — validated dir loader (SPEC-INST-2)
// ---------------------------------------------------------------------------

describe("loadDivisionCatalog (SPEC-INST-2)", () => {
  it("loads at least one division with required fields", () => {
    // SPEC-INST-2
    const catalog = loadDivisionCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    for (const d of catalog) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.name).toBe("string");
      expect(typeof d.desc).toBe("string");
      expect(typeof d.hire_cost).toBe("number");
      expect(typeof d.investment).toBe("number");
      expect(d.hire_cost).toBeGreaterThanOrEqual(0);
      expect(d.investment).toBeGreaterThan(0);
    }
  });

  it("loads all five expected divisions", () => {
    // SPEC-INST-2
    const catalog = loadDivisionCatalog();
    const ids = catalog.map((d) => d.id);
    expect(ids).toContain("research");
    expect(ids).toContain("monetary_affairs");
    expect(ids).toContain("financial_stability");
    expect(ids).toContain("supervision");
    expect(ids).toContain("international");
  });

  it("returns cached reference on repeated calls", () => {
    // SPEC-INST-2
    const a = loadDivisionCatalog();
    const b = loadDivisionCatalog();
    expect(a).toBe(b);
  });

  it("schema rejects a division missing id", () => {
    // SPEC-INST-2
    registerContentDir("content/divisions", [
      { name: "division.research.name", desc: "division.research.desc", hire_cost: 10, investment: 0.2 },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema rejects a division with negative hire_cost", () => {
    // SPEC-INST-2
    registerContentDir("content/divisions", [
      { id: "research", name: "division.research.name", desc: "division.research.desc", hire_cost: -1, investment: 0.2 },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema rejects a division with zero investment", () => {
    // SPEC-INST-2
    registerContentDir("content/divisions", [
      { id: "research", name: "division.research.name", desc: "division.research.desc", hire_cost: 10, investment: 0 },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// staffedFlagKey (SPEC-INST-2)
// ---------------------------------------------------------------------------

describe("staffedFlagKey (SPEC-INST-2)", () => {
  it("returns expected flag key for a division id", () => {
    // SPEC-INST-2
    expect(staffedFlagKey("research")).toBe("staffed.research");
    expect(staffedFlagKey("monetary_affairs")).toBe("staffed.monetary_affairs");
  });
});

// ---------------------------------------------------------------------------
// generateCandidates — deterministic slate (SPEC-INST-2)
// ---------------------------------------------------------------------------

describe("generateCandidates (SPEC-INST-2)", () => {
  it("returns exactly candidate_slate_size candidates", () => {
    // SPEC-INST-2
    const pools = loadNamePools();
    const candidates = generateCandidates("research", 42, pools, PARAMS);
    expect(candidates.length).toBe(PARAMS.candidate_slate_size);
  });

  it("each candidate has name, competence in [0,1], and a valid lean", () => {
    // SPEC-INST-2
    const pools = loadNamePools();
    const candidates = generateCandidates("research", 42, pools, PARAMS);
    for (const c of candidates) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.competence).toBeGreaterThanOrEqual(0);
      expect(c.competence).toBeLessThanOrEqual(1);
      expect(["hawk", "dove", "centrist"]).toContain(c.lean);
    }
  });

  it("same inputs always produce identical slate (determinism)", () => {
    // SPEC-INST-2
    const pools = loadNamePools();
    const a = generateCandidates("research", 999, pools, PARAMS);
    const b = generateCandidates("research", 999, pools, PARAMS);
    expect(a).toEqual(b);
  });

  it("different seeds produce different slates", () => {
    // SPEC-INST-2
    const pools = loadNamePools();
    const a = generateCandidates("research", 1, pools, PARAMS);
    const b = generateCandidates("research", 2, pools, PARAMS);
    // It is astronomically unlikely that all candidates match across different seeds.
    const allMatch = a.every((c, i) => c.name === b[i]?.name);
    expect(allMatch).toBe(false);
  });

  it("different divisionIds produce different slates for same seed", () => {
    // SPEC-INST-2
    const pools = loadNamePools();
    const a = generateCandidates("research", 42, pools, PARAMS);
    const b = generateCandidates("monetary_affairs", 42, pools, PARAMS);
    const allMatch = a.every((c, i) => c.name === b[i]?.name);
    expect(allMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hireStaff — pure state transform with error guards (SPEC-INST-2)
// ---------------------------------------------------------------------------

describe("hireStaff (SPEC-INST-2)", () => {
  it("sets the staffed flag and competence var in returned state", () => {
    // SPEC-INST-2
    const state = makeState({ vars: { operating_budget: 50 } });
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    const result = hireStaff(state, DIVISION, candidate);
    expect(result.flags[staffedFlagKey("research")]).toBe(true);
    expect(result.vars["staff.research.competence"]).toBe(0.8);
  });

  it("deducts hire_cost from operating_budget (SPEC-STAFF-3)", () => {
    // SPEC-INST-2 / SPEC-STAFF-3: hire is funded by operating_budget
    const state = makeState({ vars: { operating_budget: 50 } });
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    const result = hireStaff(state, DIVISION, candidate);
    expect(result.vars.operating_budget).toBeCloseTo(40); // 50 - 10
  });

  it("throws InsufficientBudgetError when budget would go negative (SPEC-STAFF-3)", () => {
    // SPEC-INST-2 / SPEC-STAFF-3: InsufficientBudgetError replaces InsufficientCapitalError
    const state = makeState({ vars: { operating_budget: 5 } }); // hire_cost=10
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    expect(() => hireStaff(state, DIVISION, candidate)).toThrow(InsufficientBudgetError);
  });

  it("throws DivisionAlreadyStaffedError when division already staffed", () => {
    // SPEC-INST-2
    const state = makeState({
      vars: { operating_budget: 50 },
      flags: { [staffedFlagKey("research")]: true },
    });
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    expect(() => hireStaff(state, DIVISION, candidate)).toThrow(DivisionAlreadyStaffedError);
  });

  it("is a pure function — input state is not mutated", () => {
    // SPEC-INST-2
    const state = makeState({ vars: { operating_budget: 50 } });
    const flagsBefore = { ...state.flags };
    const varsBefore = { ...state.vars };
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    hireStaff(state, DIVISION, candidate);
    expect(state.flags).toEqual(flagsBefore);
    expect(state.vars).toEqual(varsBefore);
  });

  it("preserves other vars and flags unchanged", () => {
    // SPEC-INST-2
    const state = makeState({
      vars: { operating_budget: 50, inflation: 0.03 },
      flags: { at_war: false },
    });
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    const result = hireStaff(state, DIVISION, candidate);
    expect(result.vars.inflation).toBe(0.03);
    expect(result.flags.at_war).toBe(false);
  });

  it("allows hire when operating_budget exactly equals hire_cost", () => {
    // SPEC-INST-2 / SPEC-STAFF-3: boundary — budget = cost → balance = 0, which is not negative.
    const state = makeState({ vars: { operating_budget: 10 } }); // hire_cost=10
    const candidate: Candidate = { name: "Alice Smith", competence: 0.8, lean: "hawk", skills: { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 } };
    const result = hireStaff(state, DIVISION, candidate);
    expect(result.vars.operating_budget).toBeCloseTo(0);
    expect(result.flags[staffedFlagKey("research")]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// institutionInvestment (SPEC-INST-2)
// ---------------------------------------------------------------------------

describe("institutionInvestment (SPEC-INST-2)", () => {
  const CATALOG: Division[] = [
    { id: "research", name: "division.research.name", desc: "division.research.desc", hire_cost: 10, investment: 0.2, channel: "fog", skill_weights: { forecasting: 0.5, markets: 0.2, supervision: 0.05, communication: 0.15, crisis: 0.1 } },
    { id: "monetary_affairs", name: "division.monetary_affairs.name", desc: "division.monetary_affairs.desc", hire_cost: 12, investment: 0.3, channel: "transmission", skill_weights: { forecasting: 0.2, markets: 0.4, supervision: 0.1, communication: 0.2, crisis: 0.1 } },
  ];

  it("returns 0 when no divisions are staffed", () => {
    // SPEC-INST-2
    const state = makeState({ vars: {} });
    expect(institutionInvestment(state, CATALOG)).toBe(0);
  });

  it("sums investment * competence for each staffed division", () => {
    // SPEC-INST-2
    const state = makeState({
      vars: {
        "staff.research.competence": 0.8,
        "staff.monetary_affairs.competence": 0.6,
      },
      flags: {
        "staffed.research": true,
        "staffed.monetary_affairs": true,
      },
    });
    // 0.2 * 0.8 + 0.3 * 0.6 = 0.16 + 0.18 = 0.34
    expect(institutionInvestment(state, CATALOG)).toBeCloseTo(0.34);
  });

  it("only counts staffed divisions", () => {
    // SPEC-INST-2
    const state = makeState({
      vars: { "staff.research.competence": 1.0 },
      flags: { "staffed.research": true },
    });
    // only research staffed → 0.2 * 1.0 = 0.2
    expect(institutionInvestment(state, CATALOG)).toBeCloseTo(0.2);
  });

  it("is a pure function — does not mutate state", () => {
    // SPEC-INST-2
    const state = makeState({
      vars: { "staff.research.competence": 0.8 },
      flags: { "staffed.research": true },
    });
    const varsBefore = { ...state.vars };
    institutionInvestment(state, CATALOG);
    expect(state.vars).toEqual(varsBefore);
  });
});
