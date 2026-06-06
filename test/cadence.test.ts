// SPEC-SIM-6: sub-monthly tick cadence — pure scaling functions and trajectory invariance.
import { describe, it, expect, afterEach } from "vitest";
import {
  scaleParamsForTick,
  loadClockCadenceParams,
  _resetClockCadenceParamsCache,
} from "../src/engine/cadence.js";
import { applyMacroDynamics, type MacroDynamicsParams } from "../src/engine/dynamics.js";
import { makeState } from "../src/engine/state.js";

afterEach(() => {
  _resetClockCadenceParamsCache();
});

// Base params matching content/engine/dynamics.json + credibility.json.
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

const STEADY_VARS = {
  policy_rate: BASE.target_inflation + BASE.real_neutral_rate,
  inflation: BASE.target_inflation,
  unemployment: BASE.unemployment_natural_rate,
  expectations_anchor: BASE.target_inflation,
  credibility: 80,
  months_below_anchor: 0,
};

describe("scaleParamsForTick — SPEC-SIM-6", () => {
  it("returns the same reference for n=1 (identity)", () => {
    // SPEC-SIM-6
    const scaled = scaleParamsForTick(BASE, 1);
    expect(scaled).toBe(BASE);
  });

  it("scaled inflation_persistence satisfies p_scaled^n ≈ p_monthly (AR composition)", () => {
    // SPEC-SIM-6: composing n sub-tick updates must equal one monthly update.
    const n = 4;
    const scaled = scaleParamsForTick(BASE, n);
    expect(Math.pow(scaled.inflation_persistence, n)).toBeCloseTo(BASE.inflation_persistence, 10);
  });

  it("scaled unemployment_adjustment_speed satisfies (1-α_scaled)^n ≈ 1-α_monthly", () => {
    // SPEC-SIM-6: discrete-time exact scaling.
    const n = 4;
    const scaled = scaleParamsForTick(BASE, n);
    expect(Math.pow(1 - scaled.unemployment_adjustment_speed, n)).toBeCloseTo(
      1 - BASE.unemployment_adjustment_speed,
      10,
    );
  });

  it("flow params (phillips_slope, credibility_mission_gain) are divided by n", () => {
    // SPEC-SIM-6
    const n = 4;
    const scaled = scaleParamsForTick(BASE, n);
    expect(scaled.phillips_slope).toBeCloseTo(BASE.phillips_slope / n, 12);
    expect(scaled.credibility_mission_gain).toBeCloseTo(BASE.credibility_mission_gain / n, 12);
    expect(scaled.expectations_adaptivity).toBeCloseTo(BASE.expectations_adaptivity / n, 12);
    expect(scaled.expectations_anchor_pull).toBeCloseTo(BASE.expectations_anchor_pull / n, 12);
  });

  it("structural params (natural rate, targets, thresholds) are unchanged", () => {
    // SPEC-SIM-6: these are level params, not per-period rates.
    const scaled = scaleParamsForTick(BASE, 4);
    expect(scaled.unemployment_natural_rate).toBe(BASE.unemployment_natural_rate);
    expect(scaled.real_neutral_rate).toBe(BASE.real_neutral_rate);
    expect(scaled.okun_coefficient).toBe(BASE.okun_coefficient);
    expect(scaled.target_inflation).toBe(BASE.target_inflation);
    expect(scaled.unemployment_target).toBe(BASE.unemployment_target);
    expect(scaled.credibility_unemployment_weight).toBe(BASE.credibility_unemployment_weight);
    expect(scaled.anchor_threshold).toBe(BASE.anchor_threshold);
  });

  it("is a pure function (does not mutate input)", () => {
    // SPEC-SIM-6
    const copy = { ...BASE };
    scaleParamsForTick(BASE, 4);
    expect(BASE).toEqual(copy);
  });
});

