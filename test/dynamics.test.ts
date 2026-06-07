// SPEC-SIM-5 (real-rate transmission), SPEC-CRED-4 (continuous adaptive expectations),
// SPEC-CRED-6 (mission-tied credibility) — all evolve in one simultaneous monthly step.
import { describe, it, expect } from "vitest";
import { applyMacroDynamics, type MacroDynamicsParams } from "../src/engine/dynamics";
import { makeState } from "../src/engine/state";

// Base params matching content/engine/dynamics.json + credibility.json for test use.
const BASE: MacroDynamicsParams = {
  inflation_persistence: 0.952,
  phillips_slope: 0.106,
  unemployment_natural_rate: 0.0645,
  real_neutral_rate: 0.027,
  okun_coefficient: 1.14,
  unemployment_adjustment_speed: 0.045,
  target_inflation: 0.02,
  unemployment_target: 0.055,
  expectations_adaptivity: 0.051,
  expectations_anchor_pull: 0.025,
  credibility_mission_gain: 300,
  credibility_unemployment_weight: 0.5,
  anchor_threshold: 60,
};

const baseVars = {
  policy_rate: 0.05,
  inflation: 0.05,
  unemployment: 0.0645,
  expectations_anchor: 0.05,
  credibility: 50,
  months_below_anchor: 0,
};

describe("applyMacroDynamics — real-rate transmission (SPEC-SIM-5)", () => {
  it("a high REAL rate raises unemployment toward a higher equilibrium", () => {
    // SPEC-SIM-5: policy 15% vs 5% expected inflation = 10% real, well above r* → recession.
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.15, expectations_anchor: 0.05 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment);
  });

  it("a nominal rate that is NOT real-restrictive does not cause a recession", () => {
    // SPEC-SIM-5: 11% nominal against 11% expected inflation is ~0% real — barely restrictive,
    // unlike the slice-1 nominal-gap model which would have driven unemployment up regardless.
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.11, expectations_anchor: 0.11, unemployment: 0.0645 } });
    const result = applyMacroDynamics(state, BASE);
    // realRate 0% < r* (2.7%), so equilibrium unemployment is below natural → unemployment eases, not rises.
    expect(result.vars.unemployment).toBeLessThanOrEqual(state.vars.unemployment);
  });

  it("easing (low real rate) lets an elevated unemployment recover toward natural", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.02, expectations_anchor: 0.05, unemployment: 0.10 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBeLessThan(state.vars.unemployment);
  });

  it("slack (unemployment above natural) reduces inflation via the Phillips curve", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.10, unemployment: 0.12 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation);
  });

  it("has a stable steady state at target inflation, natural unemployment, neutral real rate", () => {
    // SPEC-SIM-5: inflation = anchor = target, unemployment = natural, policy = target + r*.
    const state = makeState({
      vars: {
        policy_rate: BASE.target_inflation + BASE.real_neutral_rate,
        inflation: BASE.target_inflation,
        unemployment: BASE.unemployment_natural_rate,
        expectations_anchor: BASE.target_inflation,
        credibility: 80,
        months_below_anchor: 0,
      },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeCloseTo(BASE.target_inflation, 10);
    expect(result.vars.unemployment).toBeCloseTo(BASE.unemployment_natural_rate, 10);
    expect(result.vars.expectations_anchor).toBeCloseTo(BASE.target_inflation, 10);
  });

  it("clamps unemployment to 1 under absurd real tightening", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 1.1, expectations_anchor: 0.0, unemployment: 0.99 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBe(1);
  });

  it("clamps inflation to 0 in a severe deflationary scenario", () => {
    // SPEC-SIM-5
    const extreme = { ...BASE, inflation_persistence: 0, phillips_slope: 10 };
    const state = makeState({ vars: { ...baseVars, inflation: 0.001, expectations_anchor: 0, unemployment: 0.99 } });
    const result = applyMacroDynamics(state, extreme);
    expect(result.vars.inflation).toBe(0);
  });

  it("is a pure function and does not mutate the input state", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.2, inflation: 0.10, unemployment: 0.08 } });
    const before = { ...state.vars };
    applyMacroDynamics(state, BASE);
    expect(state.vars).toEqual(before);
  });
});

