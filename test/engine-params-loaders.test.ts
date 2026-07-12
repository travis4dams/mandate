import { describe, it, expect, vi, afterEach } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { loadValidatedFile, _resetValidateFileCache } from "../src/content/loader";
import { loadMandateParams, _resetMandateParamsCache } from "../src/engine/mandate";

// SPEC-PARAMS-1

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tick loader (SPEC-PARAMS-1)", () => {
  it("loadValidatedFile returns { history_size: 24 } from content/engine/tick.json", () => {
    const result = loadValidatedFile<{ history_size: number }>(
      "schemas/tick.schema.json",
      "content/engine/tick.json"
    );
    expect(result.history_size).toBe(24);
  });
});

describe("fog loader (SPEC-PARAMS-1)", () => {
  it("loadValidatedFile returns fog params with inflation.noise_scale === 0.002", () => {
    const result = loadValidatedFile<Record<string, { noise_scale: number; lag_months: number }>>(
      "schemas/fog.schema.json",
      "content/engine/fog.json"
    );
    expect(typeof result.inflation).toBe("object");
    expect(result.inflation.noise_scale).toBe(0.002);
    expect(result.inflation.lag_months).toBe(1);
  });
});

describe("credibility loader (SPEC-PARAMS-1 / SPEC-CRED-4 / SPEC-CRED-6)", () => {
  it("loadValidatedFile returns expectations + mission-credibility params", () => {
    const result = loadValidatedFile<{
      target_inflation: number;
      unemployment_target: number;
      expectations_adaptivity: number;
      expectations_anchor_pull: number;
      credibility_mission_gain: number;
      credibility_unemployment_weight: number;
      anchor_threshold: number;
    }>("schemas/credibility.schema.json", "content/engine/credibility.json");
    expect(result.target_inflation).toBe(0.02);
    expect(result.unemployment_target).toBeGreaterThan(0);
    expect(result.expectations_adaptivity).toBeGreaterThan(0);
    expect(result.expectations_anchor_pull).toBeGreaterThan(0);
    expect(result.credibility_mission_gain).toBeGreaterThan(0);
    expect(result.credibility_unemployment_weight).toBeGreaterThan(0);
    expect(result.anchor_threshold).toBeGreaterThan(0);
    expect(result.anchor_threshold).toBeLessThanOrEqual(100);
  });
});

describe("dynamics loader (SPEC-SIM-5)", () => {
  it("loadValidatedFile returns real-rate dynamics params, finite, with inflation_persistence in [0,1]", () => {
    // SPEC-SIM-5
    const result = loadValidatedFile<{
      inflation_persistence: number;
      phillips_slope: number;
      unemployment_natural_rate: number;
      real_neutral_rate: number;
      okun_coefficient: number;
      unemployment_adjustment_speed: number;
    }>("schemas/dynamics.schema.json", "content/engine/dynamics.json");
    expect(Number.isFinite(result.phillips_slope)).toBe(true);
    expect(Number.isFinite(result.unemployment_natural_rate)).toBe(true);
    expect(Number.isFinite(result.real_neutral_rate)).toBe(true);
    expect(Number.isFinite(result.okun_coefficient)).toBe(true);
    expect(Number.isFinite(result.unemployment_adjustment_speed)).toBe(true);
    expect(Number.isFinite(result.inflation_persistence)).toBe(true);
    // Schema-enforced upper bound.
    expect(result.inflation_persistence).toBeGreaterThanOrEqual(0);
    expect(result.inflation_persistence).toBeLessThanOrEqual(1);
  });
});

describe("committee params loader (SPEC-PARAMS-1 + SPEC-COMM-3 + SPEC-COMM-4 + SPEC-COMM-5 + SPEC-COMM-10)", () => {
  it("loadValidatedFile returns committee params with all required fields", () => {
    // SPEC-COMM-4: dissent_tolerance removed; per-member compromise_band now governs dissent.
    // SPEC-COMM-5: conviction_band_factor added.
    // SPEC-COMM-10: dissent_override_threshold and median_pull added.
    const result = loadValidatedFile<{
      neutral_rate: number;
      target_inflation: number;
      target_unemployment: number;
      conviction_band_factor: number;
      dissent_override_threshold: number;
      median_pull: number;
    }>("schemas/committee-params.schema.json", "content/engine/committee.json");
    expect(result.neutral_rate).toBeGreaterThan(0);
    expect(result.target_inflation).toBeGreaterThan(0);
    expect(result.target_unemployment).toBeGreaterThan(0);
    // SPEC-COMM-5
    expect(result.conviction_band_factor).toBeGreaterThanOrEqual(0);
    expect(result.conviction_band_factor).toBeLessThanOrEqual(1);
    // SPEC-COMM-10
    expect(Number.isInteger(result.dissent_override_threshold)).toBe(true);
    expect(result.dissent_override_threshold).toBeGreaterThanOrEqual(1);
    expect(result.median_pull).toBeGreaterThan(0);
    expect(result.median_pull).toBeLessThanOrEqual(1);
  });
});

describe("mandate params loader (SPEC-MANDATE-1)", () => {
  afterEach(() => { _resetMandateParamsCache(); });

  it("loadMandateParams returns dual mandate with target_inflation=0.02", () => {
    // SPEC-MANDATE-1
    const result = loadMandateParams();
    expect(result.mandate_type).toBe("dual");
    expect(result.target_inflation).toBe(0.02);
    expect(result.tolerance_band).toBeGreaterThan(0);
    expect(result.unemployment_target).toBeGreaterThan(0);
    expect(result.unemployment_band).toBeGreaterThan(0);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-MANDATE-1
    const first = loadMandateParams();
    const second = loadMandateParams();
    expect(first).toBe(second);
  });
});

describe("AJV compile cache (SPEC-PARAMS-1)", () => {
  it("calling loadValidatedFile twice with the same schema invokes ajv.compile exactly once", () => {
    // Clear the cache so we control exactly when compile fires.
    _resetValidateFileCache();
    const spy = vi.spyOn(Ajv2020.prototype, "compile");
    try {
      loadValidatedFile("schemas/tick.schema.json", "content/engine/tick.json");
      loadValidatedFile("schemas/tick.schema.json", "content/engine/tick.json");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
