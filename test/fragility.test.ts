// SPEC-FRAG-1: banking fragility dynamics
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyFragilityDynamics,
  loadFragilityParams,
  _resetFragilityParamsCache,
  type FragilityParams,
} from "../src/engine/fragility";
import { makeState } from "../src/engine/state";
import { registerContentFile, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

const BASE_PARAMS: FragilityParams = {
  initial_fragility: 0.1,
  base: 0.001,
  loose_policy_weight: 0.05,
  easing_weight: 0.03,
  lax_weight: 0.02,
  supervisory_decay: 0.04,
  natural_decay: 0.005,
};

beforeEach(() => {
  _resetFragilityParamsCache();
  _resetValidateFileCache();
  _resetRegistries();
});

describe("applyFragilityDynamics — pure function (SPEC-FRAG-1)", () => {
  it("defaults bank_fragility to initial_fragility when absent from state", () => {
    // SPEC-FRAG-1: defaults bank_fragility to content initial_fragility when absent
    const state = makeState({ vars: {} });
    const result = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(result.vars.bank_fragility).toBeDefined();
  });

  it("loose policy (negative realGap) raises fragility", () => {
    // SPEC-FRAG-1: loose_policy_weight * max(0, -realGap) increases accumulation
    const state = makeState({ vars: { bank_fragility: 0.2 } });
    const neutral = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    const loose = applyFragilityDynamics(
      state,
      { realGap: -2, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(loose.vars.bank_fragility).toBeGreaterThan(neutral.vars.bank_fragility as number);
  });

  it("positive realGap (tight policy) does not add loose-policy accumulation", () => {
    // SPEC-FRAG-1: max(0, -realGap) = 0 when realGap > 0
    const state = makeState({ vars: { bank_fragility: 0.2 } });
    const tight = applyFragilityDynamics(
      state,
      { realGap: 1, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    const neutral = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(tight.vars.bank_fragility).toBe(neutral.vars.bank_fragility);
  });

  it("sustained easing (positive easingSpeed) raises fragility", () => {
    // SPEC-FRAG-1: easing_weight * max(0, easingSpeed) increases accumulation
    const state = makeState({ vars: { bank_fragility: 0.2 } });
    const neutral = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    const easing = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 1, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(easing.vars.bank_fragility).toBeGreaterThan(neutral.vars.bank_fragility as number);
  });

  it("negative easingSpeed (tightening) does not add easing accumulation", () => {
    // SPEC-FRAG-1: max(0, easingSpeed) = 0 when easingSpeed < 0
    const state = makeState({ vars: { bank_fragility: 0.2 } });
    const tightening = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: -1, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    const neutral = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(tightening.vars.bank_fragility).toBe(neutral.vars.bank_fragility);
  });

  it("lax supervisory culture (low supervisoryRigor) raises fragility", () => {
    // SPEC-FRAG-1: lax_weight * (1 - supervisoryRigor) increases with lower rigor
    const state = makeState({ vars: { bank_fragility: 0.2 } });
    const rigorousResult = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1.0, fragilityMitigation: 0 },
      BASE_PARAMS,
    );
    const laxResult = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 0.0, fragilityMitigation: 0 },
      BASE_PARAMS,
    );
    expect(laxResult.vars.bank_fragility).toBeGreaterThan(rigorousResult.vars.bank_fragility as number);
  });

  it("strong mitigation lowers fragility", () => {
    // SPEC-FRAG-1: supervisory_decay * fragilityMitigation + natural_decay reduces fragility
    const state = makeState({ vars: { bank_fragility: 0.5 } });
    const noMitigation = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 0 },
      BASE_PARAMS,
    );
    const strongMitigation = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(strongMitigation.vars.bank_fragility).toBeLessThan(noMitigation.vars.bank_fragility as number);
  });

  it("fragility is clamped to 0 at the lower bound", () => {
    // SPEC-FRAG-1: clamp [0,1] — cannot go below 0
    const state = makeState({ vars: { bank_fragility: 0.0 } });
    // Large mitigation that would drive fragility negative
    const heavyParams: FragilityParams = {
      ...BASE_PARAMS,
      base: 0,
      supervisory_decay: 0.5,
      natural_decay: 0.5,
    };
    const result = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      heavyParams,
    );
    expect(result.vars.bank_fragility).toBeGreaterThanOrEqual(0);
  });

  it("fragility is clamped to 1 at the upper bound", () => {
    // SPEC-FRAG-1: clamp [0,1] — cannot exceed 1
    const state = makeState({ vars: { bank_fragility: 1.0 } });
    // Large accumulation that would exceed 1
    const extremeParams: FragilityParams = {
      ...BASE_PARAMS,
      base: 1.0,
      natural_decay: 0,
      supervisory_decay: 0,
    };
    const result = applyFragilityDynamics(
      state,
      { realGap: -10, easingSpeed: 10, supervisoryRigor: 0, fragilityMitigation: 0 },
      extremeParams,
    );
    expect(result.vars.bank_fragility).toBeLessThanOrEqual(1);
  });

  it("is a pure function — input state unchanged after call", () => {
    // SPEC-FRAG-1: pure — never mutates inputs
    const state = makeState({ vars: { bank_fragility: 0.3 } });
    const varsBefore = { ...state.vars };
    applyFragilityDynamics(
      state,
      { realGap: -1, easingSpeed: 0.5, supervisoryRigor: 0.5, fragilityMitigation: 0.5 },
      BASE_PARAMS,
    );
    expect(state.vars).toEqual(varsBefore);
  });

  it("preserves all other vars unchanged", () => {
    // SPEC-FRAG-1: pure — only bank_fragility changes
    const state = makeState({ vars: { inflation: 0.05, policy_rate: 0.1, bank_fragility: 0.2 } });
    const result = applyFragilityDynamics(
      state,
      { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 },
      BASE_PARAMS,
    );
    expect(result.vars.inflation).toBe(0.05);
    expect(result.vars.policy_rate).toBe(0.1);
  });

  it("computes the exact expected value from the formula", () => {
    // SPEC-FRAG-1: fragility += base + loose_policy_weight*max(0,-realGap) +
    //   easing_weight*max(0,easingSpeed) + lax_weight*(1-supervisoryRigor) -
    //   (supervisory_decay*fragilityMitigation + natural_decay), clamped [0,1]
    const initialFragility = 0.3;
    const state = makeState({ vars: { bank_fragility: initialFragility } });
    const inputs = { realGap: -1, easingSpeed: 0.5, supervisoryRigor: 0.6, fragilityMitigation: 0.7 };
    const p = BASE_PARAMS;
    const accumulation =
      p.base +
      p.loose_policy_weight * Math.max(0, -inputs.realGap) +
      p.easing_weight * Math.max(0, inputs.easingSpeed) +
      p.lax_weight * (1 - inputs.supervisoryRigor);
    const mitigation = p.supervisory_decay * inputs.fragilityMitigation + p.natural_decay;
    const expected = Math.min(1, Math.max(0, initialFragility + accumulation - mitigation));
    const result = applyFragilityDynamics(state, inputs, BASE_PARAMS);
    expect(result.vars.bank_fragility).toBeCloseTo(expected, 12);
  });

  it("uses initial_fragility as default when bank_fragility absent from state", () => {
    // SPEC-FRAG-1: defaults bank_fragility to initial_fragility from params
    const state = makeState({ vars: {} });
    const inputs = { realGap: 0, easingSpeed: 0, supervisoryRigor: 1, fragilityMitigation: 1 };
    const p = BASE_PARAMS;
    const prev = p.initial_fragility;
    const accumulation = p.base + p.lax_weight * 0;
    const mitigation = p.supervisory_decay * 1 + p.natural_decay;
    const expected = Math.min(1, Math.max(0, prev + accumulation - mitigation));
    const result = applyFragilityDynamics(state, inputs, BASE_PARAMS);
    expect(result.vars.bank_fragility).toBeCloseTo(expected, 12);
  });
});

