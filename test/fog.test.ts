import { describe, it, expect } from "vitest";
import { observe } from "../src/engine/fog";
import { makeState } from "../src/engine/state";
import { mulberry32 } from "../src/engine/rng";

// SPEC-FOG-1

describe("observe (data fog)", () => {
  it("is deterministic: same seed + same state + same seriesId yields identical values", () => {
    const state = makeState({
      date: "1979-08",
      vars: { inflation: 0.114 },
      flags: {},
      history: [],
    });
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const v1 = observe(state, "inflation", rng1);
    const v2 = observe(state, "inflation", rng2);
    expect(v1).toBe(v2);
  });

  it("noise_scale=0, lag_months=0 → exact truth (no fog)", () => {
    // The fog params for "policy_rate" have noise_scale=0 and lag_months=0,
    // so observe must return the exact current value. (SPEC-FOG-1: lag_months===0
    // reads state.vars[seriesId]; noise_scale=0 means no noise added.)
    const state = makeState({
      date: "1979-08",
      vars: { policy_rate: 0.1075 },
      flags: {},
      history: [],
    });
    const rng = mulberry32(99);
    const result = observe(state, "policy_rate", rng);
    expect(result).toBe(0.1075);
  });

  it("lag_months=2 with history: returns history[1].vars[seriesId]", () => {
    // AC-4 lag indexing (locked): lag_months >= 1 reads state.history[lag_months - 1].
    // lag_months=2 → history[2-1] = history[1].
    // unemployment has lag_months=2 per content/engine/params.json.
    const history0 = { date: "1979-07", vars: { unemployment: 0.055 }, flags: {} };
    const history1 = { date: "1979-06", vars: { unemployment: 0.050 }, flags: {} };
    const state = makeState({
      date: "1979-08",
      vars: { unemployment: 0.058 }, // current value (should NOT be returned)
      flags: {},
      history: [history0, history1], // history[0]=most-recent, history[1]=2 months back
    });
    // With noise_scale=0.001 the result won't be exact, but we can verify the lag
    // by using a series that has noise_scale=0 and lag_months=2. Since unemployment
    // has noise, we test the lag by constructing a custom test with policy_rate
    // having no noise but lag_months=0 (published). Instead, we test with a
    // deterministic seed check: the base value must be history[1].vars.unemployment.
    // We verify by checking that with noise_scale=0 the result equals history[1].
    // But unemployment has noise_scale=0.001 — so let's just assert the result is
    // close to history[1].vars.unemployment (not history[0] and not current).
    // For a strict test: seed is fixed, so the noised value is reproducible.
    const rng = mulberry32(7);
    const result = observe(state, "unemployment", rng);
    // The truth (lagged) is history[1].vars.unemployment = 0.050.
    // With noise_scale=0.001 the result should be very close.
    expect(result).toBeCloseTo(0.050, 1); // within 0.05 of truth
    // Confirm it is NOT the current value 0.058 nor history[0] value 0.055.
    expect(Math.abs(result - 0.058)).toBeGreaterThan(0.001);
    expect(Math.abs(result - 0.055)).toBeGreaterThan(0.001);
  });

  it("lag_months > history.length → falls back to state.vars[seriesId] (current value)", () => {
    // expectations_anchor has lag_months=3 but we provide a history of only 1 snapshot.
    // Graceful degradation: must return current state.vars value (with noise applied).
    const state = makeState({
      date: "1979-08",
      vars: { expectations_anchor: 0.09 },
      flags: {},
      history: [{ date: "1979-07", vars: { expectations_anchor: 0.08 }, flags: {} }],
    });
    // With noise_scale=0.003 the result will be close to 0.09 (current value).
    const rng = mulberry32(13);
    const result = observe(state, "expectations_anchor", rng);
    // Should be close to 0.09 (current), not 0.08 (history[0]).
    expect(result).toBeCloseTo(0.09, 1);
    expect(Math.abs(result - 0.08)).toBeGreaterThan(0.002);
  });

  it("unknown seriesId throws an error", () => {
    const state = makeState({
      date: "1979-08",
      vars: {},
      flags: {},
      history: [],
    });
    const rng = mulberry32(1);
    expect(() => observe(state, "nonexistent_series", rng)).toThrow();
  });
});
