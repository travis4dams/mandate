// SPEC-TERM-1: Term structure — long_rate EWMA toward policy_rate.
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyTermStructure,
  loadTermStructureParams,
  _resetTermStructureParamsCache,
  type TermStructureParams,
} from "../src/engine/term-structure";
import { Session } from "../src/engine/session";
import { makeState } from "../src/engine/state";

// SPEC-TERM-1: reset cache before each test to avoid cross-test state.
beforeEach(() => {
  _resetTermStructureParamsCache();
});

describe("applyTermStructure (SPEC-TERM-1)", () => {
  // SPEC-TERM-1: cold-start — if long_rate is absent from state, it defaults to policy_rate,
  // so the EWMA output on the first tick equals policy_rate.
  it("cold-start: long_rate absent → output long_rate equals policy_rate on first tick", () => {
    // SPEC-TERM-1: with no prior long_rate, prevLong defaults to policy_rate.
    // newLong = (1 - λ) * policy_rate + λ * policy_rate = policy_rate.
    const state = makeState({ vars: { policy_rate: 0.08 } });
    const params: TermStructureParams = { half_life_months: 24 };
    const result = applyTermStructure(state, params);
    expect(result.vars.long_rate).toBeCloseTo(0.08, 10);
  });

  // SPEC-TERM-1: half_life_months = 1 gives λ = 1 - exp(-ln(2)) = 0.5.
  it("half_life_months=1 gives λ ≈ 0.5", () => {
    // SPEC-TERM-1: λ = 1 - exp(-ln(2) / 1) = 1 - exp(-ln(2)) = 1 - 0.5 = 0.5.
    // So after one tick starting from long_rate=0.0, policy_rate=0.1:
    // newLong = (1 - 0.5) * 0.0 + 0.5 * 0.1 = 0.05.
    const state = makeState({ vars: { policy_rate: 0.1, long_rate: 0.0 } });
    const params: TermStructureParams = { half_life_months: 1 };
    const result = applyTermStructure(state, params);
    const expectedLambda = 1 - Math.exp(-Math.LN2);
    const expectedLongRate = (1 - expectedLambda) * 0.0 + expectedLambda * 0.1;
    expect(result.vars.long_rate).toBeCloseTo(expectedLongRate, 10);
    expect(result.vars.long_rate).toBeCloseTo(0.05, 5);
  });

  // SPEC-TERM-1: at half_life_months N, long_rate is 50% of the way from start to target.
  it("at exactly half_life_months ticks, long_rate is 50% of the way to policy_rate", () => {
    // SPEC-TERM-1: after N ticks with half_life_months=N, cumulative convergence is ~50%.
    // (1 - λ)^N = 0.5 by definition of half-life.
    // start=0, target=1.0: after N ticks, long_rate ≈ 1 - 0.5 = 0.5.
    const N = 6;
    const params: TermStructureParams = { half_life_months: N };
    let state = makeState({ vars: { policy_rate: 1.0, long_rate: 0.0 } });
    for (let i = 0; i < N; i++) {
      state = applyTermStructure(state, params);
    }
    // After N ticks, long_rate should be ~50% of the way from 0 to 1.
    // Exact value: 1 - (1 - λ)^N = 1 - 0.5 = 0.5.
    expect(state.vars.long_rate).toBeCloseTo(0.5, 5);
  });

  // SPEC-TERM-1: EWMA convergence — long_rate approaches policy_rate asymptotically.
  it("EWMA convergence: long_rate approaches policy_rate within 1% after many months", () => {
    // SPEC-TERM-1: after sufficient months, long_rate should be within 1% of policy_rate.
    const params: TermStructureParams = { half_life_months: 6 };
    // Start far from target (0 vs 0.1).
    let state = makeState({ vars: { policy_rate: 0.1, long_rate: 0.0 } });
    // 10 half-lives of convergence: (1 - λ)^(10*6) = 0.5^10 < 0.001 — well within 1%.
    for (let i = 0; i < 60; i++) {
      state = applyTermStructure(state, params);
    }
    const policyRate = state.vars.policy_rate as number;
    const longRate = state.vars.long_rate as number;
    expect(Math.abs(longRate - policyRate)).toBeLessThan(0.001);
  });

  // SPEC-TERM-1: purity — input state must never be mutated.
  it("is a pure function: does not mutate the input state", () => {
    // SPEC-TERM-1 / SPEC-SIM-1: effects return new state, never mutate inputs.
    const state = makeState({ vars: { policy_rate: 0.08, long_rate: 0.05 } });
    const varsBefore = { ...state.vars };
    applyTermStructure(state, { half_life_months: 12 });
    expect(state.vars).toEqual(varsBefore);
  });

  // SPEC-TERM-1: EWMA formula consistency check — known initial and one tick.
  it("EWMA formula: long_rate_new = (1-λ)*prev + λ*policy_rate", () => {
    // SPEC-TERM-1: verify the exact formula with an explicit calculation.
    const halfLife = 24;
    const params: TermStructureParams = { half_life_months: halfLife };
    const prevLong = 0.04;
    const policyRate = 0.10;
    const state = makeState({ vars: { policy_rate: policyRate, long_rate: prevLong } });
    const result = applyTermStructure(state, params);
    const lambda = 1 - Math.exp(-Math.LN2 / halfLife);
    const expected = (1 - lambda) * prevLong + lambda * policyRate;
    expect(result.vars.long_rate).toBeCloseTo(expected, 10);
  });

  // SPEC-TERM-1: other vars are preserved untouched.
  it("returns new state with only long_rate updated; other vars unchanged", () => {
    // SPEC-TERM-1: spreading state and only updating long_rate.
    const state = makeState({
      vars: { policy_rate: 0.08, long_rate: 0.05, inflation: 0.03, unemployment: 0.06 },
    });
    const params: TermStructureParams = { half_life_months: 12 };
    const result = applyTermStructure(state, params);
    expect(result.vars.inflation).toBe(0.03);
    expect(result.vars.unemployment).toBe(0.06);
    expect(result.vars.policy_rate).toBe(0.08);
    // long_rate must have changed (0.05 → something closer to 0.08).
    expect(result.vars.long_rate).toBeGreaterThan(0.05);
    expect(result.vars.long_rate).toBeLessThanOrEqual(0.08);
  });
});

