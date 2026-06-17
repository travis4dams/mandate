// SPEC-CRISIS-1: endogenous banking crisis channel.
//
// crisisProbability is monotone above the threshold and 0 below.
// applyFinancialCrisis raises unemployment, lowers inflation/credibility/output_gap,
// and resets bank_fragility toward post_crisis_fragility.
// severityReduction softens the hit.
// Pure (input state never mutated). Deterministic (same seed → same path).

import { describe, it, expect } from "vitest";
import {
  crisisProbability,
  applyFinancialCrisis,
  loadCrisisParams,
  _resetCrisisParamsCache,
  type CrisisParams,
} from "../src/engine/crisis";
import { mulberry32 } from "../src/engine/rng";
import { makeState } from "../src/engine/state";

// A minimal CrisisParams used in most tests so we don't need the content file.
const PARAMS: CrisisParams = {
  crisis_base: 0.0,
  crisis_slope: 0.5,
  crisis_threshold: 0.4,
  severity: 0.05,
  inflation_drop: 0.01,
  credibility_drop: 5,
  output_gap_drop: 0.02,
  post_crisis_fragility: 0.2,
  severity_jitter: 0.005,
  cooldown_months: 12,
  initial_bank_fragility: 0.1,
  initial_output_gap: 0.0,
};

const BASE_VARS = {
  policy_rate: 0.05,
  inflation: 0.04,
  unemployment: 0.06,
  expectations_anchor: 0.04,
  credibility: 60,
  bank_fragility: 0.6,
  output_gap: -0.01,
};

// ── crisisProbability ────────────────────────────────────────────────────────

// SPEC-CRISIS-1: probability is 0 at or below the threshold.
describe("crisisProbability — below threshold (SPEC-CRISIS-1)", () => {
  it("returns 0 when fragility equals threshold", () => {
    // SPEC-CRISIS-1
    expect(crisisProbability(PARAMS.crisis_threshold, PARAMS)).toBe(0);
  });

  it("returns 0 when fragility is below threshold", () => {
    // SPEC-CRISIS-1
    expect(crisisProbability(0, PARAMS)).toBe(0);
    expect(crisisProbability(PARAMS.crisis_threshold - 0.01, PARAMS)).toBe(0);
  });
});

// SPEC-CRISIS-1: probability is monotone increasing above the threshold.
describe("crisisProbability — monotone above threshold (SPEC-CRISIS-1)", () => {
  it("strictly increases as fragility rises above threshold", () => {
    // SPEC-CRISIS-1
    const samples = [0.41, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    let prev = crisisProbability(samples[0]!, PARAMS);
    for (let i = 1; i < samples.length; i++) {
      const curr = crisisProbability(samples[i]!, PARAMS);
      expect(curr).toBeGreaterThan(prev);
      prev = curr;
    }
  });

  it("matches the formula: clamp(base + slope * max(0, frag - threshold), 0, 1)", () => {
    // SPEC-CRISIS-1
    const fragility = 0.7;
    const expected = Math.min(
      1,
      Math.max(
        0,
        PARAMS.crisis_base +
          PARAMS.crisis_slope * Math.max(0, fragility - PARAMS.crisis_threshold),
      ),
    );
    expect(crisisProbability(fragility, PARAMS)).toBeCloseTo(expected, 10);
  });

  it("clamps to 1 when formula would exceed 1", () => {
    // SPEC-CRISIS-1
    const highFragility = 1.0;
    const highSlope: CrisisParams = { ...PARAMS, crisis_slope: 100 };
    expect(crisisProbability(highFragility, highSlope)).toBe(1);
  });
});

// ── applyFinancialCrisis — economic impact ───────────────────────────────────

// SPEC-CRISIS-1: unemployment rises.
describe("applyFinancialCrisis — unemployment rises (SPEC-CRISIS-1)", () => {
  it("unemployment is higher than before", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(1);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment!);
  });

  it("severityReduction=1 means unemployment is unchanged", () => {
    // SPEC-CRISIS-1: fully mitigated crisis has no unemployment impact
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(1);
    const result = applyFinancialCrisis(state, 1, PARAMS, rng);
    // With severityReduction=1, employment delta = severity*(1-1)=0, plus small jitter
    // from rng — but jitter is also scaled by (1-severityReduction) so it too is 0.
    expect(result.vars.unemployment).toBeCloseTo(state.vars.unemployment!, 10);
  });
});

// SPEC-CRISIS-1: inflation drops.
describe("applyFinancialCrisis — inflation drops (SPEC-CRISIS-1)", () => {
  it("inflation is lower after a crisis", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(2);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation!);
  });

  it("inflation clamps at 0", () => {
    // SPEC-CRISIS-1: a huge inflation_drop cannot produce negative inflation
    const state = makeState({ vars: { ...BASE_VARS, inflation: 0.001 } });
    const bigDrop: CrisisParams = { ...PARAMS, inflation_drop: 100 };
    const rng = mulberry32(3);
    const result = applyFinancialCrisis(state, 0, bigDrop, rng);
    expect(result.vars.inflation).toBeGreaterThanOrEqual(0);
  });
});

// SPEC-CRISIS-1: credibility drops.
describe("applyFinancialCrisis — credibility drops (SPEC-CRISIS-1)", () => {
  it("credibility is lower after a crisis", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(4);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.credibility).toBeLessThan(state.vars.credibility!);
  });

  it("credibility clamps at 0", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS, credibility: 0 } });
    const rng = mulberry32(5);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.credibility).toBeGreaterThanOrEqual(0);
  });
});

