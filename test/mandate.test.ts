// SPEC-MANDATE-1
import { describe, it, expect } from "vitest";
import { onTarget } from "../src/engine/mandate";
import { VoteMissingVarError } from "../src/engine/fomc";
import { makeState } from "../src/engine/state";
import type { MandateParams } from "../src/engine/mandate";

const DUAL_PARAMS: MandateParams = {
  target_inflation: 0.02,
  tolerance_band: 0.005,
  mandate_type: "dual",
  unemployment_target: 0.055,
  unemployment_band: 0.01,
};

const SINGLE_PARAMS: MandateParams = {
  ...DUAL_PARAMS,
  mandate_type: "single",
};

describe("onTarget — dual mandate", () => {
  // SPEC-MANDATE-1: inflation on target, unemployment on target → dual mandate returns true.
  it("returns true when inflation and unemployment are both within tolerance", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.02,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, DUAL_PARAMS)).toBe(true);
  });

  // SPEC-MANDATE-1: inflation off target (high) → returns false regardless of unemployment.
  it("returns false when inflation is off target (0.114 >> 0.02) regardless of unemployment", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.114,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, DUAL_PARAMS)).toBe(false);
  });

  // SPEC-MANDATE-1: inflation on target but unemployment off target → dual mandate returns false.
  it("returns false when inflation is on target but unemployment is off target (dual mandate)", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.02,
        unemployment: 0.10,
      },
    });
    expect(onTarget(state, DUAL_PARAMS)).toBe(false);
  });
});

describe("onTarget — single mandate", () => {
  // SPEC-MANDATE-1: inflation on target, unemployment off target → single mandate returns true.
  it("returns true when inflation is on target even if unemployment is off target (single mandate)", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.02,
        unemployment: 0.10,
      },
    });
    expect(onTarget(state, SINGLE_PARAMS)).toBe(true);
  });

  // SPEC-MANDATE-1: inflation off target → single mandate returns false.
  it("returns false when inflation is off target (single mandate)", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.114,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, SINGLE_PARAMS)).toBe(false);
  });
});

describe("onTarget — purity", () => {
  // SPEC-MANDATE-1: pure function — input state not mutated after call.
  it("does not mutate the input state", () => {
    // SPEC-MANDATE-1
    const state = makeState({
      vars: {
        inflation: 0.02,
        unemployment: 0.055,
      },
    });
    const varsBefore = { ...state.vars };
    onTarget(state, DUAL_PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });
});

describe("onTarget — guard: missing or non-finite vars", () => {
  // SPEC-MANDATE-1: missing inflation throws VoteMissingVarError.
  it("throws VoteMissingVarError when inflation is missing", () => {
    // SPEC-MANDATE-1
    const state = makeState({ vars: { unemployment: 0.055 } });
    expect(() => onTarget(state, DUAL_PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-MANDATE-1: non-finite inflation throws VoteMissingVarError.
  it("throws VoteMissingVarError when inflation is NaN", () => {
    // SPEC-MANDATE-1
    const state = makeState({ vars: { inflation: NaN, unemployment: 0.055 } });
    expect(() => onTarget(state, DUAL_PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-MANDATE-1: inflation ok but missing unemployment (dual) throws VoteMissingVarError.
  it("throws VoteMissingVarError when unemployment is missing (dual mandate)", () => {
    // SPEC-MANDATE-1
    const state = makeState({ vars: { inflation: 0.02 } });
    expect(() => onTarget(state, DUAL_PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-MANDATE-1: missing unemployment is NOT checked for single mandate.
  it("does not throw when unemployment is missing and mandate_type is single", () => {
    // SPEC-MANDATE-1
    const state = makeState({ vars: { inflation: 0.02 } });
    expect(() => onTarget(state, SINGLE_PARAMS)).not.toThrow();
  });
});

describe("onTarget — tolerance boundary edge cases", () => {
  // SPEC-MANDATE-1: inflation at the computed boundary → true.
  // boundary = target + band = 0.02 + 0.004 = 0.024; Math.abs(0.024 - 0.02) <= 0.004 returns true.
  it("returns true when inflation is exactly at the upper tolerance boundary", () => {
    // SPEC-MANDATE-1
    const BOUNDARY_PARAMS: MandateParams = { ...DUAL_PARAMS, tolerance_band: 0.004 };
    const boundary = BOUNDARY_PARAMS.target_inflation + BOUNDARY_PARAMS.tolerance_band; // 0.024
    const state = makeState({
      vars: {
        inflation: boundary,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, BOUNDARY_PARAMS)).toBe(true);
  });

  // SPEC-MANDATE-1: inflation strictly above the boundary → false.
  it("returns false when inflation is strictly above the upper tolerance boundary", () => {
    // SPEC-MANDATE-1
    const BOUNDARY_PARAMS: MandateParams = { ...DUAL_PARAMS, tolerance_band: 0.004 };
    const boundary = BOUNDARY_PARAMS.target_inflation + BOUNDARY_PARAMS.tolerance_band; // 0.024
    // Any value strictly greater than boundary triggers false.
    const justOutside = boundary + Number.EPSILON * boundary;
    const state = makeState({
      vars: {
        inflation: justOutside,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, BOUNDARY_PARAMS)).toBe(false);
  });
});
