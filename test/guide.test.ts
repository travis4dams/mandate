import { describe, it, expect, afterEach } from "vitest";
import {
  applyMacroDynamics,
  loadDynamicsParams,
  _resetDynamicsParamsCache,
  type MacroDynamicsParams,
} from "../src/engine/dynamics.js";
import { makeState } from "../src/engine/state.js";

// Defensive hygiene: loadDynamicsParams() caches a read-through merge of the param files.
// These tests don't mock the loader, but resetting after each keeps the cache from leaking
// into any future test that does (per PR #34 review).
afterEach(() => {
  _resetDynamicsParamsCache();
});

// SPEC-GUIDE-1: the forward-guidance stance scales `expectations_anchor_pull`. Here we verify
// the underlying lever directly: a larger pull (hawkish) re-anchors expectations toward target
// faster than neutral, and dovish (smaller pull) slower. Session.advance() wiring of the stance
// multiplier itself is covered in test/session.test.ts.

// High-credibility state so the re-anchoring pull term dominates the adaptive term, with policy
// at the neutral real rate (anchor + r*) so the macro stays well-behaved over the run.
function makeRecoveryState(anchor: number, params: MacroDynamicsParams): ReturnType<typeof makeState> {
  return makeState({
    date: "1979-08",
    vars: {
      credibility: 90,
      expectations_anchor: anchor,
      months_below_anchor: 0,
      policy_rate: anchor + params.real_neutral_rate,
      inflation: anchor,
      unemployment: params.unemployment_natural_rate,
    },
  });
}

function anchorAfter10(pullMultiplier: number): number {
  const base = loadDynamicsParams();
  const params = { ...base, expectations_anchor_pull: base.expectations_anchor_pull * pullMultiplier };
  let state = makeRecoveryState(0.09, params); // anchor starts well above target 0.02
  for (let i = 0; i < 10; i++) state = applyMacroDynamics(state, params);
  return state.vars.expectations_anchor;
}

describe("SPEC-GUIDE-1: stance scales the expectations re-anchoring pull", () => {
  it("hawkish (larger pull) re-anchors toward target faster than neutral over 10 steps", () => {
    // SPEC-GUIDE-1
    const target = loadDynamicsParams().target_inflation;
    const hawkishGap = Math.abs(anchorAfter10(1.5) - target);
    const neutralGap = Math.abs(anchorAfter10(1.0) - target);
    expect(hawkishGap).toBeLessThan(neutralGap);
  });

  it("dovish (smaller pull) re-anchors toward target slower than neutral over 10 steps", () => {
    // SPEC-GUIDE-1
    const target = loadDynamicsParams().target_inflation;
    const dovishGap = Math.abs(anchorAfter10(0.7) - target);
    const neutralGap = Math.abs(anchorAfter10(1.0) - target);
    expect(dovishGap).toBeGreaterThan(neutralGap);
  });

  it("hawkish is strictly faster than dovish over 10 steps", () => {
    // SPEC-GUIDE-1: both start above target; hawkish ends strictly lower (closer to target).
    expect(anchorAfter10(1.5)).toBeLessThan(anchorAfter10(0.7));
  });

  it("re-anchoring always moves the anchor toward target", () => {
    // SPEC-GUIDE-1
    const target = loadDynamicsParams().target_inflation;
    expect(Math.abs(anchorAfter10(1.0) - target)).toBeLessThan(Math.abs(0.09 - target));
  });
});