// SPEC-CRISIS-1: output_gap drops.
describe("applyFinancialCrisis — output_gap drops (SPEC-CRISIS-1)", () => {
  it("output_gap is lower after a crisis", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rng = mulberry32(6);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.output_gap).toBeLessThan(state.vars.output_gap!);
  });
});

// SPEC-CRISIS-1: bank_fragility resets toward post_crisis_fragility.
describe("applyFinancialCrisis — fragility reset (SPEC-CRISIS-1)", () => {
  it("bank_fragility is set to post_crisis_fragility after a crisis", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS, bank_fragility: 0.8 } });
    const rng = mulberry32(7);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.bank_fragility).toBe(PARAMS.post_crisis_fragility);
  });
});

// ── severityReduction softens the hit ────────────────────────────────────────

// SPEC-CRISIS-1: severityReduction makes the unemployment hit smaller.
describe("applyFinancialCrisis — severityReduction softens impact (SPEC-CRISIS-1)", () => {
  it("higher severityReduction leads to smaller unemployment increase", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rngA = mulberry32(10);
    const rngB = mulberry32(10);
    const noMitigation = applyFinancialCrisis(state, 0, PARAMS, rngA);
    const withMitigation = applyFinancialCrisis(state, 0.5, PARAMS, rngB);
    const deltaNoMit = noMitigation.vars.unemployment! - state.vars.unemployment!;
    const deltaWithMit = withMitigation.vars.unemployment! - state.vars.unemployment!;
    expect(deltaWithMit).toBeLessThan(deltaNoMit);
  });
});

// ── purity ───────────────────────────────────────────────────────────────────

// SPEC-CRISIS-1: pure — input state must not be mutated.
describe("applyFinancialCrisis — purity (SPEC-CRISIS-1)", () => {
  it("does not mutate input state.vars", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const originalVars = { ...state.vars };
    const rng = mulberry32(11);
    applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(state.vars).toEqual(originalVars);
  });

  it("does not mutate input state.flags", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS }, flags: { some_flag: true } });
    const originalFlags = { ...state.flags };
    const rng = mulberry32(12);
    applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(state.flags).toEqual(originalFlags);
  });
});

// ── determinism ──────────────────────────────────────────────────────────────

// SPEC-CRISIS-1: two rng instances from the same seed produce identical results.
describe("applyFinancialCrisis — determinism (SPEC-CRISIS-1)", () => {
  it("same seed → same output", () => {
    // SPEC-CRISIS-1
    const state = makeState({ vars: { ...BASE_VARS } });
    const rngA = mulberry32(42);
    const rngB = mulberry32(42);
    const a = applyFinancialCrisis(state, 0, PARAMS, rngA);
    const b = applyFinancialCrisis(state, 0, PARAMS, rngB);
    expect(a.vars).toEqual(b.vars);
  });

  it("different seeds produce different unemployment outcomes", () => {
    // SPEC-CRISIS-1: jitter means seeds diverge
    const state = makeState({ vars: { ...BASE_VARS } });
    const rngA = mulberry32(1);
    const rngB = mulberry32(2);
    const a = applyFinancialCrisis(state, 0, PARAMS, rngA);
    const b = applyFinancialCrisis(state, 0, PARAMS, rngB);
    // With jitter=0.005, the unemployment values will differ between seeds
    expect(a.vars.unemployment).not.toBe(b.vars.unemployment);
  });
});

// ── valid-range clamping ──────────────────────────────────────────────────────

// SPEC-CRISIS-1: unemployment clamps at 0 (floor).
describe("applyFinancialCrisis — unemployment clamp (SPEC-CRISIS-1)", () => {
  it("unemployment never goes negative", () => {
    // SPEC-CRISIS-1: edge case — params can't produce negative unemployment via
    // severity, but belt-and-suspenders clamping is still correct.
    const state = makeState({ vars: { ...BASE_VARS, unemployment: 0 } });
    const rng = mulberry32(99);
    const result = applyFinancialCrisis(state, 0, PARAMS, rng);
    expect(result.vars.unemployment).toBeGreaterThanOrEqual(0);
  });
});

// ── content loader ───────────────────────────────────────────────────────────

// SPEC-CRISIS-1: loadCrisisParams loads and validates from disk.
describe("loadCrisisParams (SPEC-CRISIS-1)", () => {
  it("loads a valid CrisisParams from content/engine/crisis.json", () => {
    // SPEC-CRISIS-1
    _resetCrisisParamsCache();
    const params = loadCrisisParams();
    expect(typeof params.crisis_base).toBe("number");
    expect(typeof params.crisis_slope).toBe("number");
    expect(typeof params.crisis_threshold).toBe("number");
    expect(typeof params.severity).toBe("number");
    expect(typeof params.post_crisis_fragility).toBe("number");
    expect(params.crisis_threshold).toBeGreaterThanOrEqual(0);
    expect(params.crisis_threshold).toBeLessThanOrEqual(1);
    expect(params.post_crisis_fragility).toBeGreaterThanOrEqual(0);
    expect(params.post_crisis_fragility).toBeLessThanOrEqual(1);
  });

  it("second call returns the same cached reference", () => {
    // SPEC-CRISIS-1
    _resetCrisisParamsCache();
    const first = loadCrisisParams();
    const second = loadCrisisParams();
    expect(second).toBe(first);
  });
});
