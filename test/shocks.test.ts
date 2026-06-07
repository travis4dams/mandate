// SPEC-SHOCK-1: seeded supply-shock term in the Phillips curve.
import { describe, it, expect } from "vitest";
import { applySupplyShock, loadShocksParams, _resetShocksParamsCache, type ShocksParams } from "../src/engine/shocks";
import { mulberry32 } from "../src/engine/rng";
import { makeState } from "../src/engine/state";
import { Session } from "../src/engine/session";

const ZERO_PARAMS: ShocksParams = { supply_shock_sigma: 0 };
const NONZERO_PARAMS: ShocksParams = { supply_shock_sigma: 0.003 };

const BASE_VARS = {
  policy_rate: 0.05,
  inflation: 0.05,
  unemployment: 0.065,
  expectations_anchor: 0.05,
  credibility: 50,
};

// SPEC-SHOCK-1: sigma=0 returns state with inflation unchanged.
describe("applySupplyShock — sigma=0 (SPEC-SHOCK-1)", () => {
  it("returns the same object reference when sigma=0", () => {
    // SPEC-SHOCK-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(1);
    const result = applySupplyShock(state, rng, ZERO_PARAMS);
    expect(result).toBe(state);
  });

  it("inflation is unchanged when sigma=0", () => {
    // SPEC-SHOCK-1
    const state = makeState({ vars: { ...BASE_VARS, inflation: 0.042 } });
    const rng = mulberry32(99);
    const result = applySupplyShock(state, rng, ZERO_PARAMS);
    expect(result.vars.inflation).toBe(0.042);
  });
});

// SPEC-SHOCK-1: purity — input state not mutated.
describe("applySupplyShock — purity (SPEC-SHOCK-1)", () => {
  it("does not mutate the input state vars", () => {
    // SPEC-SHOCK-1
    const state = makeState({ vars: { ...BASE_VARS, inflation: 0.05 } });
    const originalInflation = state.vars.inflation;
    const rng = mulberry32(7);
    applySupplyShock(state, rng, NONZERO_PARAMS);
    expect(state.vars.inflation).toBe(originalInflation);
  });

  it("does not mutate any other var in the input state", () => {
    // SPEC-SHOCK-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const originalVars = { ...state.vars };
    const rng = mulberry32(7);
    applySupplyShock(state, rng, NONZERO_PARAMS);
    expect(state.vars).toEqual(originalVars);
  });
});

// SPEC-SHOCK-1: floor at 0 — a massive negative shock cannot make inflation negative.
describe("applySupplyShock — floor at 0 (SPEC-SHOCK-1)", () => {
  it("clamps inflation to 0 when shock is strongly negative", () => {
    // SPEC-SHOCK-1: supply_shock_sigma of 1000 guarantees both positive and negative
    // extremes; we confirm a result is never below 0.
    const state = makeState({ vars: { ...BASE_VARS, inflation: 0.001 } });
    const largeParams: ShocksParams = { supply_shock_sigma: 1000 };
    const rng = mulberry32(42);
    // Apply many times — at least some shocks should be strongly negative.
    for (let i = 0; i < 100; i++) {
      const result = applySupplyShock(state, rng, largeParams);
      expect(result.vars.inflation).toBeGreaterThanOrEqual(0);
    }
  });
});

// SPEC-SHOCK-1: non-constant output — sigma>0 produces varying inflation across months.
describe("applySupplyShock — varying output with sigma>0 (SPEC-SHOCK-1)", () => {
  it("applying N times with sigma>0 does not produce all-identical inflation values", () => {
    // SPEC-SHOCK-1
    const rng = mulberry32(123);
    const values: number[] = [];
    for (let i = 0; i < 20; i++) {
      const state = makeState({ vars: { ...BASE_VARS, inflation: 0.05 } });
      const result = applySupplyShock(state, rng, NONZERO_PARAMS);
      values.push(result.vars.inflation as number);
    }
    const allSame = values.every((v) => v === values[0]);
    expect(allSame).toBe(false);
  });
});

// SPEC-SHOCK-1: determinism — two Rng instances from same seed produce same sequence.
describe("applySupplyShock — determinism (SPEC-SHOCK-1)", () => {
  it("two rng instances from the same seed produce identical shock sequences", () => {
    // SPEC-SHOCK-1
    const rngA = mulberry32(555);
    const rngB = mulberry32(555);
    for (let i = 0; i < 20; i++) {
      const state = makeState({ vars: { ...BASE_VARS, inflation: 0.05 } });
      const resultA = applySupplyShock(state, rngA, NONZERO_PARAMS);
      const resultB = applySupplyShock(state, rngB, NONZERO_PARAMS);
      expect(resultA.vars.inflation).toBe(resultB.vars.inflation);
    }
  });
});

// SPEC-SHOCK-1: only inflation changes in returned state.
describe("applySupplyShock — only inflation changed in output (SPEC-SHOCK-1)", () => {
  it("all vars except inflation are equal to the input state", () => {
    // SPEC-SHOCK-1
    const state = makeState({ vars: { ...BASE_VARS, inflation: 0.05 } });
    const rng = mulberry32(17);
    const result = applySupplyShock(state, rng, NONZERO_PARAMS);
    // For every var except inflation, output === input.
    for (const key of Object.keys(state.vars)) {
      if (key === "inflation") continue;
      expect(result.vars[key]).toBe(state.vars[key]);
    }
  });
});

// SPEC-SHOCK-1: integration — Session.fromScenario with same seed produces identical trajectories.
describe("Session.advance — supply shock integration (SPEC-SHOCK-1)", () => {
  it("two Session runs with the same seed produce identical trajectories after advance(12)", () => {
    // SPEC-SHOCK-1
    const a = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const b = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    a.advance(12);
    b.advance(12);
    expect(a.trajectory).toEqual(b.trajectory);
  });

  it("two Session runs with different seeds produce different trajectories after advance(12)", () => {
    // SPEC-SHOCK-1: different seeds → different shock sequences → different inflation paths.
    const a = Session.fromScenario("scen.1979_stagflation", 1, "comm.fomc_1979");
    const b = Session.fromScenario("scen.1979_stagflation", 2, "comm.fomc_1979");
    a.advance(12);
    b.advance(12);
    // The trajectories should differ at at least one point.
    const aInflations = a.trajectory.map((s) => s.vars.inflation);
    const bInflations = b.trajectory.map((s) => s.vars.inflation);
    const identical = aInflations.every((v, i) => v === bInflations[i]);
    expect(identical).toBe(false);
  });
});

// SPEC-SHOCK-1: loadShocksParams loads and validates from disk.
describe("loadShocksParams (SPEC-SHOCK-1)", () => {
  it("loads supply_shock_sigma as a non-negative finite number", () => {
    // SPEC-SHOCK-1
    _resetShocksParamsCache();
    const params = loadShocksParams();
    expect(typeof params.supply_shock_sigma).toBe("number");
    expect(params.supply_shock_sigma).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(params.supply_shock_sigma)).toBe(true);
  });
});

// SPEC-SHOCK-1: reset() restores the RNG so advance(N) after reset() matches a fresh session.
describe("Session.reset — RNG reset (SPEC-SHOCK-1)", () => {
  it("reset(); advance(N) produces same trajectory as fresh session with same seed", () => {
    // SPEC-SHOCK-1
    const fresh = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    fresh.advance(12);
    const reused = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    reused.advance(5);
    reused.reset();
    reused.advance(12);
    expect(reused.trajectory).toEqual(fresh.trajectory);
  });
});
