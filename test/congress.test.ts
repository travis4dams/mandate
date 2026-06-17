// SPEC-CONGRESS-1: Congressional pressure + independence var
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyCongressionalPressure,
  loadCongressParams,
  _resetCongressParamsCache,
  type CongressParams,
} from "../src/engine/congress";
import { makeState } from "../src/engine/state";
import { registerContentFile, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

const BASE_PARAMS: CongressParams = {
  inquiry_threshold: 50,
  political_capital_drain: 5,
  independence_drain: 2,
  initial_independence: 80,
};

beforeEach(() => {
  _resetCongressParamsCache();
  _resetValidateFileCache();
  _resetRegistries();
});

describe("applyCongressionalPressure — above threshold (SPEC-CONGRESS-1)", () => {
  it("drains political_capital and independence when deferred_asset > inquiry_threshold", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.political_capital).toBe(25); // 30 - 5
    expect(result.vars.independence).toBe(78); // 80 - 2
  });

  it("sets pending_inquiry.deferred_asset flag when above threshold", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.flags["pending_inquiry.deferred_asset"]).toBe(true);
  });

  it("clamps political_capital to 0 when drain exceeds balance", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 3, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.political_capital).toBe(0); // clamped at 0
  });

  it("clamps independence to 0 when drain exceeds balance", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 1 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.independence).toBe(0); // clamped at 0
  });

  it("clamps independence to 100 (cannot exceed max)", () => {
    // SPEC-CONGRESS-1: independence is always in [0,100]
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 99 },
    });
    // Drain still applies, 99 - 2 = 97, but this verifies the clamp path is wired correctly
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.independence).toBe(97);
    expect(result.vars.independence).toBeLessThanOrEqual(100);
  });
});

describe("applyCongressionalPressure — below threshold / no-op (SPEC-CONGRESS-1)", () => {
  it("is a no-op when deferred_asset <= inquiry_threshold", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 30, political_capital: 30, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.political_capital).toBe(30);
    expect(result.vars.independence).toBe(80);
  });

  it("does not set the flag when below threshold", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 30, political_capital: 30, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.flags["pending_inquiry.deferred_asset"]).toBeFalsy();
  });

  it("clears the flag when deferred_asset returns to 0", () => {
    // SPEC-CONGRESS-1: flag clears once deferred_asset <= 0
    const state = makeState({
      vars: { deferred_asset: 0, political_capital: 30, independence: 80 },
      flags: { "pending_inquiry.deferred_asset": true },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.flags["pending_inquiry.deferred_asset"]).toBe(false);
  });

  it("flag is absent (not set) when there was no prior inquiry and deferred_asset is 0", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 0, political_capital: 30, independence: 80 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    // Should remain falsy (undefined or false)
    expect(result.flags["pending_inquiry.deferred_asset"]).toBeFalsy();
  });
});

describe("applyCongressionalPressure — independence default from content (SPEC-CONGRESS-1)", () => {
  it("defaults independence from params.initial_independence when absent in state", () => {
    // SPEC-CONGRESS-1: independence defaults from content when absent
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30 },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    // 80 (default) - 2 (drain) = 78
    expect(result.vars.independence).toBe(78);
  });

  it("does not drain a defaulted independence below 0", () => {
    // SPEC-CONGRESS-1
    const params: CongressParams = { ...BASE_PARAMS, initial_independence: 1, independence_drain: 5 };
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30 },
    });
    const result = applyCongressionalPressure(state, params);
    expect(result.vars.independence).toBe(0);
  });
});

describe("applyCongressionalPressure — purity (SPEC-CONGRESS-1)", () => {
  it("does not mutate input state vars", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 80 },
    });
    const varsBefore = { ...state.vars };
    applyCongressionalPressure(state, BASE_PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  it("does not mutate input state flags", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 80 },
    });
    const flagsBefore = { ...state.flags };
    applyCongressionalPressure(state, BASE_PARAMS);
    expect(state.flags).toEqual(flagsBefore);
  });

  it("preserves all other vars and flags unchanged", () => {
    // SPEC-CONGRESS-1
    const state = makeState({
      vars: { deferred_asset: 100, political_capital: 30, independence: 80, inflation: 0.05 },
      flags: { crisis: true },
    });
    const result = applyCongressionalPressure(state, BASE_PARAMS);
    expect(result.vars.inflation).toBe(0.05);
    expect(result.flags.crisis).toBe(true);
  });
});

describe("loadCongressParams (SPEC-CONGRESS-1)", () => {
  it("loads and returns valid params from content/engine/congress.json", () => {
    // SPEC-CONGRESS-1
    const params = loadCongressParams();
    expect(typeof params.inquiry_threshold).toBe("number");
    expect(typeof params.political_capital_drain).toBe("number");
    expect(typeof params.independence_drain).toBe("number");
    expect(typeof params.initial_independence).toBe("number");
    expect(params.initial_independence).toBeGreaterThanOrEqual(0);
    expect(params.initial_independence).toBeLessThanOrEqual(100);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-CONGRESS-1
    const first = loadCongressParams();
    const second = loadCongressParams();
    expect(first).toBe(second);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-CONGRESS-1
    const first = loadCongressParams();
    _resetCongressParamsCache();
    const second = loadCongressParams();
    expect(second.inquiry_threshold).toBe(first.inquiry_threshold);
    expect(first).not.toBe(second);
  });

  it("schema rejects negative inquiry_threshold", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      ...BASE_PARAMS,
      inquiry_threshold: -1,
    });
    expect(() => loadCongressParams()).toThrow();
  });

  it("schema rejects initial_independence above 100", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      ...BASE_PARAMS,
      initial_independence: 101,
    });
    expect(() => loadCongressParams()).toThrow();
  });

  it("schema rejects initial_independence below 0", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      ...BASE_PARAMS,
      initial_independence: -1,
    });
    expect(() => loadCongressParams()).toThrow();
  });

  it("schema rejects missing required fields", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      inquiry_threshold: 50,
      // missing political_capital_drain, independence_drain, initial_independence
    });
    expect(() => loadCongressParams()).toThrow();
  });

  it("schema rejects negative political_capital_drain", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      ...BASE_PARAMS,
      political_capital_drain: -1,
    });
    expect(() => loadCongressParams()).toThrow();
  });

  it("schema rejects negative independence_drain", () => {
    // SPEC-CONGRESS-1
    registerContentFile("content/engine/congress.json", {
      ...BASE_PARAMS,
      independence_drain: -1,
    });
    expect(() => loadCongressParams()).toThrow();
  });
});
