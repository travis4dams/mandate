// SPEC-STAFF-1 + SPEC-DIV-2: director skills, effectiveness fit, full division catalog
import { describe, it, expect, beforeEach } from "vitest";
import {
  directorEffectiveness,
  generateCandidates,
  hireStaff,
  loadDivisionCatalog,
  staffedFlagKey,
  _resetDivisionCatalogCache,
  _resetInstitutionParamsCache,
  type DirectorSkills,
  type Division,
  type Candidate,
} from "../src/engine/institution";
import { makeState } from "../src/engine/state";
import { loadNamePools } from "../src/engine/names";
import { registerContentDir, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

// ---------------------------------------------------------------------------
// Inline fixtures — avoids I/O dependency for pure-function tests.
// ---------------------------------------------------------------------------

const UNIFORM_SKILLS: DirectorSkills = {
  forecasting: 0.8,
  markets: 0.8,
  supervision: 0.8,
  communication: 0.8,
  crisis: 0.8,
};

const ZERO_SKILLS: DirectorSkills = {
  forecasting: 0,
  markets: 0,
  supervision: 0,
  communication: 0,
  crisis: 0,
};

const WEIGHTS_RESEARCH: DirectorSkills = {
  forecasting: 0.5,
  markets: 0.2,
  supervision: 0.05,
  communication: 0.15,
  crisis: 0.1,
};

const WEIGHTS_SUPERVISION: DirectorSkills = {
  forecasting: 0.1,
  markets: 0.1,
  supervision: 0.5,
  communication: 0.1,
  crisis: 0.2,
};

/** A specialist: high forecasting, low supervision — scores well on research, poorly on supervision. */
const SPECIALIST_SKILLS: DirectorSkills = {
  forecasting: 1.0,
  markets: 0.8,
  supervision: 0.1,
  communication: 0.5,
  crisis: 0.3,
};

const DIVISION_RESEARCH: Division = {
  id: "research",
  name: "division.research.name",
  desc: "division.research.desc",
  hire_cost: 12,
  investment: 0.25,
  channel: "fog",
  skill_weights: WEIGHTS_RESEARCH,
};

const DIVISION_SUPERVISION: Division = {
  id: "supervision",
  name: "division.supervision.name",
  desc: "division.supervision.desc",
  hire_cost: 20,
  investment: 0.15,
  channel: "fragility_mitigation",
  skill_weights: WEIGHTS_SUPERVISION,
};

const BASE_PARAMS = {
  initial_operating_budget: 1000,
  budget_monthly_growth: 0.01,
  initial_political_capital: 100,
  political_capital_baseline: 80,
  political_capital_recovery: 0.1,
  candidate_slate_size: 3,
  candidate_refresh_months: 12,
};

beforeEach(() => {
  _resetInstitutionParamsCache();
  _resetDivisionCatalogCache();
  _resetValidateFileCache();
  _resetRegistries();
});

// ---------------------------------------------------------------------------
// directorEffectiveness — pure weighted dot product (SPEC-STAFF-1)
// ---------------------------------------------------------------------------

describe("directorEffectiveness (SPEC-STAFF-1)", () => {
  it("returns weighted average of skills against weights", () => {
    // SPEC-STAFF-1: Σ(w·s) / Σw
    // skills all 0.8, weights sum to 1.0 → result = 0.8
    const result = directorEffectiveness(UNIFORM_SKILLS, WEIGHTS_RESEARCH);
    expect(result).toBeCloseTo(0.8);
  });

  it("returns 0 when all skills are 0", () => {
    // SPEC-STAFF-1
    expect(directorEffectiveness(ZERO_SKILLS, WEIGHTS_RESEARCH)).toBeCloseTo(0);
  });

  it("returns 0 when all weights are 0", () => {
    // SPEC-STAFF-1: safe default when weights sum to zero
    const zeroWeights: DirectorSkills = { forecasting: 0, markets: 0, supervision: 0, communication: 0, crisis: 0 };
    expect(directorEffectiveness(UNIFORM_SKILLS, zeroWeights)).toBe(0);
  });

  it("result is in [0, 1] for skills and weights in [0, 1]", () => {
    // SPEC-STAFF-1
    const result = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_RESEARCH);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("specialist scores higher on matched division than mismatched", () => {
    // SPEC-STAFF-1: the same skills produce a higher effectiveness score
    // when the division weights align with the candidate's strengths.
    const researchScore = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_RESEARCH);
    const supervisionScore = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_SUPERVISION);
    expect(researchScore).toBeGreaterThan(supervisionScore);
  });

  it("is a pure function — repeated calls return identical results", () => {
    // SPEC-STAFF-1
    const r1 = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_RESEARCH);
    const r2 = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_RESEARCH);
    expect(r1).toBe(r2);
  });
});

