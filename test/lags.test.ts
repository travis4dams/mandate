// SPEC-LAG-1: distributed-lag kernel tests.
import { describe, it, expect, beforeEach } from "vitest";
import { applyRateToOutputGap, loadLagParams, _resetLagParamsCache, type LagParams } from "../src/engine/lags";
import { applyMacroDynamics, type MacroDynamicsParams } from "../src/engine/dynamics";
import { Session } from "../src/engine/session";
import { makeState } from "../src/engine/state";
import type { GameStateSnapshot } from "../src/engine/state";

// SPEC-LAG-1: reset cache before each test to avoid cross-test state.
beforeEach(() => {
  _resetLagParamsCache();
});

/** Build a minimal snapshot with the given policy_rate and expectations_anchor. */
function makeSnap(policy_rate: number, expectations_anchor: number, date = "1979-08"): GameStateSnapshot {
  return { date, vars: { policy_rate, expectations_anchor }, flags: {} };
}

// Simple exponentially-decaying params for unit tests (independent of content file).
const TEST_PARAMS: LagParams = {
  policy_to_output_gap: [0.5, 0.3, 0.2],
};

const REAL_NEUTRAL = 0.027;

describe("applyRateToOutputGap (SPEC-LAG-1)", () => {
  it("zero trajectory produces zero output_gap", () => {
    // SPEC-LAG-1: no history → output_gap = 0.
    const state = makeState({ vars: { policy_rate: 0.1, expectations_anchor: 0.05 } });
    const result = applyRateToOutputGap(state, [], TEST_PARAMS, REAL_NEUTRAL);
    expect(result.vars.output_gap).toBe(0);
  });

  it("single snapshot: output_gap ≈ weights[0] * realGap", () => {
    // SPEC-LAG-1: one entry → only weights[0] contributes.
    const policy_rate = 0.10;
    const expectations_anchor = 0.05;
    const realGap = (policy_rate - expectations_anchor) - REAL_NEUTRAL;
    const expectedOutputGap = TEST_PARAMS.policy_to_output_gap[0]! * realGap;

    const state = makeState({ vars: { policy_rate: 0.05, expectations_anchor: 0.02 } });
    const snap = makeSnap(policy_rate, expectations_anchor);
    const result = applyRateToOutputGap(state, [snap], TEST_PARAMS, REAL_NEUTRAL);
    expect(result.vars.output_gap).toBeCloseTo(expectedOutputGap, 10);
  });

  it("longer-than-N trajectory is trimmed to the last N entries", () => {
    // SPEC-LAG-1: weights has 3 entries, so only the last 3 snapshots are used.
    // Build 5 snapshots: first two have zero realGap, last three have positive realGap.
    const zeroSnap = makeSnap(REAL_NEUTRAL + 0.05, 0.05); // realGap = 0
    const posSnap = makeSnap(0.12, 0.05); // realGap = 0.12 - 0.05 - 0.027 = 0.043

    const trajectory = [zeroSnap, zeroSnap, posSnap, posSnap, posSnap];
    const state = makeState({ vars: {} });
    // Only last 3 (all posSnap) should be included.
    const result = applyRateToOutputGap(state, trajectory, TEST_PARAMS, REAL_NEUTRAL);

    const posRealGap = (0.12 - 0.05) - REAL_NEUTRAL;
    const expectedOutputGap =
      TEST_PARAMS.policy_to_output_gap[0]! * posRealGap +
      TEST_PARAMS.policy_to_output_gap[1]! * posRealGap +
      TEST_PARAMS.policy_to_output_gap[2]! * posRealGap;
    expect(result.vars.output_gap).toBeCloseTo(expectedOutputGap, 10);
  });

  it("snapshot missing policy_rate is skipped (contributes 0)", () => {
    // SPEC-LAG-1: a snapshot without required vars is silently skipped.
    const badSnap: GameStateSnapshot = { date: "1979-08", vars: { expectations_anchor: 0.05 }, flags: {} };
    const state = makeState({ vars: {} });
    // Should not throw; badSnap at k=0 contributes 0, so output_gap = 0.
    const result = applyRateToOutputGap(state, [badSnap], TEST_PARAMS, REAL_NEUTRAL);
    expect(result.vars.output_gap).toBe(0);
  });

  it("snapshot missing expectations_anchor is skipped (contributes 0)", () => {
    // SPEC-LAG-1: a snapshot without expectations_anchor is silently skipped.
    const badSnap: GameStateSnapshot = { date: "1979-08", vars: { policy_rate: 0.1 }, flags: {} };
    const state = makeState({ vars: {} });
    const result = applyRateToOutputGap(state, [badSnap], TEST_PARAMS, REAL_NEUTRAL);
    expect(result.vars.output_gap).toBe(0);
  });

  it("6-month half-life convergence: output_gap >= 50% of long-run value after 6 months of constant positive gap", () => {
    // SPEC-LAG-1: apply a constant positive realGap = 0.05 for 6 months.
    // Long-run value = 0.05 (if all history had the same gap and weights sum to 1).
    // After 6 months, cumulative weight of the 6 most-recent entries should be >= 50%.
    // This tests the ~6-month half-life property.
    const lagParams = loadLagParams();
    const constantRealGap = 0.05;
    // realGap = (policy_rate - expectations_anchor) - realNeutralRate
    // So policy_rate = expectations_anchor + realNeutralRate + constantRealGap
    const expectations_anchor = 0.05;
    const policy_rate = expectations_anchor + REAL_NEUTRAL + constantRealGap; // = 0.05 + 0.027 + 0.05 = 0.127

    // Build 6 snapshots all with the same policy_rate / expectations_anchor.
    const snaps: GameStateSnapshot[] = Array.from({ length: 6 }, (_, i) =>
      makeSnap(policy_rate, expectations_anchor, `1979-0${i + 1}`)
    );

    const state = makeState({ vars: {} });
    const result = applyRateToOutputGap(state, snaps, lagParams, REAL_NEUTRAL);

    // The long-run value is constantRealGap (= 0.05) if weights sum to 1 and all history had the same gap.
    const longRun = constantRealGap;
    expect(result.vars.output_gap).toBeGreaterThanOrEqual(longRun * 0.5);
  });

  it("is a pure function: does not mutate the input state", () => {
    // SPEC-LAG-1 / SPEC-SIM-1: effects return new state, never mutate inputs.
    const snap = makeSnap(0.10, 0.05);
    const state = makeState({ vars: { policy_rate: 0.05, inflation: 0.03 } });
    const varsBefore = { ...state.vars };
    applyRateToOutputGap(state, [snap], TEST_PARAMS, REAL_NEUTRAL);
    expect(state.vars).toEqual(varsBefore);
  });

  it("determinism: same trajectory + same params → same output_gap", () => {
    // SPEC-LAG-1 / SPEC-SIM-1: deterministic — no random state.
    const lagParams = loadLagParams();
    const snaps = [makeSnap(0.12, 0.05), makeSnap(0.10, 0.04), makeSnap(0.11, 0.05)];
    const state = makeState({ vars: {} });
    const r1 = applyRateToOutputGap(state, snaps, lagParams, REAL_NEUTRAL);
    const r2 = applyRateToOutputGap(state, snaps, lagParams, REAL_NEUTRAL);
    expect(r1.vars.output_gap).toBe(r2.vars.output_gap);
  });

  it("loadLagParams loads content/engine/lags.json: length 24, sums to 1 ±0.001", () => {
    // SPEC-LAG-1: real content file loads without error and satisfies the schema constraint.
    const params = loadLagParams();
    expect(params.policy_to_output_gap).toHaveLength(24);
    const sum = params.policy_to_output_gap.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });
});

