// SPEC-PROD-1: productivity drift state variable
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyProductivityDrift,
  loadProductivityParams,
  _resetProductivityParamsCache,
  type ProductivityParams,
} from "../src/engine/productivity";
import { makeState } from "../src/engine/state";
import { Session } from "../src/engine/session";
import { registerContentFile, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

const BASE_PARAMS: ProductivityParams = { monthly_drift_rate: 0.002 };

beforeEach(() => {
  _resetProductivityParamsCache();
  _resetValidateFileCache();
  _resetRegistries();
});

describe("applyProductivityDrift — geometric drift (SPEC-PROD-1)", () => {
  it("applies the drift rate once: 1.0 * (1 + rate)^1", () => {
    // SPEC-PROD-1
    const state = makeState({ vars: {} });
    const result = applyProductivityDrift(state, BASE_PARAMS);
    expect(result.vars.productivity).toBe(1.0 * (1 + BASE_PARAMS.monthly_drift_rate));
  });

  it("defaults to productivity=1.0 when absent from state", () => {
    // SPEC-PROD-1
    const state = makeState({ vars: {} });
    expect(state.vars.productivity).toBeUndefined();
    const result = applyProductivityDrift(state, BASE_PARAMS);
    expect(result.vars.productivity).toBe(1.0 * (1 + BASE_PARAMS.monthly_drift_rate));
  });

  it("after N months productivity equals 1.0 * (1 + rate)^N", () => {
    // SPEC-PROD-1: iterative multiplication matches the closed-form power to 12 decimal places.
    // SPEC-PROD-1 says "to within floating-point precision" (IEEE-754 iterative multiplication and
    // Math.pow may differ by ±1 ULP). toBeCloseTo(x, 12) satisfies this (|diff| < 5e-13).
    const N = 12;
    let state = makeState({ vars: {} });
    for (let i = 0; i < N; i++) {
      state = applyProductivityDrift(state, BASE_PARAMS);
    }
    expect(state.vars.productivity).toBeCloseTo(Math.pow(1 + BASE_PARAMS.monthly_drift_rate, N), 12);
  });

  it("continues from an explicit starting value other than 1.0", () => {
    // SPEC-PROD-1
    const start = 1.5;
    const state = makeState({ vars: { productivity: start } });
    const result = applyProductivityDrift(state, BASE_PARAMS);
    expect(result.vars.productivity).toBe(start * (1 + BASE_PARAMS.monthly_drift_rate));
  });

  it("is a pure function — input state unchanged after call", () => {
    // SPEC-PROD-1
    const state = makeState({ vars: { productivity: 1.0 } });
    const varsBefore = { ...state.vars };
    applyProductivityDrift(state, BASE_PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  it("supports negative drift rate (stagnation/decline)", () => {
    // SPEC-PROD-1
    const decline: ProductivityParams = { monthly_drift_rate: -0.001 };
    const state = makeState({ vars: {} });
    const result = applyProductivityDrift(state, decline);
    expect(result.vars.productivity).toBeLessThan(1.0);
    expect(result.vars.productivity).toBe(1.0 * (1 + decline.monthly_drift_rate));
  });

  it("preserves all other vars unchanged", () => {
    // SPEC-PROD-1
    const state = makeState({ vars: { inflation: 0.05, policy_rate: 0.1 } });
    const result = applyProductivityDrift(state, BASE_PARAMS);
    expect(result.vars.inflation).toBe(0.05);
    expect(result.vars.policy_rate).toBe(0.1);
  });

  it("rate = 0 is the identity — productivity unchanged", () => {
    // SPEC-PROD-1: zero drift rate must leave productivity exactly at 1.0.
    const state = makeState({ vars: {} });
    const result = applyProductivityDrift(state, { monthly_drift_rate: 0 });
    expect(result.vars.productivity).toBe(1.0);
  });

  it("throws when state.vars.productivity is NaN", () => {
    // SPEC-PROD-1: NaN in vars must not silently propagate.
    const state = makeState({ vars: { productivity: NaN } });
    expect(() => applyProductivityDrift(state, BASE_PARAMS)).toThrow(/not finite/);
  });

  it("throws when state.vars.productivity is Infinity or -Infinity", () => {
    // SPEC-PROD-1: guard uses Number.isFinite, which rejects NaN, +Infinity, -Infinity.
    for (const bad of [Infinity, -Infinity]) {
      const state = makeState({ vars: { productivity: bad } });
      expect(() => applyProductivityDrift(state, BASE_PARAMS)).toThrow(/not finite/);
    }
  });

  it("throws when params.monthly_drift_rate is NaN", () => {
    // SPEC-PROD-1: non-finite params must not silently corrupt state.
    const state = makeState({ vars: {} });
    expect(() => applyProductivityDrift(state, { monthly_drift_rate: NaN })).toThrow(/not finite/);
  });

  it("throws when params.monthly_drift_rate is Infinity or -Infinity", () => {
    // SPEC-PROD-1: guard uses Number.isFinite, which rejects NaN, +Infinity, -Infinity.
    for (const bad of [Infinity, -Infinity]) {
      expect(() => applyProductivityDrift(makeState({ vars: {} }), { monthly_drift_rate: bad })).toThrow(/not finite/);
    }
  });
});

describe("loadProductivityParams (SPEC-PROD-1)", () => {
  it("loads and returns a finite monthly_drift_rate from content/engine/productivity.json", () => {
    // SPEC-PROD-1
    const params = loadProductivityParams();
    expect(typeof params.monthly_drift_rate).toBe("number");
    expect(Number.isFinite(params.monthly_drift_rate)).toBe(true);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-PROD-1
    const first = loadProductivityParams();
    const second = loadProductivityParams();
    expect(first).toBe(second);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-PROD-1
    const first = loadProductivityParams();
    _resetProductivityParamsCache();
    const second = loadProductivityParams();
    expect(second.monthly_drift_rate).toBe(first.monthly_drift_rate);
    // After reset a new object is returned (different reference).
    expect(first).not.toBe(second);
  });

  it("schema rejects monthly_drift_rate = -1", () => {
    // SPEC-PROD-1: rate <= -1 makes (1 + rate) <= 0, driving productivity to zero or negative.
    // The schema enforces exclusiveMinimum: -1; the loader also asserts this post-load.
    registerContentFile("content/engine/productivity.json", { monthly_drift_rate: -1 });
    expect(() => loadProductivityParams()).toThrow();
  });

  it("loader rejects monthly_drift_rate < -1 (would produce negative productivity)", () => {
    // SPEC-PROD-1: rate below -1 makes (1 + rate) < 0, producing negative productivity.
    registerContentFile("content/engine/productivity.json", { monthly_drift_rate: -2 });
    expect(() => loadProductivityParams()).toThrow();
  });

  it("loader rejects monthly_drift_rate > 1 (schema maximum: 1)", () => {
    // SPEC-PROD-1: schema enforces maximum: 1; loader rethrows with a context message.
    // TS-side guard (loaded.monthly_drift_rate > 1) provides defence-in-depth if schema changes.
    registerContentFile("content/engine/productivity.json", { monthly_drift_rate: 1.5 });
    expect(() => loadProductivityParams()).toThrow();
  });

  it("accepts monthly_drift_rate = 1.0 (inclusive maximum boundary)", () => {
    // SPEC-PROD-1: the schema maximum is 1 (inclusive); the TypeScript guard is > 1 (strict).
    registerContentFile("content/engine/productivity.json", { monthly_drift_rate: 1.0 });
    const params = loadProductivityParams();
    expect(params.monthly_drift_rate).toBe(1.0);
  });
});

describe("Session.advance integration (SPEC-PROD-1)", () => {
  it("advance(12) produces a finite productivity var in the resulting state", () => {
    // SPEC-PROD-1
    const session = Session.fromScenario("scen.1979_stagflation", 1, "comm.fomc_1979");
    // Precondition: scenario must not set an initial productivity value.
    expect(session.current.vars.productivity).toBeUndefined();
    session.advance(12);
    const productivity = session.current.vars.productivity;
    expect(productivity).toBeDefined();
    expect(Number.isFinite(productivity as number)).toBe(true);
    expect(productivity).toBeGreaterThan(0);
    // productivity.json currently has a positive rate; assert direction holds regardless of exact value.
    expect(productivity).toBeGreaterThan(1.0);
  });

  it("productivity after 12 months equals (1 + rate)^12 starting from 1.0", () => {
    // SPEC-PROD-1
    // Load actual params so the assertion always reflects the real content file.
    const params = loadProductivityParams();
    const session = Session.fromScenario("scen.1979_stagflation", 1, "comm.fomc_1979");
    // Precondition: scenario must not set an initial productivity value;
    // applyProductivityDrift defaults to 1.0 when absent.
    expect(session.current.vars.productivity).toBeUndefined();
    session.advance(12);
    const productivity = session.current.vars.productivity as number;
    expect(productivity).toBeCloseTo(Math.pow(1 + params.monthly_drift_rate, 12), 12);
  });
});