describe("loadFragilityParams (SPEC-FRAG-1)", () => {
  it("loads and returns valid params from content/engine/fragility.json", () => {
    // SPEC-FRAG-1
    const params = loadFragilityParams();
    expect(typeof params.initial_fragility).toBe("number");
    expect(typeof params.base).toBe("number");
    expect(typeof params.loose_policy_weight).toBe("number");
    expect(typeof params.easing_weight).toBe("number");
    expect(typeof params.lax_weight).toBe("number");
    expect(typeof params.supervisory_decay).toBe("number");
    expect(typeof params.natural_decay).toBe("number");
    expect(params.initial_fragility).toBeGreaterThanOrEqual(0);
    expect(params.initial_fragility).toBeLessThanOrEqual(1);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-FRAG-1
    const first = loadFragilityParams();
    const second = loadFragilityParams();
    expect(first).toBe(second);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-FRAG-1
    const first = loadFragilityParams();
    _resetFragilityParamsCache();
    const second = loadFragilityParams();
    expect(second.initial_fragility).toBe(first.initial_fragility);
    expect(first).not.toBe(second);
  });

  it("schema rejects initial_fragility outside [0,1]", () => {
    // SPEC-FRAG-1: initial_fragility must be in [0,1]
    registerContentFile("content/engine/fragility.json", { ...BASE_PARAMS, initial_fragility: 1.5 });
    expect(() => loadFragilityParams()).toThrow();
  });

  it("schema rejects negative initial_fragility", () => {
    // SPEC-FRAG-1
    registerContentFile("content/engine/fragility.json", { ...BASE_PARAMS, initial_fragility: -0.1 });
    expect(() => loadFragilityParams()).toThrow();
  });

  it("schema rejects missing required fields", () => {
    // SPEC-FRAG-1: schema is strict — all fields required
    registerContentFile("content/engine/fragility.json", { initial_fragility: 0.1 });
    expect(() => loadFragilityParams()).toThrow();
  });

  it("schema rejects negative weights", () => {
    // SPEC-FRAG-1: weights must be non-negative
    registerContentFile("content/engine/fragility.json", { ...BASE_PARAMS, loose_policy_weight: -0.1 });
    expect(() => loadFragilityParams()).toThrow();
  });
});
