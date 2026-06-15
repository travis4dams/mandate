// SPEC-CULTURE-1: institutional culture drift — EWMA policy_lean + supervisory_rigor.
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyCultureDrift,
  loadCultureParams,
  _resetCultureParamsCache,
  type CultureParams,
} from "../src/engine/culture";
import { makeState } from "../src/engine/state";
import type { Division } from "../src/engine/institution";
import { registerContentFile, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSupervisionDiv(): Division {
  return {
    id: "supervision",
    name: "division.supervision.name",
    desc: "division.supervision.desc",
    hire_cost: 20,
    investment: 0.15,
    channel: "fragility_mitigation",
    skill_weights: { forecasting: 0.1, markets: 0.1, supervision: 0.5, communication: 0.1, crisis: 0.2 },
  };
}

function makeFinancialStabilityDiv(): Division {
  return {
    id: "financial_stability",
    name: "division.financial_stability.name",
    desc: "division.financial_stability.desc",
    hire_cost: 14,
    investment: 0.2,
    channel: "fragility_visibility",
    skill_weights: { forecasting: 0.3, markets: 0.25, supervision: 0.25, communication: 0.1, crisis: 0.1 },
  };
}

function makeOtherDiv(): Division {
  return {
    id: "research",
    name: "division.research.name",
    desc: "division.research.desc",
    hire_cost: 10,
    investment: 0.1,
    channel: "fog",
    skill_weights: { forecasting: 0.5, markets: 0.2, supervision: 0.1, communication: 0.1, crisis: 0.1 },
  };
}

const BASE_PARAMS: CultureParams = {
  policy_lean_halflife: 12,
  supervisory_rigor_halflife: 12,
  initial_supervisory_rigor: 0.4,
  disposition_lean_weight: 0.5,
};

beforeEach(() => {
  _resetCultureParamsCache();
  _resetValidateFileCache();
  _resetRegistries();
});

// ---------------------------------------------------------------------------
// applyCultureDrift — pure function tests (SPEC-CULTURE-1)
// ---------------------------------------------------------------------------

describe("applyCultureDrift — pure function (SPEC-CULTURE-1)", () => {
  it("is a pure function — input state is never mutated", () => {
    // SPEC-CULTURE-1: pure — never mutates inputs
    const catalog = [makeSupervisionDiv()];
    const state = makeState({
      vars: { "staff.supervision.eff": 0.8, "staff.supervision.lean": 1 },
      flags: { "staffed.supervision": true },
    });
    const varsBefore = { ...state.vars };
    const flagsBefore = { ...state.flags };
    applyCultureDrift(state, catalog, BASE_PARAMS);
    expect(state.vars).toEqual(varsBefore);
    expect(state.flags).toEqual(flagsBefore);
  });

  it("returns a new GameState object (does not return the same reference)", () => {
    // SPEC-CULTURE-1: pure — returns new state
    const catalog = [makeSupervisionDiv()];
    const state = makeState({
      vars: { "staff.supervision.eff": 0.8, "staff.supervision.lean": 1 },
      flags: { "staffed.supervision": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    expect(result).not.toBe(state);
    expect(result.vars).not.toBe(state.vars);
  });

  it("defaults culture.policy_lean to 0 when absent and no divisions are staffed", () => {
    // SPEC-CULTURE-1: EWMA toward 0 baseline when no staffed divisions
    const catalog = [makeSupervisionDiv()];
    const state = makeState({ vars: {}, flags: {} });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    // EWMA: new = old + alpha * (target - old); with old=0 and target=0, result=0
    expect(result.vars["culture.policy_lean"]).toBeCloseTo(0, 10);
  });

  it("policy_lean moves toward hawk (positive) when all staffed directors are hawks", () => {
    // SPEC-CULTURE-1: mean staff lean > 0 pulls culture.policy_lean upward
    const catalog = [makeSupervisionDiv(), makeFinancialStabilityDiv()];
    const state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.8,
        "staff.supervision.lean": 1,       // hawk
        "staff.financial_stability.eff": 0.7,
        "staff.financial_stability.lean": 1, // hawk
      },
      flags: { "staffed.supervision": true, "staffed.financial_stability": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    expect(result.vars["culture.policy_lean"]).toBeGreaterThan(0);
  });

  it("policy_lean moves toward dove (negative) when all staffed directors are doves", () => {
    // SPEC-CULTURE-1: mean staff lean < 0 pulls culture.policy_lean downward
    const catalog = [makeSupervisionDiv()];
    const state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.6,
        "staff.supervision.lean": -1,  // dove
      },
      flags: { "staffed.supervision": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    expect(result.vars["culture.policy_lean"]).toBeLessThan(0);
  });

  it("policy_lean only uses staffed divisions, not unstaffed ones", () => {
    // SPEC-CULTURE-1: only staffed divisions contribute to mean lean
    const catalog = [makeSupervisionDiv(), makeFinancialStabilityDiv()];
    const state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.8,
        "staff.supervision.lean": 1,       // hawk
        // financial_stability present in vars but NOT flagged as staffed
        "staff.financial_stability.eff": 0.9,
        "staff.financial_stability.lean": -1, // dove — should be ignored
      },
      flags: { "staffed.supervision": true }, // only supervision staffed
    });
    const resultWithUnstaffed = applyCultureDrift(state, catalog, BASE_PARAMS);

    const catalogOnly = [makeSupervisionDiv()];
    const resultWithout = applyCultureDrift(state, catalogOnly, BASE_PARAMS);

    // Both should produce the same result since the extra division isn't staffed
    expect(resultWithUnstaffed.vars["culture.policy_lean"]).toBeCloseTo(
      resultWithout.vars["culture.policy_lean"] as number,
      10,
    );
  });

  it("policy_lean baseline is 0 when no divisions are staffed", () => {
    // SPEC-CULTURE-1: baseline 0 if no staffed divisions
    const catalog = [makeSupervisionDiv()];
    const state = makeState({ vars: { "culture.policy_lean": 0.5 }, flags: {} });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    // EWMA toward 0 from 0.5 — should pull down
    expect(result.vars["culture.policy_lean"]).toBeLessThan(0.5);
  });

  it("non-supervision/financial_stability divisions do not affect policy_lean when they ARE staffed", () => {
    // SPEC-CULTURE-1: mean lean over all staffed divisions is simple average of lean values
    const catalog = [makeOtherDiv()];
    const state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.research.eff": 0.8,
        "staff.research.lean": 1,  // hawk
      },
      flags: { "staffed.research": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    // research is staffed with a hawk — policy_lean should move toward 1
    expect(result.vars["culture.policy_lean"]).toBeGreaterThan(0);
  });

  it("supervisory_rigor moves toward eff-weighted blend of supervision+financial_stability", () => {
    // SPEC-CULTURE-1: rigor EWMA toward effectiveness-weighted blend
    const catalog = [makeSupervisionDiv(), makeFinancialStabilityDiv()];
    const state = makeState({
      vars: {
        "culture.supervisory_rigor": 0.1,
        "staff.supervision.eff": 0.9,
        "staff.supervision.lean": 0,
        "staff.financial_stability.eff": 0.8,
        "staff.financial_stability.lean": 0,
      },
      flags: { "staffed.supervision": true, "staffed.financial_stability": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    // High-eff rigor directors should pull supervisory_rigor up from 0.1
    expect(result.vars["culture.supervisory_rigor"]).toBeGreaterThan(0.1);
  });

  it("supervisory_rigor uses content baseline when neither supervision nor financial_stability is staffed", () => {
    // SPEC-CULTURE-1: baseline from content when neither relevant division is staffed
    const catalog = [makeOtherDiv()];
    const state = makeState({
      vars: {
        "culture.supervisory_rigor": 0.1,
        "staff.research.eff": 0.9,
        "staff.research.lean": 0,
      },
      flags: { "staffed.research": true },
    });
    const paramsHighBaseline: CultureParams = { ...BASE_PARAMS, initial_supervisory_rigor: 0.9 };
    const result = applyCultureDrift(state, catalog, paramsHighBaseline);
    // Rigor EWMA toward 0.9 from 0.1 — should move up
    expect(result.vars["culture.supervisory_rigor"]).toBeGreaterThan(0.1);
  });

  it("supervisory_rigor uses only supervision eff when only supervision is staffed", () => {
    // SPEC-CULTURE-1: rigor target = eff of staffed rigor divisions
    const catalog = [makeSupervisionDiv(), makeFinancialStabilityDiv()];
    const state = makeState({
      vars: {
        "culture.supervisory_rigor": 0,
        "staff.supervision.eff": 0.8,
        "staff.supervision.lean": 0,
        // financial_stability not staffed
      },
      flags: { "staffed.supervision": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    // Target = 0.8; rigor should move from 0 toward 0.8
    expect(result.vars["culture.supervisory_rigor"]).toBeGreaterThan(0);
    expect(result.vars["culture.supervisory_rigor"]).toBeLessThan(0.8);
  });

  it("EWMA alpha derived from halflife: alpha = 1 - 2^(-1/halflife)", () => {
    // SPEC-CULTURE-1: half-life in content drives EWMA alpha
    const catalog = [makeSupervisionDiv()];
    const state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.8,
        "staff.supervision.lean": 1,
      },
      flags: { "staffed.supervision": true },
    });
    const halflife = 6;
    const params: CultureParams = { ...BASE_PARAMS, policy_lean_halflife: halflife };
    const alpha = 1 - Math.pow(2, -1 / halflife);
    const expected = 0 + alpha * (1 - 0); // EWMA: old=0, target=1
    const result = applyCultureDrift(state, catalog, params);
    expect(result.vars["culture.policy_lean"]).toBeCloseTo(expected, 10);
  });

  it("preserves all other vars unchanged", () => {
    // SPEC-CULTURE-1: pure — only culture.* vars change
    const catalog = [makeSupervisionDiv()];
    const state = makeState({
      vars: {
        inflation: 0.05,
        policy_rate: 0.1,
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.8,
        "staff.supervision.lean": 1,
      },
      flags: { "staffed.supervision": true },
    });
    const result = applyCultureDrift(state, catalog, BASE_PARAMS);
    expect(result.vars.inflation).toBe(0.05);
    expect(result.vars.policy_rate).toBe(0.1);
  });

  it("policy_lean stays within [-1, 1] after many iterations moving toward 1", () => {
    // SPEC-CULTURE-1: EWMA target is 1 (all hawks) — result stays in [-1,1]
    const catalog = [makeSupervisionDiv()];
    let state = makeState({
      vars: {
        "culture.policy_lean": 0,
        "staff.supervision.eff": 0.9,
        "staff.supervision.lean": 1,
      },
      flags: { "staffed.supervision": true },
    });
    for (let i = 0; i < 120; i++) {
      state = applyCultureDrift(state, catalog, { ...BASE_PARAMS, policy_lean_halflife: 1 });
    }
    const lean = state.vars["culture.policy_lean"] as number;
    expect(lean).toBeGreaterThanOrEqual(-1);
    expect(lean).toBeLessThanOrEqual(1);
  });

  it("computes exact expected values from the EWMA formula", () => {
    // SPEC-CULTURE-1: new = old + alpha*(target-old), alpha=1-2^(-1/halflife)
    const catalog = [makeSupervisionDiv(), makeFinancialStabilityDiv()];
    const prevLean = 0.2;
    const prevRigor = 0.3;
    const supEff = 0.7;
    const fsEff = 0.5;
    const state = makeState({
      vars: {
        "culture.policy_lean": prevLean,
        "culture.supervisory_rigor": prevRigor,
        "staff.supervision.eff": supEff,
        "staff.supervision.lean": 1,  // hawk
        "staff.financial_stability.eff": fsEff,
        "staff.financial_stability.lean": -1, // dove
      },
      flags: { "staffed.supervision": true, "staffed.financial_stability": true },
    });
    const p = BASE_PARAMS;
    // mean lean = (1 + (-1)) / 2 = 0
    const meanLean = (1 + (-1)) / 2;
    const alphaLean = 1 - Math.pow(2, -1 / p.policy_lean_halflife);
    const expectedLean = prevLean + alphaLean * (meanLean - prevLean);

    // rigor target: eff-weighted blend of supervision + financial_stability
    const totalEff = supEff + fsEff;
    const rigorTarget = (supEff * supEff + fsEff * fsEff) / totalEff;
    const alphaRigor = 1 - Math.pow(2, -1 / p.supervisory_rigor_halflife);
    const expectedRigor = prevRigor + alphaRigor * (rigorTarget - prevRigor);

    const result = applyCultureDrift(state, catalog, p);
    expect(result.vars["culture.policy_lean"]).toBeCloseTo(expectedLean, 10);
    expect(result.vars["culture.supervisory_rigor"]).toBeCloseTo(expectedRigor, 10);
  });
});

// ---------------------------------------------------------------------------
// loadCultureParams (SPEC-CULTURE-1)
// ---------------------------------------------------------------------------

describe("loadCultureParams (SPEC-CULTURE-1)", () => {
  it("loads and returns valid params from content/engine/culture.json", () => {
    // SPEC-CULTURE-1
    const params = loadCultureParams();
    expect(typeof params.policy_lean_halflife).toBe("number");
    expect(typeof params.supervisory_rigor_halflife).toBe("number");
    expect(typeof params.initial_supervisory_rigor).toBe("number");
    expect(params.policy_lean_halflife).toBeGreaterThan(0);
    expect(params.supervisory_rigor_halflife).toBeGreaterThan(0);
    expect(params.initial_supervisory_rigor).toBeGreaterThanOrEqual(0);
    expect(params.initial_supervisory_rigor).toBeLessThanOrEqual(1);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-CULTURE-1: module-level cache
    const first = loadCultureParams();
    const second = loadCultureParams();
    expect(first).toBe(second);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-CULTURE-1
    const first = loadCultureParams();
    _resetCultureParamsCache();
    const second = loadCultureParams();
    expect(second.policy_lean_halflife).toBe(first.policy_lean_halflife);
    expect(first).not.toBe(second);
  });

  it("schema rejects initial_supervisory_rigor outside [0,1]", () => {
    // SPEC-CULTURE-1: schema validation
    registerContentFile("content/engine/culture.json", { ...BASE_PARAMS, initial_supervisory_rigor: 1.5 });
    expect(() => loadCultureParams()).toThrow();
  });

  it("schema rejects non-positive policy_lean_halflife", () => {
    // SPEC-CULTURE-1
    registerContentFile("content/engine/culture.json", { ...BASE_PARAMS, policy_lean_halflife: 0 });
    expect(() => loadCultureParams()).toThrow();
  });

  it("schema rejects non-positive supervisory_rigor_halflife", () => {
    // SPEC-CULTURE-1
    registerContentFile("content/engine/culture.json", { ...BASE_PARAMS, supervisory_rigor_halflife: -1 });
    expect(() => loadCultureParams()).toThrow();
  });

  it("schema rejects missing required fields", () => {
    // SPEC-CULTURE-1: schema is strict — all fields required
    registerContentFile("content/engine/culture.json", { policy_lean_halflife: 12 });
    expect(() => loadCultureParams()).toThrow();
  });
});