describe("loadTermStructureParams (SPEC-TERM-1)", () => {
  // SPEC-TERM-1: content/engine/term-structure.json loads and validates.
  it("loadTermStructureParams returns half_life_months > 0", () => {
    // SPEC-TERM-1: schema-governed content file must load cleanly.
    const params = loadTermStructureParams();
    expect(params.half_life_months).toBeGreaterThan(0);
    expect(Number.isFinite(params.half_life_months)).toBe(true);
  });
});

describe("Session.advance integration (SPEC-TERM-1)", () => {
  // SPEC-TERM-1: Session.advance(12) produces a finite long_rate var in state.
  it("Session.advance(12) produces a finite long_rate in state", () => {
    // SPEC-TERM-1: applyTermStructure is called each month inside Session.advance().
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(12);
    const longRate = session.current.vars.long_rate;
    expect(typeof longRate).toBe("number");
    expect(Number.isFinite(longRate)).toBe(true);
  });

  // SPEC-TERM-1: long_rate is between 0 and 1 after a realistic advance.
  it("Session.advance(12) long_rate is a plausible interest rate (between 0 and 1)", () => {
    // SPEC-TERM-1: long_rate should be a realistic rate in [0, 1].
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(12);
    const longRate = session.current.vars.long_rate as number;
    expect(longRate).toBeGreaterThanOrEqual(0);
    expect(longRate).toBeLessThanOrEqual(1);
  });
});
