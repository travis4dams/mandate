// SPEC-LEGACY-1
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  loadLegacyParams,
  termProgress,
  evaluateReappointment,
  computeLegacyScore,
  _resetLegacyParamsCache,
} from "../src/engine/legacy";
import type { LegacyParams } from "../src/engine/legacy";
import { makeState } from "../src/engine/state";

const SCHEMA = join(new URL(".", import.meta.url).pathname, "../schemas/legacy.schema.json");
const CONTENT = join(new URL(".", import.meta.url).pathname, "../content/engine/legacy.json");

// Inline params for pure-function tests — avoids I/O dependency.
const PARAMS: LegacyParams = {
  term_length_months: 48,
  reappointment_credibility_min: 50,
  legacy_credibility_weight: 1,
  legacy_mandate_bonus: 2,
  legacy_anchor_penalty: 0.5,
};

// ---------------------------------------------------------------------------
// Schema validation — accept/reject via AJV directly (same pattern as gen-state.test.ts)
// ---------------------------------------------------------------------------

describe("legacy.schema.json — accept/reject", () => {
  // SPEC-LEGACY-1: content file passes schema validation.
  it("accepts the canonical content/engine/legacy.json", async () => {
    // SPEC-LEGACY-1
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const { readFileSync } = await import("node:fs");
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    const validate = ajv.compile(schema);
    const content = JSON.parse(readFileSync(CONTENT, "utf8"));
    expect(validate(content)).toBe(true);
  });

  // SPEC-LEGACY-1: schema rejects a negative term_length_months (exclusiveMinimum: 0).
  it("rejects a negative term_length_months", async () => {
    // SPEC-LEGACY-1
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const { readFileSync } = await import("node:fs");
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    const validate = ajv.compile(schema);
    const bad = {
      term_length_months: -1,
      reappointment_credibility_min: 50,
      legacy_credibility_weight: 1,
      legacy_mandate_bonus: 2,
      legacy_anchor_penalty: 0.5,
    };
    expect(validate(bad)).toBe(false);
    expect(validate.errors).toBeTruthy();
  });

  // SPEC-LEGACY-1: schema rejects a zero term_length_months (exclusiveMinimum: 0 means > 0).
  it("rejects a zero term_length_months", async () => {
    // SPEC-LEGACY-1
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const { readFileSync } = await import("node:fs");
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    const validate = ajv.compile(schema);
    const bad = {
      term_length_months: 0,
      reappointment_credibility_min: 50,
      legacy_credibility_weight: 1,
      legacy_mandate_bonus: 2,
      legacy_anchor_penalty: 0.5,
    };
    expect(validate(bad)).toBe(false);
  });

  // SPEC-LEGACY-1: schema rejects an object missing a required field.
  it("rejects an object missing reappointment_credibility_min", async () => {
    // SPEC-LEGACY-1
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const { readFileSync } = await import("node:fs");
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    const validate = ajv.compile(schema);
    const incomplete = {
      term_length_months: 48,
      legacy_credibility_weight: 1,
      legacy_mandate_bonus: 2,
      legacy_anchor_penalty: 0.5,
    };
    expect(validate(incomplete)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadLegacyParams — validated content loader
// ---------------------------------------------------------------------------

describe("loadLegacyParams", () => {
  // SPEC-LEGACY-1: content file loads and passes schema validation.
  it("loads and returns a valid LegacyParams object", () => {
    // SPEC-LEGACY-1
    _resetLegacyParamsCache();
    const p = loadLegacyParams();
    expect(p).toMatchObject({
      term_length_months: expect.any(Number),
      reappointment_credibility_min: expect.any(Number),
      legacy_credibility_weight: expect.any(Number),
      legacy_mandate_bonus: expect.any(Number),
      legacy_anchor_penalty: expect.any(Number),
    });
    expect(p.term_length_months).toBeGreaterThan(0);
  });

  // SPEC-LEGACY-1: module-level cache returns the same reference on second call.
  it("returns the same cached reference on repeated calls", () => {
    // SPEC-LEGACY-1
    _resetLegacyParamsCache();
    const a = loadLegacyParams();
    const b = loadLegacyParams();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// termProgress — term arithmetic
// ---------------------------------------------------------------------------

describe("termProgress — basic term arithmetic", () => {
  // SPEC-LEGACY-1: start of game → month 0 of term 0, no reappointment due.
  it("returns correct values at month 0", () => {
    // SPEC-LEGACY-1
    const r = termProgress(0, PARAMS);
    expect(r.termLength).toBe(48);
    expect(r.termsServed).toBe(0);
    expect(r.monthsIntoTerm).toBe(0);
    expect(r.monthsToReappointment).toBe(48);
    expect(r.reappointmentDue).toBe(false);
  });

  // SPEC-LEGACY-1: mid-term — month 24 of first term.
  it("returns correct values at month 24 (mid first term)", () => {
    // SPEC-LEGACY-1
    const r = termProgress(24, PARAMS);
    expect(r.termsServed).toBe(0);
    expect(r.monthsIntoTerm).toBe(24);
    expect(r.monthsToReappointment).toBe(24);
    expect(r.reappointmentDue).toBe(false);
  });

  // SPEC-LEGACY-1: at exactly month 48 (first term boundary) reappointment is due.
  it("marks reappointmentDue at exact term boundary (month 48)", () => {
    // SPEC-LEGACY-1
    const r = termProgress(48, PARAMS);
    expect(r.reappointmentDue).toBe(true);
    expect(r.termsServed).toBe(1);
    expect(r.monthsIntoTerm).toBe(0);
    expect(r.monthsToReappointment).toBe(0);
  });

  // SPEC-LEGACY-1: second term — month 50 = 2 months into second term.
  it("returns correct values at month 50 (2 months into second term)", () => {
    // SPEC-LEGACY-1
    const r = termProgress(50, PARAMS);
    expect(r.termsServed).toBe(1);
    expect(r.monthsIntoTerm).toBe(2);
    expect(r.monthsToReappointment).toBe(46);
    expect(r.reappointmentDue).toBe(false);
  });

  // SPEC-LEGACY-1: second term boundary — month 96.
  it("marks reappointmentDue at second term boundary (month 96)", () => {
    // SPEC-LEGACY-1
    const r = termProgress(96, PARAMS);
    expect(r.reappointmentDue).toBe(true);
    expect(r.termsServed).toBe(2);
    expect(r.monthsIntoTerm).toBe(0);
  });

  // SPEC-LEGACY-1: pure — does not mutate params.
  it("does not mutate the params object", () => {
    // SPEC-LEGACY-1
    const frozen = Object.freeze({ ...PARAMS });
    expect(() => termProgress(24, frozen)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// evaluateReappointment — credibility referendum
// ---------------------------------------------------------------------------

describe("evaluateReappointment", () => {
  // SPEC-LEGACY-1: credibility >= min → reappointed.
  it("reappoints when credibility meets the minimum threshold", () => {
    // SPEC-LEGACY-1
    const state = makeState({ vars: { credibility: 60 } });
    const r = evaluateReappointment(state, PARAMS);
    expect(r.reappointed).toBe(true);
    expect(r.credibility).toBe(60);
    expect(r.threshold).toBe(50);
  });

  // SPEC-LEGACY-1: credibility exactly at minimum → reappointed (boundary inclusive).
  it("reappoints when credibility exactly equals the minimum threshold", () => {
    // SPEC-LEGACY-1
    const state = makeState({ vars: { credibility: 50 } });
    const r = evaluateReappointment(state, PARAMS);
    expect(r.reappointed).toBe(true);
  });

  // SPEC-LEGACY-1: credibility < min → not reappointed.
  it("does not reappoint when credibility is below the minimum threshold", () => {
    // SPEC-LEGACY-1
    const state = makeState({ vars: { credibility: 30 } });
    const r = evaluateReappointment(state, PARAMS);
    expect(r.reappointed).toBe(false);
    expect(r.credibility).toBe(30);
    expect(r.threshold).toBe(50);
  });

  // SPEC-LEGACY-1: pure — input state not mutated.
  it("does not mutate the input state", () => {
    // SPEC-LEGACY-1
    const state = makeState({ vars: { credibility: 70 } });
    const varsBefore = { ...state.vars };
    evaluateReappointment(state, PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  // SPEC-LEGACY-1: throws when credibility is missing from state.vars.
  it("throws when credibility is missing from state.vars", () => {
    // SPEC-LEGACY-1
    const state = makeState({ vars: {} });
    expect(() => evaluateReappointment(state, PARAMS)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeLegacyScore — composite score
// ---------------------------------------------------------------------------

describe("computeLegacyScore", () => {
  // SPEC-LEGACY-1: score formula with mandate on target and no anchor penalty.
  // score = credibility_weight * credibility + mandate_bonus * 1 * months - anchor_penalty * months_below_anchor
  // = 1*80 + 2*1*12 - 0.5*0 = 80 + 24 = 104
  it("computes correct score when mandate is on target and no months below anchor", () => {
    // SPEC-LEGACY-1
    const state = makeState({
      vars: {
        credibility: 80,
        inflation: 0.02,         // on target (within 0.005 band)
        unemployment: 0.055,     // on target (within 0.01 band)
        months_below_anchor: 0,
      },
    });
    const score = computeLegacyScore(state, 12, PARAMS);
    expect(score).toBeCloseTo(104);
  });

  // SPEC-LEGACY-1: score with mandate off target — bonus term drops to 0.
  // score = 1*80 + 2*0*12 - 0.5*0 = 80
  it("computes correct score when mandate is off target (no bonus)", () => {
    // SPEC-LEGACY-1
    const state = makeState({
      vars: {
        credibility: 80,
        inflation: 0.10,         // off target
        unemployment: 0.055,
        months_below_anchor: 0,
      },
    });
    const score = computeLegacyScore(state, 12, PARAMS);
    expect(score).toBeCloseTo(80);
  });

  // SPEC-LEGACY-1: score with anchor penalty applied.
  // score = 1*60 + 2*1*10 - 0.5*4 = 60 + 20 - 2 = 78
  it("applies anchor penalty correctly", () => {
    // SPEC-LEGACY-1
    const state = makeState({
      vars: {
        credibility: 60,
        inflation: 0.02,
        unemployment: 0.055,
        months_below_anchor: 4,
      },
    });
    const score = computeLegacyScore(state, 10, PARAMS);
    expect(score).toBeCloseTo(78);
  });

  // SPEC-LEGACY-1: months_below_anchor defaults to 0 when absent from state.vars.
  it("treats months_below_anchor as 0 when absent from state.vars", () => {
    // SPEC-LEGACY-1
    const state = makeState({
      vars: {
        credibility: 50,
        inflation: 0.02,
        unemployment: 0.055,
      },
    });
    const scoreWith = computeLegacyScore(state, 5, PARAMS);
    const stateWithZero = makeState({
      vars: { credibility: 50, inflation: 0.02, unemployment: 0.055, months_below_anchor: 0 },
    });
    const scoreZero = computeLegacyScore(stateWithZero, 5, PARAMS);
    expect(scoreWith).toBeCloseTo(scoreZero);
  });

  // SPEC-LEGACY-1: pure — input state not mutated.
  it("does not mutate the input state", () => {
    // SPEC-LEGACY-1
    const state = makeState({
      vars: { credibility: 70, inflation: 0.02, unemployment: 0.055, months_below_anchor: 0 },
    });
    const varsBefore = { ...state.vars };
    computeLegacyScore(state, 12, PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });
});
