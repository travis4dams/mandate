import { describe, it, expect, vi, afterEach } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { loadValidatedFile, _resetValidateFileCache } from "../src/content/loader";

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

describe("credibility loader (SPEC-PARAMS-1)", () => {
  it("loadValidatedFile returns credibility params with required fields", () => {
    const result = loadValidatedFile<{
      anchor_threshold: number;
      consecutive_months: number;
      drift_per_period: number;
      recovery_rate: number;
      target_inflation: number;
    }>("schemas/credibility.schema.json", "content/engine/credibility.json");
    expect(typeof result.anchor_threshold).toBe("number");
    expect(result.anchor_threshold).toBeGreaterThan(0);
    expect(result.anchor_threshold).toBeLessThanOrEqual(100);
    expect(typeof result.recovery_rate).toBe("number");
  });
});

describe("dynamics loader (SPEC-SIM-5)", () => {
  it("loadValidatedFile returns dynamics params with all five fields finite and inflation_persistence in [0,1]", () => {
    // SPEC-SIM-5
    const result = loadValidatedFile<{
      phillips_slope: number;
      unemployment_natural_rate: number;
      rate_sensitivity: number;
      neutral_rate: number;
      inflation_persistence: number;
    }>("schemas/dynamics.schema.json", "content/engine/dynamics.json");
    expect(Number.isFinite(result.phillips_slope)).toBe(true);
    expect(Number.isFinite(result.unemployment_natural_rate)).toBe(true);
    expect(Number.isFinite(result.rate_sensitivity)).toBe(true);
    expect(Number.isFinite(result.neutral_rate)).toBe(true);
    expect(Number.isFinite(result.inflation_persistence)).toBe(true);
    // Schema-enforced upper bound — the only bounded param in DynamicsParams.
    expect(result.inflation_persistence).toBeGreaterThanOrEqual(0);
    expect(result.inflation_persistence).toBeLessThanOrEqual(1);
  });
});

describe("committee params loader (SPEC-PARAMS-1)", () => {
  it("loadValidatedFile returns committee params with required fields", () => {
    const result = loadValidatedFile<{
      dissent_tolerance: number;
      hawkish_inflation_weight: number;
      dovish_unemployment_weight: number;
      neutral_blend: number;
      target_inflation: number;
      target_unemployment: number;
    }>("schemas/committee-params.schema.json", "content/engine/committee.json");
    expect(typeof result.dissent_tolerance).toBe("number");
    expect(result.dissent_tolerance).toBeGreaterThan(0);
    expect(result.neutral_blend).toBeGreaterThanOrEqual(0);
    expect(result.neutral_blend).toBeLessThanOrEqual(1);
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
