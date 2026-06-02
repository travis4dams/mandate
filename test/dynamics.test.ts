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

  // SPEC-SIM-5: clamp — unemployment is forced to 0 when the pre-clamp value would
  // be negative. Uses unemployment=0.0005 so rateGap=-0.05 gives change=-0.001 → -0.0005,
  // which Math.max(0, ...) lifts back to 0. The assertion is toBe(0), not >=0, so the
  // clamp actually has to fire for the test to pass.
  it("unemployment is clamped exactly to 0 when the pre-clamp value would be negative", () => {
    // SPEC-SIM-5
    const state = makeState({
      vars: {
        policy_rate: 0.0,
        inflation: 0.02,
        unemployment: 0.0005,
        expectations_anchor: 0.02,
      },
    });
    const result = applyMacroDynamics(state, BASE_PARAMS);
    // rateGap = -0.05; change = 0.02 * -0.05 = -0.001; pre-clamp = -0.0005; clamped → 0.
    expect(result.vars.unemployment).toBe(0);
  });

  // SPEC-SIM-5: clamp — inflation is forced to 0 in a severe deflationary scenario.
  // Extreme phillips_slope drives the pre-clamp value far below zero; the assertion
  // is toBe(0), not >=0, so a missing Math.max would fail the test.
  it("inflation is clamped exactly to 0 in a deflationary scenario", () => {
    // SPEC-SIM-5
    const extremeParams = { ...BASE_PARAMS, inflation_persistence: 0, phillips_slope: 10 };
    const state = makeState({
      vars: {
        policy_rate: BASE_PARAMS.neutral_rate,
        inflation: 0.001,
        unemployment: 0.99,
        expectations_anchor: 0,
      },
    });
    const result = applyMacroDynamics(state, extremeParams);
    // newInflation = 0 * 0.001 + 1 * 0 - 10 * (0.99 - 0.06) ≈ -9.3 → clamped to 0.
    expect(result.vars.inflation).toBe(0);
  });

  // SPEC-SIM-5: clamp — unemployment is forced to 1 under extreme tightening.
  // Pre-clamp value is far above 1; assertion is toBe(1) so the clamp must fire.
  it("unemployment is clamped exactly to 1 under extreme rate tightening", () => {
    // SPEC-SIM-5
    const extremeParams = { ...BASE_PARAMS, rate_sensitivity: 100 };
    const state = makeState({
      vars: {
        policy_rate: 0.15,
        inflation: 0.02,
        unemployment: 0.99,
        expectations_anchor: 0.02,
      },
    });
    const result = applyMacroDynamics(state, extremeParams);
    // newUnemployment = 0.99 + 100 * 0.10 = 10.99 → clamped to 1.
    expect(result.vars.unemployment).toBe(1);
  });
});
