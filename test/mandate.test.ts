// SPEC-MANDATE-1
import { describe, it, expect } from "vitest";
import { onTarget } from "../src/engine/mandate";
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

describe("onTarget — tolerance boundary edge cases", () => {
  // SPEC-MANDATE-1: inflation exactly at tolerance boundary → true.
  // Use params with fp-exact boundary: target=0.02, band=0.004 so upper boundary=0.024.
  // Math.abs(0.024 - 0.02) = 0.004 exactly in IEEE 754, so <= 0.004 returns true.
  it("returns true when inflation is exactly at the upper tolerance boundary", () => {
    // SPEC-MANDATE-1
    const BOUNDARY_PARAMS: MandateParams = { ...DUAL_PARAMS, tolerance_band: 0.004 };
    const boundary = BOUNDARY_PARAMS.target_inflation + BOUNDARY_PARAMS.tolerance_band; // 0.024 (fp-exact)
    const state = makeState({
      vars: {
        inflation: boundary,
        unemployment: 0.055,
      },
    });
    expect(onTarget(state, BOUNDARY_PARAMS)).toBe(true);
  });

  // SPEC-MANDATE-1: inflation one ulp above the exact boundary → false.
  it("returns false when inflation is one ulp above the upper tolerance boundary", () => {
    // SPEC-MANDATE-1
    const BOUNDARY_PARAMS: MandateParams = { ...DUAL_PARAMS, tolerance_band: 0.004 };
    const boundary = BOUNDARY_PARAMS.target_inflation + BOUNDARY_PARAMS.tolerance_band; // 0.024 (fp-exact)
    // Smallest representable increment above the boundary.
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