// ---------------------------------------------------------------------------
// generateCandidates — skills drawn deterministically (SPEC-STAFF-1)
// ---------------------------------------------------------------------------

describe("generateCandidates skills (SPEC-STAFF-1)", () => {
  it("each candidate has a skills object with all five keys in [0, 1]", () => {
    // SPEC-STAFF-1
    const pools = loadNamePools();
    const candidates = generateCandidates("research", 42, pools, BASE_PARAMS);
    for (const c of candidates) {
      expect(c.skills).toBeDefined();
      expect(c.skills.forecasting).toBeGreaterThanOrEqual(0);
      expect(c.skills.forecasting).toBeLessThanOrEqual(1);
      expect(c.skills.markets).toBeGreaterThanOrEqual(0);
      expect(c.skills.markets).toBeLessThanOrEqual(1);
      expect(c.skills.supervision).toBeGreaterThanOrEqual(0);
      expect(c.skills.supervision).toBeLessThanOrEqual(1);
      expect(c.skills.communication).toBeGreaterThanOrEqual(0);
      expect(c.skills.communication).toBeLessThanOrEqual(1);
      expect(c.skills.crisis).toBeGreaterThanOrEqual(0);
      expect(c.skills.crisis).toBeLessThanOrEqual(1);
    }
  });

  it("skills are deterministic — same (seed, divisionId, index) always yields same skills", () => {
    // SPEC-STAFF-1
    const pools = loadNamePools();
    const a = generateCandidates("research", 999, pools, BASE_PARAMS);
    const b = generateCandidates("research", 999, pools, BASE_PARAMS);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]?.skills).toEqual(b[i]?.skills);
    }
  });

  it("different seeds produce different skill sets", () => {
    // SPEC-STAFF-1
    const pools = loadNamePools();
    const a = generateCandidates("research", 1, pools, BASE_PARAMS);
    const b = generateCandidates("research", 2, pools, BASE_PARAMS);
    // astronomically unlikely all first-candidate skills match across different seeds
    expect(a[0]?.skills.forecasting).not.toBeCloseTo(b[0]?.skills.forecasting ?? -1);
  });

  it("different divisionIds produce different skill sets for same seed", () => {
    // SPEC-STAFF-1
    const pools = loadNamePools();
    const a = generateCandidates("research", 42, pools, BASE_PARAMS);
    const b = generateCandidates("supervision", 42, pools, BASE_PARAMS);
    expect(a[0]?.skills.forecasting).not.toBeCloseTo(b[0]?.skills.forecasting ?? -1);
  });
});

// ---------------------------------------------------------------------------
// hireStaff — records eff and lean in state (SPEC-STAFF-1)
// ---------------------------------------------------------------------------

