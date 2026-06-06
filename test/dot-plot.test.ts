import { describe, it, expect, afterEach } from "vitest";
import { makeState } from "../src/engine/state.js";
import { adoptDoctrine } from "../src/engine/doctrine.js";
import type { DoctrineEntry } from "../src/content/doctrines.js";
import {
  computeVoteSpread,
  applyDotPlotMeetingEffects,
  loadDotPlotParams,
  _resetDotPlotParamsCache,
  type DotPlotParams,
} from "../src/engine/dot-plot.js";
import type { MemberVotePreview } from "../src/engine/fomc.js";

// SPEC-DOCT-2

// Minimal doctrine entry matching the dot-plot content ID (used to adopt the doctrine in tests).
const DOT_PLOT_DOCTRINE: DoctrineEntry = {
  id: "doctrine.dot_plot",
  name: "doctrine.dot_plot.name",
  standing_effects: [],
  flip_flop_cost: 5,
};

const PARAMS: DotPlotParams = {
  anchoring_bonus: 1.5,
  exposure_per_pp: 0.4,
  dissent_multiplier: 1.5,
  spread_threshold: 0.005,
};

function makePreview(preferred: number, wouldDissent: boolean): MemberVotePreview {
  return { memberId: "m1", nameKey: "key", preferred, wouldDissent };
}

afterEach(() => {
  _resetDotPlotParamsCache();
});

// ── computeVoteSpread ─────────────────────────────────────────────────────────

describe("computeVoteSpread", () => {
  // SPEC-DOCT-2
  it("returns 0 for an empty preview array", () => {
    expect(computeVoteSpread([])).toBe(0);
  });

  // SPEC-DOCT-2
  it("returns 0 for a single member", () => {
    expect(computeVoteSpread([makePreview(0.05, false)])).toBe(0);
  });

  // SPEC-DOCT-2
  it("computes max − min of preferred rates", () => {
    const previews = [
      makePreview(0.04, false),
      makePreview(0.07, false),
      makePreview(0.05, false),
    ];
    expect(computeVoteSpread(previews)).toBeCloseTo(0.03, 10);
  });

  // SPEC-DOCT-2
  it("is non-negative for any valid inputs", () => {
    const previews = [makePreview(0.08, false), makePreview(0.02, false)];
    expect(computeVoteSpread(previews)).toBeGreaterThan(0);
  });
});

// ── applyDotPlotMeetingEffects ────────────────────────────────────────────────

