import { describe, it, expect } from "vitest";
import { observe } from "../src/engine/fog";
import { makeState, type GameState } from "../src/engine/state";
import { mulberry32 } from "../src/engine/rng";

// SPEC-FOG-1

describe("observe (data fog)", () => {
  it("is deterministic: same seed + same state + same seriesId yields identical values", () => {
    const state = makeState({ date: "1979-08", vars: { inflation: 0.114 }, flags: {} });
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const v1 = observe(state, "inflation", rng1);
    const v2 = observe(state, "inflation", rng2);
    expect(v1).toBe(v2);
  });

  it("noise_scale=0, lag_months=0 → exact truth (no fog)", () => {
    // policy_rate has noise_scale=0 and lag_months=0 in content/engine/params.json.
    // SPEC-FOG-1: lag_months===0 reads state.vars[seriesId]; noise_scale=0 → no noise.
    const state = makeState({ date: "1979-08", vars: { policy_rate: 0.1075 }, flags: {} });
    const rng = mulberry32(99);
    expect(observe(state, "policy_rate", rng)).toBe(0.1075);
  });

  it("lag_months=1, noise_scale=0: returns history[0].vars[seriesId] exactly", () => {
    // SPEC-FOG-1: lag_months=1 → history[lag_months-1] = history[0].
    // gdp has noise_scale=0 and lag_months=1 in content/engine/params.json.
    // Values chosen to be clearly distinguishable: current=5.0, history[0]=2.0.
    const state: GameState = {
      date: "1979-08",
      vars: { gdp: 5.0 },
      flags: {},
      history: [{ date: "1979-07", vars: { gdp: 2.0 }, flags: {} }],
    };
    const rng = mulberry32(0);
    // noise_scale=0 → exact value; must be history[0].vars.gdp, not current vars.gdp.
    expect(observe(state, "gdp", rng)).toBe(2.0);
  });

  it("lag_months=2 with history: returns history[1].vars[seriesId] exactly", () => {
    // SPEC-FOG-1: lag_months=2 → history[lag_months-1] = history[1].
    // unemployment has lag_months=2 per content/engine/params.json (noise_scale=0.001).
    // Values chosen far apart so any slot confusion is obvious.
    const state: GameState = {
      date: "1979-08",
      vars: { unemployment: 0.500 },
      flags: {},
      history: [
        { date: "1979-07", vars: { unemployment: 0.900 }, flags: {} },
        { date: "1979-06", vars: { unemployment: 0.100 }, flags: {} },
      ],
    };
    const rng = mulberry32(7);
    const result = observe(state, "unemployment", rng);
    // Truth is history[1].vars.unemployment = 0.100; noise_scale=0.001 is tiny.
    expect(result).toBeCloseTo(0.100, 1);
    expect(Math.abs(result - 0.500)).toBeGreaterThan(0.1);
    expect(Math.abs(result - 0.900)).toBeGreaterThan(0.1);
  });

  it("lag_months > history.length → falls back to state.vars[seriesId] (current value)", () => {
    // expectations_anchor has lag_months=3; only 1 history entry provided.
    // Graceful degradation: must return current state.vars value (with noise applied).
    const state: GameState = {
      date: "1979-08",
      vars: { expectations_anchor: 0.09 },
      flags: {},
      history: [{ date: "1979-07", vars: { expectations_anchor: 0.08 }, flags: {} }],
    };
    const rng = mulberry32(13);
    const result = observe(state, "expectations_anchor", rng);
    // Should be close to 0.09 (current), not 0.08 (history[0]).
    expect(result).toBeCloseTo(0.09, 1);
    expect(Math.abs(result - 0.08)).toBeGreaterThan(0.002);
  });

  it("unknown seriesId throws an error", () => {
    const state = makeState({ date: "1979-08", vars: {}, flags: {} });
    const rng = mulberry32(1);
    expect(() => observe(state, "nonexistent_series", rng)).toThrow();
  });
});