describe("hireStaff eff and lean (SPEC-STAFF-1)", () => {
  it("stores staff.<id>.eff = directorEffectiveness(skills, skill_weights)", () => {
    // SPEC-STAFF-1
    const candidate: Candidate = {
      name: "Jordan Ellis",
      competence: 0.7,
      lean: "centrist",
      skills: SPECIALIST_SKILLS,
    };
    const state = makeState({ vars: { operating_budget: 50 } });
    const result = hireStaff(state, DIVISION_RESEARCH, candidate);
    const expectedEff = directorEffectiveness(SPECIALIST_SKILLS, WEIGHTS_RESEARCH);
    expect(result.vars["staff.research.eff"]).toBeCloseTo(expectedEff);
  });

  it("stores staff.<id>.lean = +1 for hawk", () => {
    // SPEC-STAFF-1
    const candidate: Candidate = { name: "Jordan Ellis", competence: 0.7, lean: "hawk", skills: UNIFORM_SKILLS };
    const state = makeState({ vars: { operating_budget: 50 } });
    const result = hireStaff(state, DIVISION_RESEARCH, candidate);
    expect(result.vars["staff.research.lean"]).toBe(1);
  });

  it("stores staff.<id>.lean = -1 for dove", () => {
    // SPEC-STAFF-1
    const candidate: Candidate = { name: "Jordan Ellis", competence: 0.7, lean: "dove", skills: UNIFORM_SKILLS };
    const state = makeState({ vars: { operating_budget: 50 } });
    const result = hireStaff(state, DIVISION_RESEARCH, candidate);
    expect(result.vars["staff.research.lean"]).toBe(-1);
  });

  it("stores staff.<id>.lean = 0 for centrist", () => {
    // SPEC-STAFF-1
    const candidate: Candidate = { name: "Jordan Ellis", competence: 0.7, lean: "centrist", skills: UNIFORM_SKILLS };
    const state = makeState({ vars: { operating_budget: 50 } });
    const result = hireStaff(state, DIVISION_RESEARCH, candidate);
    expect(result.vars["staff.research.lean"]).toBe(0);
  });

  it("eff differs when same skills are hired into a different division", () => {
    // SPEC-STAFF-1: the skill_weights of the division change the effectiveness score
    const candidate: Candidate = { name: "Jordan Ellis", competence: 0.7, lean: "centrist", skills: SPECIALIST_SKILLS };
    const stateA = makeState({ vars: { operating_budget: 50 } });
    const stateB = makeState({ vars: { operating_budget: 50 } });
    const resultResearch = hireStaff(stateA, DIVISION_RESEARCH, candidate);
    const resultSupervision = hireStaff(stateB, DIVISION_SUPERVISION, candidate);
    expect(resultResearch.vars["staff.research.eff"]).not.toBeCloseTo(
      resultSupervision.vars["staff.supervision.eff"] as number
    );
  });

  it("is still a pure function — input not mutated", () => {
    // SPEC-STAFF-1
    const candidate: Candidate = { name: "Jordan Ellis", competence: 0.7, lean: "hawk", skills: UNIFORM_SKILLS };
    const state = makeState({ vars: { operating_budget: 50 } });
    const varsBefore = { ...state.vars };
    const flagsBefore = { ...state.flags };
    hireStaff(state, DIVISION_RESEARCH, candidate);
    expect(state.vars).toEqual(varsBefore);
    expect(state.flags).toEqual(flagsBefore);
  });
});

// ---------------------------------------------------------------------------
// loadDivisionCatalog — ≥10 divisions with skill_weights + channel (SPEC-DIV-2)
// ---------------------------------------------------------------------------