describe("applyDotPlotMeetingEffects", () => {
  // SPEC-DOCT-2: no-op when doctrine is not adopted
  it("returns state unchanged when not adopted", () => {
    const state = makeState({ vars: { credibility: 60 } });
    const previews = [makePreview(0.04, false), makePreview(0.07, true)];
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, false);
    expect(result).toBe(state);
  });

  // SPEC-DOCT-2: anchoring bonus applied when adopted and spread ≤ threshold
  it("grants anchoring bonus when spread is below threshold", () => {
    const base = makeState({ vars: { credibility: 50 } });
    const state = adoptDoctrine(base, DOT_PLOT_DOCTRINE);
    // spread = 0.003 < threshold 0.005 → no exposure cost, only bonus
    const previews = [makePreview(0.05, false), makePreview(0.053, false)];
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(result.vars.credibility).toBeCloseTo(50 + PARAMS.anchoring_bonus, 10);
  });

  // SPEC-DOCT-2: spread-exposure cost applied when spread > threshold, no dissent
  it("charges spread-exposure cost without dissent multiplier", () => {
    const state = makeState({ vars: { credibility: 50 } });
    // spread = 0.01 (100bp) > threshold 0.005, no dissenters
    const previews = [makePreview(0.04, false), makePreview(0.05, false)];
    const spread = 0.01;
    const expectedCost = spread * 100 * PARAMS.exposure_per_pp;
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(result.vars.credibility).toBeCloseTo(50 + PARAMS.anchoring_bonus - expectedCost, 10);
  });

  // SPEC-DOCT-2: dissent multiplier amplifies exposure when at least one dissenter
  it("applies dissent multiplier when dissenters are present", () => {
    const state = makeState({ vars: { credibility: 50 } });
    // spread = 0.01 (100bp) > threshold; one dissenter
    const previews = [makePreview(0.04, true), makePreview(0.05, false)];
    const spread = 0.01;
    const expectedCost = spread * 100 * PARAMS.exposure_per_pp * PARAMS.dissent_multiplier;
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(result.vars.credibility).toBeCloseTo(50 + PARAMS.anchoring_bonus - expectedCost, 10);
  });

  // SPEC-DOCT-2: net is more negative for dissent than consensus at the same spread
  it("dissent scenario incurs higher net cost than no-dissent at equal spread", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const previews_nodissent = [makePreview(0.04, false), makePreview(0.05, false)];
    const previews_dissent = [makePreview(0.04, true), makePreview(0.05, false)];
    const r_no = applyDotPlotMeetingEffects(state, previews_nodissent, PARAMS, true);
    const r_dis = applyDotPlotMeetingEffects(state, previews_dissent, PARAMS, true);
    expect(r_dis.vars.credibility).toBeLessThan(r_no.vars.credibility as number);
  });

  // SPEC-DOCT-2: credibility clamped to [0, 100]
  it("clamps credibility at 0 when cost exceeds current value", () => {
    const state = makeState({ vars: { credibility: 0 } });
    // very wide spread with dissent should floor at 0, not go negative
    const previews = [makePreview(0.0, true), makePreview(0.5, false)];
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(result.vars.credibility).toBeGreaterThanOrEqual(0);
  });

  // SPEC-DOCT-2: credibility clamped at 100
  it("clamps credibility at 100 when bonus would exceed maximum", () => {
    const state = makeState({ vars: { credibility: 100 } });
    // spread below threshold → only bonus, but already at 100
    const previews = [makePreview(0.05, false), makePreview(0.052, false)];
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(result.vars.credibility).toBe(100);
  });

  // SPEC-DOCT-2: does not mutate input state
  it("does not mutate the input state", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const credBefore = state.vars.credibility;
    const previews = [makePreview(0.04, false), makePreview(0.06, true)];
    applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    expect(state.vars.credibility).toBe(credBefore);
  });

  // SPEC-DOCT-2: threshold boundary — spread exactly at threshold incurs no exposure cost
  it("does not charge exposure cost when spread equals threshold exactly", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const previews = [makePreview(0.05, false), makePreview(0.055, false)]; // spread = 0.005 = threshold
    const result = applyDotPlotMeetingEffects(state, previews, PARAMS, true);
    // Only bonus, no cost
    expect(result.vars.credibility).toBeCloseTo(50 + PARAMS.anchoring_bonus, 10);
  });
});

// ── loadDotPlotParams ─────────────────────────────────────────────────────────

describe("loadDotPlotParams", () => {
  // SPEC-DOCT-2
  it("loads params from content file without throwing", () => {
    expect(() => loadDotPlotParams()).not.toThrow();
  });

  // SPEC-DOCT-2
  it("returns a cached reference on second call", () => {
    const a = loadDotPlotParams();
    const b = loadDotPlotParams();
    expect(a).toBe(b);
  });

  // SPEC-DOCT-2
  it("loaded params have all required fields as finite positive numbers", () => {
    const p = loadDotPlotParams();
    expect(Number.isFinite(p.anchoring_bonus)).toBe(true);
    expect(Number.isFinite(p.exposure_per_pp)).toBe(true);
    expect(Number.isFinite(p.dissent_multiplier)).toBe(true);
    expect(Number.isFinite(p.spread_threshold)).toBe(true);
    expect(p.dissent_multiplier).toBeGreaterThanOrEqual(1);
    expect(p.spread_threshold).toBeGreaterThanOrEqual(0);
  });
});
