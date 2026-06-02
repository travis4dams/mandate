// SPEC-SIM-5
import { describe, it, expect } from "vitest";
import { applyMacroDynamics } from "../src/engine/dynamics";
import { makeState } from "../src/engine/state";

// Base params matching content/engine/dynamics.json for test use.
const BASE_PARAMS = {
  phillips_slope: 0.05,
  unemployment_natural_rate: 0.06,
  rate_sensitivity: 0.02,
  neutral_rate: 0.05,
  inflation_persistence: 0.95,
};

describe("applyMacroDynamics", () => {
  // SPEC-SIM-5: tight policy (rate > neutral) raises unemployment.
  it("tight policy raises unemployment when policy_rate > neutral_rate", () => {
    // SPEC-SIM-5
    const state = makeState({
      vars: {
        policy_rate: 0.20,
        inflation: 0.05,
        unemployment: 0.06,
        expectations_anchor: 0.02,
      },
    });
    const result = applyMacroDynamics(state, BASE_PARAMS);
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment);
  });

  // SPEC-SIM-5: high unemployment (above natural rate) reduces inflation.
  it("high unemployment above natural rate reduces inflation toward expectations", () => {
    // SPEC-SIM-5
    const state = makeState({
      vars: {
        policy_rate: 0.05,
        inflation: 0.10,
        unemployment: 0.12,
        expectations_anchor: 0.02,
      },
    });
    const result = applyMacroDynamics(state, BASE_PARAMS);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation);
  });

  // SPEC-SIM-5: at steady state (unemployment=natural, policy_rate=neutral, inflation=expectations_anchor=target), dynamics don't move.
  it("at steady state, dynamics leave inflation and unemployment approximately unchanged", () => {
    // SPEC-SIM-5
    const target = 0.02;
    const state = makeState({
      vars: {
        policy_rate: BASE_PARAMS.neutral_rate,
        inflation: target,
        unemployment: BASE_PARAMS.unemployment_natural_rate,
        expectations_anchor: target,
      },
    });
    const result = applyMacroDynamics(state, BASE_PARAMS);
    // inflation: 0.95 * 0.02 + 0.05 * 0.02 - 0.05 * 0 = 0.02 exactly
    expect(result.vars.inflation).toBeCloseTo(target, 10);
    // unemployment: 0.06 + 0.02 * 0 = 0.06 exactly
    expect(result.vars.unemployment).toBeCloseTo(BASE_PARAMS.unemployment_natural_rate, 10);
  });

  // SPEC-SIM-5: pure function — input state is not mutated.
  it("applyMacroDynamics is a pure function and does not mutate the input state", () => {
    // SPEC-SIM-5
    const state = makeState({
      vars: {
        policy_rate: 0.20,
        inflation: 0.10,
        unemployment: 0.08,
        expectations_anchor: 0.03,
      },
    });
    const varsBefore = { ...state.vars };
    applyMacroDynamics(state, BASE_PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  // SPEC-SIM-5: clamp — unemployment cannot go below 0 even with very loose policy.
  it("unemployment is clamped to 0 when policy_rate is well below neutral", () => {
    // SPEC-SIM-5
    const state = makeState({
      vars: {
        policy_rate: 0.0,
        inflation: 0.02,
        unemployment: 0.001,
        expectations_anchor: 0.02,
      },
    });
    const result = applyMacroDynamics(state, BASE_PARAMS);
    // rateGap = 0.0 - 0.05 = -0.05; change = 0.02 * -0.05 = -0.001; new = 0.001 - 0.001 = 0 (clamp)
    expect(result.vars.unemployment).toBeGreaterThanOrEqual(0);
  });
});