describe("loadDivisionCatalog (SPEC-DIV-2)", () => {
  it("loads at least 10 divisions", () => {
    // SPEC-DIV-2
    const catalog = loadDivisionCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(10);
  });

  it("all 10 required divisions are present", () => {
    // SPEC-DIV-2
    const catalog = loadDivisionCatalog();
    const ids = catalog.map((d) => d.id);
    const required = [
      "research", "monetary_affairs", "financial_stability", "supervision",
      "international", "rbops", "consumer_community", "legal", "coo", "oig",
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it("every division has all five skill_weights as numbers ≥ 0", () => {
    // SPEC-STAFF-1 / SPEC-DIV-2
    const catalog = loadDivisionCatalog();
    const keys: (keyof DirectorSkills)[] = ["forecasting", "markets", "supervision", "communication", "crisis"];
    for (const div of catalog) {
      for (const key of keys) {
        expect(typeof div.skill_weights[key]).toBe("number");
        expect(div.skill_weights[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("every division has a valid channel string", () => {
    // SPEC-DIV-2
    const valid = new Set([
      "fog", "transmission", "fragility_visibility", "fragility_mitigation",
      "crisis_severity", "external_shock", "org", "political", "oversight",
    ]);
    const catalog = loadDivisionCatalog();
    for (const div of catalog) {
      expect(valid.has(div.channel)).toBe(true);
    }
  });

  it("channel mappings match the contract (spot-check key divisions)", () => {
    // SPEC-DIV-2: contract-specified channel assignments
    const catalog = loadDivisionCatalog();
    const byId = Object.fromEntries(catalog.map((d) => [d.id, d]));
    expect(byId["research"]?.channel).toBe("fog");
    expect(byId["monetary_affairs"]?.channel).toBe("transmission");
    expect(byId["financial_stability"]?.channel).toBe("fragility_visibility");
    expect(byId["supervision"]?.channel).toBe("fragility_mitigation");
    expect(byId["international"]?.channel).toBe("external_shock");
    expect(byId["rbops"]?.channel).toBe("crisis_severity");
    expect(byId["consumer_community"]?.channel).toBe("political");
    expect(byId["legal"]?.channel).toBe("political");
    expect(byId["coo"]?.channel).toBe("org");
    expect(byId["oig"]?.channel).toBe("oversight");
  });

  it("schema rejects a division missing skill_weights", () => {
    // SPEC-STAFF-1 / SPEC-DIV-2: schema enforcement
    registerContentDir("content/divisions", [
      {
        id: "test_div",
        name: "division.research.name",
        desc: "division.research.desc",
        hire_cost: 10,
        investment: 0.2,
        channel: "fog",
        // skill_weights intentionally omitted
      },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema rejects a division with an incomplete skill_weights (missing one key)", () => {
    // SPEC-STAFF-1: all five keys required
    registerContentDir("content/divisions", [
      {
        id: "test_div",
        name: "division.research.name",
        desc: "division.research.desc",
        hire_cost: 10,
        investment: 0.2,
        channel: "fog",
        skill_weights: { forecasting: 0.5, markets: 0.3, supervision: 0.1, communication: 0.1 },
        // crisis intentionally omitted
      },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema rejects a division with a negative skill weight", () => {
    // SPEC-STAFF-1: each weight must be ≥ 0
    registerContentDir("content/divisions", [
      {
        id: "test_div",
        name: "division.research.name",
        desc: "division.research.desc",
        hire_cost: 10,
        investment: 0.2,
        channel: "fog",
        skill_weights: { forecasting: -0.1, markets: 0.3, supervision: 0.2, communication: 0.3, crisis: 0.3 },
      },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema rejects a division with an invalid channel value", () => {
    // SPEC-DIV-2: channel must be one of the enum values
    registerContentDir("content/divisions", [
      {
        id: "test_div",
        name: "division.research.name",
        desc: "division.research.desc",
        hire_cost: 10,
        investment: 0.2,
        channel: "not_a_real_channel",
        skill_weights: { forecasting: 0.2, markets: 0.2, supervision: 0.2, communication: 0.2, crisis: 0.2 },
      },
    ]);
    expect(() => loadDivisionCatalog()).toThrow();
  });

  it("schema accepts a division with optional unlocked_by field", () => {
    // SPEC-DIV-2: unlocked_by is optional but must be a non-empty string when present
    registerContentDir("content/divisions", [
      {
        id: "test_div",
        name: "division.research.name",
        desc: "division.research.desc",
        hire_cost: 10,
        investment: 0.2,
        channel: "fog",
        skill_weights: { forecasting: 0.2, markets: 0.2, supervision: 0.2, communication: 0.2, crisis: 0.2 },
        unlocked_by: "some_tech_id",
      },
    ]);
    expect(() => loadDivisionCatalog()).not.toThrow();
    const catalog = loadDivisionCatalog();
    expect(catalog[0]?.unlocked_by).toBe("some_tech_id");
  });

  it("staffedFlagKey works for every catalog division", () => {
    // SPEC-DIV-2
    const catalog = loadDivisionCatalog();
    for (const div of catalog) {
      expect(staffedFlagKey(div.id)).toBe(`staffed.${div.id}`);
    }
  });
});
