import { describe, it, expect } from "vitest";
import {
  applyMeetingOutcome,
  expectationsAnchored,
  painMultiplier,
  applyMonthlySpiral,
  type CredibilityParams,
} from "../src/engine/credibility";
import { makeState } from "../src/engine/state";

// Common SPEC-CRED-4 params used across tests (matches content/engine/params.json#credibility).
const PARAMS: CredibilityParams = {
  anchor_threshold: 60,
  consecutive_months: 3,
  drift_per_period: 0.005,
  recovery_rate: 0.002,
  target_inflation: 0.02,
};

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

  // SPEC-CRED-2: threshold now lives in content (anchor_threshold).
  it("anchors expectations only at or above the threshold", () => {
    expect(expectationsAnchored(PARAMS.anchor_threshold, PARAMS.anchor_threshold)).toBe(true);
    expect(expectationsAnchored(PARAMS.anchor_threshold - 1, PARAMS.anchor_threshold)).toBe(false);
  });

  // SPEC-CRED-3
  it("raises the pain multiplier as credibility falls", () => {
    expect(painMultiplier(100)).toBe(1);
    expect(painMultiplier(50)).toBe(2);
    expect(painMultiplier(0)).toBe(3);
  });

  // SPEC-CRED-4
  it("below-threshold tick increments months_below_anchor counter", () => {
    const state0 = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold - 1,
        months_below_anchor: 0,
        expectations_anchor: 0.09,
      },
    });

    const state1 = applyMonthlySpiral(state0, PARAMS);
    expect(state1.vars.months_below_anchor).toBe(1);

    const state2 = applyMonthlySpiral(state1, PARAMS);
    expect(state2.vars.months_below_anchor).toBe(2);
  });

  // SPEC-CRED-4
  it("spiral activation widens the expectations gap once consecutive_months threshold is reached", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold - 1,
        months_below_anchor: PARAMS.consecutive_months - 1,
        expectations_anchor: 0.09,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.expectations_anchor).toBeGreaterThan(0.09);
    expect(next.vars.expectations_anchor).toBeCloseTo(0.09 + PARAMS.drift_per_period, 10);
  });

  // SPEC-CRED-4
  it("spiral drift pushes anchor further below target when anchor is already below target", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold - 1,
        months_below_anchor: PARAMS.consecutive_months - 1,
        expectations_anchor: 0.01,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.expectations_anchor).toBeLessThan(0.01);
    expect(next.vars.expectations_anchor).toBeCloseTo(0.01 - PARAMS.drift_per_period, 10);
  });

  // SPEC-CRED-4: documents the anchor == target edge case (drift goes upward by convention)
  it("spiral drift goes upward when anchor exactly equals target (anchor >= target ? +1 : -1)", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold - 1,
        months_below_anchor: PARAMS.consecutive_months - 1,
        expectations_anchor: PARAMS.target_inflation,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.expectations_anchor).toBeCloseTo(PARAMS.target_inflation + PARAMS.drift_per_period, 10);
  });

  // SPEC-CRED-4
  it("frozen counter on recovery: months_below_anchor stays, anchor recovers toward target", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold,
        months_below_anchor: 12,
        expectations_anchor: 0.09,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.months_below_anchor).toBe(12);
    expect(next.vars.expectations_anchor).toBeCloseTo(0.09 - PARAMS.recovery_rate, 10);
  });

  // SPEC-CRED-4
  it("recovery saturates at target_inflation and does not overshoot", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold,
        months_below_anchor: 12,
        expectations_anchor: 0.0205,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.expectations_anchor).toBe(PARAMS.target_inflation);

    const next2 = applyMonthlySpiral(next, PARAMS);
    expect(next2.vars.expectations_anchor).toBe(PARAMS.target_inflation);
  });

  // SPEC-CRED-4
  it("no-op when credibility is high and anchor is already at target", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold + 10,
        months_below_anchor: 0,
        expectations_anchor: PARAMS.target_inflation,
      },
    });

    const next = applyMonthlySpiral(state, PARAMS);
    expect(next.vars.months_below_anchor).toBe(0);
    expect(next.vars.expectations_anchor).toBe(PARAMS.target_inflation);
  });

  // SPEC-CRED-4
  it("applyMonthlySpiral does not mutate the input state", () => {
    const state = makeState({
      vars: {
        credibility: PARAMS.anchor_threshold - 1,
        months_below_anchor: 5,
        expectations_anchor: 0.09,
      },
    });
    const originalMonths = state.vars.months_below_anchor;
    const originalAnchor = state.vars.expectations_anchor;

    applyMonthlySpiral(state, PARAMS);

    expect(state.vars.months_below_anchor).toBe(originalMonths);
    expect(state.vars.expectations_anchor).toBe(originalAnchor);
  });
});