// Macro-dynamics params matching content files, used by items 2 and 3.
const MACRO_PARAMS: MacroDynamicsParams = {
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
  credibility_soft_ceiling: 85,
  credibility_drain_rate: 0.15,
};

const BASE_VARS = {
  policy_rate: 0.05,
  inflation: 0.05,
  unemployment: 0.0645,
  expectations_anchor: 0.05,
  credibility: 50,
};

describe("applyMacroDynamics uses output_gap when present (SPEC-LAG-1)", () => {
  it("state with output_gap=0.20 produces different unemployment than state without output_gap", () => {
    // SPEC-LAG-1: dynamics.ts must branch on output_gap when present.
    // A large positive output_gap (0.20) drives a much higher unemployment equilibrium
    // than the immediate realGap (≈0 here), so the two states must diverge.
    const stateWith = makeState({ vars: { ...BASE_VARS, output_gap: 0.20 } });
    const stateWithout = makeState({ vars: { ...BASE_VARS } });
    const resultWith = applyMacroDynamics(stateWith, MACRO_PARAMS);
    const resultWithout = applyMacroDynamics(stateWithout, MACRO_PARAMS);
    expect(resultWith.vars.unemployment).not.toBeCloseTo(resultWithout.vars.unemployment as number, 10);
  });
});

describe("Session.advance sets output_gap on state (SPEC-LAG-1)", () => {
  it("output_gap is a finite number after one advance step", () => {
    // SPEC-LAG-1: applyRateToOutputGap must write a finite output_gap onto the state.
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(1);
    const gap = session.current.vars.output_gap;
    expect(typeof gap).toBe("number");
    expect(Number.isFinite(gap)).toBe(true);
  });
});
