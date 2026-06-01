import { describe, it, expect } from "vitest";
import {
  applyMeetingOutcome,
  expectationsAnchored,
  painMultiplier,
  ANCHOR_THRESHOLD,
  applyMonthlySpiral,
  type CredibilityParams,
} from "../src/engine/credibility";
import { makeState } from "../src/engine/state";

describe("credibility", () => {
  // SPEC-CRED-1
  it("erodes on dissents and surprises, builds on on-target outcomes", () => {
    expect(applyMeetingOutcome(70, { dissents: 3, surprisedMarkets: true, onTarget: false })).toBe(59);
    expect(applyMeetingOutcome(70, { dissents: 0, surprisedMarkets: false, onTarget: true })).toBe(73);
  });

  // SPEC-CRED-1
  it("clamps to [0, 100]", () => {
    expect(applyMeetingOutcome(2, { dissents: 9, surprisedMarkets: true, onTarget: false })).toBe(0);
    expect(applyMeetingOutcome(99, { dissents: 0, surprisedMarkets: false, onTarget: true })).toBe(100);
  });

  // SPEC-CRED-2
  it("anchors expectations only at or above the threshold", () => {
    expect(expectationsAnchored(ANCHOR_THRESHOLD)).toBe(true);
    expect(expectationsAnchored(ANCHOR_THRESHOLD - 1)).toBe(false);
  });

  // SPEC-CRED-3
  it("raises the pain multiplier as credibility falls", () => {
    expect(painMultiplier(100)).toBe(1);
    expect(painMultiplier(50)).toBe(2);
    expect(painMultiplier(0)).toBe(3);
  });

  // SPEC-CRED-4: de-anchoring spiral — below-threshold ticks increment counter
  it("below-threshold tick increments months_below_anchor counter", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    const state0 = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD - 1, // below threshold
        months_below_anchor: 0,
        expectations_anchor: 0.09,
      },
    });

    const state1 = applyMonthlySpiral(state0, params);
    expect(state1.vars.months_below_anchor).toBe(1);

    const state2 = applyMonthlySpiral(state1, params);
    expect(state2.vars.months_below_anchor).toBe(2);
  });

  // SPEC-CRED-4: once consecutive_months is reached, expectations_anchor drifts away from target
  it("spiral activation widens the expectations gap once consecutive_months threshold is reached", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    // anchor is above target (0.09 > 0.02), so drift pushes it further away (upward)
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD - 1,
        months_below_anchor: params.consecutive_months - 1, // next tick triggers spiral
        expectations_anchor: 0.09,
      },
    });

    const next = applyMonthlySpiral(state, params);
    // anchor was above target, drift should go further above target
    expect(next.vars.expectations_anchor).toBeGreaterThan(0.09);
    expect(next.vars.expectations_anchor).toBeCloseTo(0.09 + params.drift_per_period, 10);
  });

  // SPEC-CRED-4: drift also works when anchor is below target (pushed further below)
  it("spiral drift pushes anchor further below target when anchor is already below target", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    // anchor is below target (0.01 < 0.02), drift should push it further below
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD - 1,
        months_below_anchor: params.consecutive_months - 1,
        expectations_anchor: 0.01,
      },
    });

    const next = applyMonthlySpiral(state, params);
    expect(next.vars.expectations_anchor).toBeLessThan(0.01);
    expect(next.vars.expectations_anchor).toBeCloseTo(0.01 - params.drift_per_period, 10);
  });

  // SPEC-CRED-4: months_below_anchor is frozen (not reset) on recovery; anchor moves toward target
  it("frozen counter on recovery: months_below_anchor stays, anchor recovers toward target", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD, // at threshold = recovered
        months_below_anchor: 12,       // was deep in spiral
        expectations_anchor: 0.09,     // above target
      },
    });

    const next = applyMonthlySpiral(state, params);
    // counter is FROZEN, not reset
    expect(next.vars.months_below_anchor).toBe(12);
    // anchor moves toward target (0.02) by recovery_rate
    expect(next.vars.expectations_anchor).toBeCloseTo(0.09 - params.recovery_rate, 10);
  });

  // SPEC-CRED-4: recovery saturates at target — no overshoot
  it("recovery saturates at target_inflation and does not overshoot", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    // anchor is very close to target — gap smaller than recovery_rate
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD,
        months_below_anchor: 12,
        expectations_anchor: 0.0205, // 0.0005 above target, less than recovery_rate of 0.002
      },
    });

    const next = applyMonthlySpiral(state, params);
    // should clamp to exactly target, not overshoot below
    expect(next.vars.expectations_anchor).toBe(params.target_inflation);

    // run another tick — already at target, should stay
    const next2 = applyMonthlySpiral(next, params);
    expect(next2.vars.expectations_anchor).toBe(params.target_inflation);
  });

  // SPEC-CRED-4: no-op when credibility >= threshold AND no gap exists
  it("no-op when credibility is high and anchor is already at target", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD + 10,
        months_below_anchor: 0,
        expectations_anchor: params.target_inflation,
      },
    });

    const next = applyMonthlySpiral(state, params);
    expect(next.vars.months_below_anchor).toBe(0);
    expect(next.vars.expectations_anchor).toBe(params.target_inflation);
  });

  // SPEC-CRED-4: pure function — does not mutate input state
  it("applyMonthlySpiral does not mutate the input state", () => {
    // SPEC-CRED-4
    const params: CredibilityParams = {
      consecutive_months: 3,
      drift_per_period: 0.005,
      recovery_rate: 0.002,
      target_inflation: 0.02,
    };
    const state = makeState({
      vars: {
        credibility: ANCHOR_THRESHOLD - 1,
        months_below_anchor: 5,
        expectations_anchor: 0.09,
      },
    });
    const originalMonths = state.vars.months_below_anchor;
    const originalAnchor = state.vars.expectations_anchor;

    applyMonthlySpiral(state, params);

    expect(state.vars.months_below_anchor).toBe(originalMonths);
    expect(state.vars.expectations_anchor).toBe(originalAnchor);
  });
});