describe("trajectory invariance — SPEC-SIM-6", () => {
  it("n=4 weekly ticks preserve steady state (inflation, unemployment, anchor within 1e-8)", () => {
    // SPEC-SIM-6: at the calibrated steady state, sub-ticks must not drift.
    const state = makeState({ vars: { ...STEADY_VARS } });
    const scaled = scaleParamsForTick(BASE, 4);
    let s = state;
    for (let t = 0; t < 4; t++) {
      s = applyMacroDynamics(s, scaled);
    }
    expect(s.vars.inflation as number).toBeCloseTo(BASE.target_inflation, 8);
    expect(s.vars.unemployment as number).toBeCloseTo(BASE.unemployment_natural_rate, 8);
    expect(s.vars.expectations_anchor as number).toBeCloseTo(BASE.target_inflation, 8);
  });

  it("n=4 sub-ticks match monthly model within 0.2pp after 12 months (documented tolerance)", () => {
    // SPEC-SIM-6: finer cadence preserves the calibrated macro trajectory.
    // Tolerance: 0.2pp (20 bp). Actual error is typically < 0.01pp due to geometric scaling.
    const INITIAL = {
      policy_rate: 0.15,
      inflation: 0.11,
      unemployment: 0.065,
      expectations_anchor: 0.10,
      credibility: 40,
      months_below_anchor: 0,
    };

    // Monthly model (n=1 — exact reference).
    let s1 = makeState({ vars: { ...INITIAL } });
    for (let m = 0; m < 12; m++) {
      s1 = applyMacroDynamics(s1, BASE);
    }

    // Weekly model (n=4 with scaled params).
    const scaled4 = scaleParamsForTick(BASE, 4);
    let s4 = makeState({ vars: { ...INITIAL } });
    for (let m = 0; m < 12; m++) {
      for (let t = 0; t < 4; t++) {
        s4 = applyMacroDynamics(s4, scaled4);
      }
    }

    const TOLERANCE = 0.002;
    expect(Math.abs((s4.vars.inflation as number) - (s1.vars.inflation as number))).toBeLessThan(TOLERANCE);
    expect(Math.abs((s4.vars.unemployment as number) - (s1.vars.unemployment as number))).toBeLessThan(TOLERANCE);
    expect(
      Math.abs((s4.vars.expectations_anchor as number) - (s1.vars.expectations_anchor as number)),
    ).toBeLessThan(TOLERANCE);
  });

  it("n=4 sub-ticks match monthly model within 0.2pp after 36 months (Volcker scenario)", () => {
    // SPEC-SIM-6: tolerance holds over the full calibration window.
    const INITIAL = {
      policy_rate: 0.175,
      inflation: 0.135,
      unemployment: 0.062,
      expectations_anchor: 0.12,
      credibility: 20,
      months_below_anchor: 0,
    };

    let s1 = makeState({ vars: { ...INITIAL } });
    for (let m = 0; m < 36; m++) {
      s1 = applyMacroDynamics(s1, BASE);
    }

    const scaled4 = scaleParamsForTick(BASE, 4);
    let s4 = makeState({ vars: { ...INITIAL } });
    for (let m = 0; m < 36; m++) {
      for (let t = 0; t < 4; t++) {
        s4 = applyMacroDynamics(s4, scaled4);
      }
    }

    const TOLERANCE = 0.002;
    expect(Math.abs((s4.vars.inflation as number) - (s1.vars.inflation as number))).toBeLessThan(TOLERANCE);
    expect(Math.abs((s4.vars.unemployment as number) - (s1.vars.unemployment as number))).toBeLessThan(TOLERANCE);
    expect(
      Math.abs((s4.vars.expectations_anchor as number) - (s1.vars.expectations_anchor as number)),
    ).toBeLessThan(TOLERANCE);
  });
});

describe("loadClockCadenceParams — SPEC-SIM-6", () => {
  it("loads successfully and returns ticks_per_month >= 1", () => {
    // SPEC-SIM-6
    const params = loadClockCadenceParams();
    expect(Number.isInteger(params.ticks_per_month)).toBe(true);
    expect(params.ticks_per_month).toBeGreaterThanOrEqual(1);
  });

  it("is cached — second call returns the same reference", () => {
    // SPEC-SIM-6
    const p1 = loadClockCadenceParams();
    const p2 = loadClockCadenceParams();
    expect(p1).toBe(p2);
  });

  it("cache is cleared by _resetClockCadenceParamsCache", () => {
    // SPEC-SIM-6
    const p1 = loadClockCadenceParams();
    _resetClockCadenceParamsCache();
    const p2 = loadClockCadenceParams();
    expect(p1).not.toBe(p2);
    expect(p1).toEqual(p2);
  });
});