describe("applyMacroDynamics — adaptive expectations (SPEC-CRED-4)", () => {
  it("at low credibility, expectations chase realized inflation upward (de-anchoring)", () => {
    // SPEC-CRED-4: credibility 0 → fully adaptive; inflation above anchor pulls anchor up.
    const state = makeState({ vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.05, credibility: 0 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.expectations_anchor).toBeGreaterThan(state.vars.expectations_anchor);
  });

  it("at high credibility, expectations are pulled toward target (re-anchoring)", () => {
    // SPEC-CRED-4: credibility 100 → anchor above target is pulled down toward it.
    const state = makeState({ vars: { ...baseVars, inflation: 0.06, expectations_anchor: 0.06, credibility: 100 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.expectations_anchor).toBeLessThan(state.vars.expectations_anchor);
    expect(result.vars.expectations_anchor).toBeGreaterThan(BASE.target_inflation);
  });

  it("months_below_anchor increments below the threshold and freezes at/above it", () => {
    // SPEC-CRED-4
    const below = makeState({ vars: { ...baseVars, credibility: 50, months_below_anchor: 3 } });
    expect(applyMacroDynamics(below, BASE).vars.months_below_anchor).toBe(4);
    const above = makeState({ vars: { ...baseVars, credibility: 70, months_below_anchor: 3 } });
    expect(applyMacroDynamics(above, BASE).vars.months_below_anchor).toBe(3);
  });
});

describe("applyMacroDynamics — over-range credibility clamp (SPEC-DOCT-1)", () => {
  it("credibility above CRED_MAX does not invert the adaptive-expectations term", () => {
    // SPEC-DOCT-1: adoptDoctrine intentionally stores credibility > 100 so abandonDoctrine
    // can reverse the exact delta. applyMacroDynamics must clamp c = credibility/CRED_MAX to 1
    // so (1 - c) stays >= 0 and the adaptive term never inverts sign.
    const stateOver = makeState({
      vars: { ...baseVars, credibility: 103, inflation: 0.05, expectations_anchor: 0.05 },
    });
    const stateAt = makeState({
      vars: { ...baseVars, credibility: 100, inflation: 0.05, expectations_anchor: 0.05 },
    });
    const resultOver = applyMacroDynamics(stateOver, BASE);
    const resultAt = applyMacroDynamics(stateAt, BASE);
    // Anchor should move in the same direction (toward target) for both — not inverted.
    expect(Math.sign(resultOver.vars.expectations_anchor! - stateOver.vars.expectations_anchor!))
      .toBe(Math.sign(resultAt.vars.expectations_anchor! - stateAt.vars.expectations_anchor!));
    // Credibility is clamped back to CRED_MAX by dynamics on the first tick.
    expect(resultOver.vars.credibility).toBeLessThanOrEqual(100);
  });
});

describe("applyMacroDynamics — mission-tied credibility (SPEC-CRED-6)", () => {
  it("rises when the economy moves toward the dual-mandate target", () => {
    // SPEC-CRED-6: high inflation falling + elevated unemployment easing → distance shrinks.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.04, expectations_anchor: 0.04, unemployment: 0.10, policy_rate: 0.067, credibility: 50 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation);
    expect(result.vars.credibility).toBeGreaterThan(state.vars.credibility);
  });

  it("falls when the economy moves away from target", () => {
    // SPEC-CRED-6: anchor above inflation drives inflation up, away from target.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.04, expectations_anchor: 0.08, unemployment: 0.0645, policy_rate: 0.107, credibility: 50 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeGreaterThan(state.vars.inflation);
    expect(result.vars.credibility).toBeLessThan(state.vars.credibility);
  });

  it("is inflation-dominant: disinflation builds credibility even as a recession deepens", () => {
    // SPEC-CRED-6: unemployment_weight 0.5 means a big inflation improvement outweighs a
    // simultaneous unemployment worsening — credibility rises while unemployment rises.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.10, unemployment: 0.12, policy_rate: 0.20, credibility: 30 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation); // disinflating
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment); // recession deepening
    expect(result.vars.credibility).toBeGreaterThan(state.vars.credibility); // yet credibility earned
  });
});
