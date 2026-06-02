import { describe, it, expect } from "vitest";
import { applyMonthlySpiral, loadCredibilityParams } from "../src/engine/credibility.js";
import { makeState } from "../src/engine/state.js";

// SPEC-GUIDE-1: unit tests for the forward-guidance stance multiplier on the spiral recovery path.

// Helper: build a high-credibility state where recovery mode activates (credibility >= 60).
function makeRecoveryState(expectationsAnchor: number): ReturnType<typeof makeState> {
  // SPEC-GUIDE-1
  return makeState({
    date: "1979-08",
    vars: {
      credibility: 80,
      expectations_anchor: expectationsAnchor,
      months_below_anchor: 0,
      policy_rate: 0.10,
      inflation: 0.05,
      unemployment: 0.06,
    },
  });
}

describe("SPEC-GUIDE-1: stanceMultiplier unit tests via applyMonthlySpiral with crafted params", () => {
  // SPEC-GUIDE-1: hawkish multiplier (1.5x) closes the gap faster than neutral (1.0x).
  it("hawkish recovery_rate closes expectations_anchor gap to target_inflation faster than neutral over 10 steps", () => {
    // SPEC-GUIDE-1
    const base = loadCredibilityParams();
    const startAnchor = 0.09; // above target 0.02 — anchor must fall toward target
    const target = base.target_inflation; // 0.02

    const hawkishParams = { ...base, recovery_rate: base.recovery_rate * 1.5 };
    const neutralParams = { ...base, recovery_rate: base.recovery_rate * 1.0 };

    let hawkishState = makeRecoveryState(startAnchor);
    let neutralState = makeRecoveryState(startAnchor);

    for (let i = 0; i < 10; i++) {
      hawkishState = applyMonthlySpiral(hawkishState, hawkishParams);
      neutralState = applyMonthlySpiral(neutralState, neutralParams);
    }

    const hawkishGap = Math.abs(hawkishState.vars.expectations_anchor - target);
    const neutralGap = Math.abs(neutralState.vars.expectations_anchor - target);

    // hawkish recovers faster — its remaining gap must be strictly smaller.
    expect(hawkishGap).toBeLessThan(neutralGap);
  });

  // SPEC-GUIDE-1: dovish multiplier (0.7x) closes the gap slower than neutral (1.0x).
  it("dovish recovery_rate closes expectations_anchor gap to target_inflation slower than neutral over 10 steps", () => {
    // SPEC-GUIDE-1
    const base = loadCredibilityParams();
    const startAnchor = 0.09;
    const target = base.target_inflation;

    const dovishParams = { ...base, recovery_rate: base.recovery_rate * 0.7 };
    const neutralParams = { ...base, recovery_rate: base.recovery_rate * 1.0 };

    let dovishState = makeRecoveryState(startAnchor);
    let neutralState = makeRecoveryState(startAnchor);

    for (let i = 0; i < 10; i++) {
      dovishState = applyMonthlySpiral(dovishState, dovishParams);
      neutralState = applyMonthlySpiral(neutralState, neutralParams);
    }

    const dovishGap = Math.abs(dovishState.vars.expectations_anchor - target);
    const neutralGap = Math.abs(neutralState.vars.expectations_anchor - target);

    // dovish recovers slower — its remaining gap must be strictly larger.
    expect(dovishGap).toBeGreaterThan(neutralGap);
  });

  // SPEC-GUIDE-1: hawkish is strictly faster than dovish over 10 steps.
  it("hawkish recovery is strictly faster than dovish over 10 steps", () => {
    // SPEC-GUIDE-1
    const base = loadCredibilityParams();
    const startAnchor = 0.09;
    const target = base.target_inflation;

    const hawkishParams = { ...base, recovery_rate: base.recovery_rate * 1.5 };
    const dovishParams = { ...base, recovery_rate: base.recovery_rate * 0.7 };

    let hawkishState = makeRecoveryState(startAnchor);
    let dovishState = makeRecoveryState(startAnchor);

    for (let i = 0; i < 10; i++) {
      hawkishState = applyMonthlySpiral(hawkishState, hawkishParams);
      dovishState = applyMonthlySpiral(dovishState, dovishParams);
    }

    const hawkishAnchor = hawkishState.vars.expectations_anchor;
    const dovishAnchor = dovishState.vars.expectations_anchor;

    // Both started above target; hawkish is closer — its anchor is strictly lower.
    expect(hawkishAnchor).toBeLessThan(dovishAnchor);
  });

  // SPEC-GUIDE-1: verify specific numeric convergence for hawkish after 10 steps.
  it("hawkish: expectations_anchor after 10 steps is closer to target_inflation than start", () => {
    // SPEC-GUIDE-1
    const base = loadCredibilityParams();
    const startAnchor = 0.09;
    const target = base.target_inflation;
    const hawkishParams = { ...base, recovery_rate: base.recovery_rate * 1.5 };

    let state = makeRecoveryState(startAnchor);
    for (let i = 0; i < 10; i++) {
      state = applyMonthlySpiral(state, hawkishParams);
    }

    // After 10 steps at 0.003/month: anchor should be approx 0.09 - 10*0.003 = 0.06.
    expect(state.vars.expectations_anchor).toBeCloseTo(0.06, 4);
    expect(Math.abs(state.vars.expectations_anchor - target)).toBeLessThan(Math.abs(startAnchor - target));
  });
});
