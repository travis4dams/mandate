import { describe, it, expect, afterEach } from "vitest";
import { mulberry32 } from "../src/engine/rng.js";
import {
  computeForecastNoiseScale,
  applyForecastQuality,
  loadForecastQualityParams,
  _resetForecastQualityParamsCache,
  type ForecastQualityParams,
} from "../src/engine/forecast-quality.js";
import type { Briefing } from "../src/content/briefings.js";

// SPEC-BRIEF-2

afterEach(() => {
  _resetForecastQualityParamsCache();
});

const PARAMS: ForecastQualityParams = {
  base_noise_scale: 0.02,
  quality_slope: 0.0002,
  min_noise_scale: 0.002,
};

const BASE_BRIEFING: Briefing = {
  id: "brief.test",
  name: "brief.test.name",
  desc: "brief.test.desc",
  scenarios: [
    {
      scenario_type: "raise",
      name: "brief.test.raise.name",
      forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.07 },
    },
    {
      scenario_type: "hold",
      name: "brief.test.hold.name",
      forecast: { inflation_outlook: 0.115, unemployment_outlook: 0.062 },
    },
    {
      scenario_type: "lower",
      name: "brief.test.lower.name",
      forecast: { inflation_outlook: 0.13, unemployment_outlook: 0.058 },
    },
  ],
};

describe("computeForecastNoiseScale", () => {
  it("returns base_noise_scale at investment=0", () => {
    // SPEC-BRIEF-2
    expect(computeForecastNoiseScale(0, PARAMS)).toBe(PARAMS.base_noise_scale);
  });

  it("decreases monotonically as investment increases", () => {
    // SPEC-BRIEF-2
    const n0 = computeForecastNoiseScale(0, PARAMS);
    const n50 = computeForecastNoiseScale(50, PARAMS);
    const n90 = computeForecastNoiseScale(90, PARAMS);
    expect(n0).toBeGreaterThan(n50);
    expect(n50).toBeGreaterThan(PARAMS.min_noise_scale - 1e-12);
    expect(n90).toBeCloseTo(PARAMS.min_noise_scale, 10);
  });

  it("never goes below min_noise_scale", () => {
    // SPEC-BRIEF-2
    expect(computeForecastNoiseScale(10_000, PARAMS)).toBe(PARAMS.min_noise_scale);
  });

  it("is finite and non-NaN at investment=0 (zero-investment floor guarantee)", () => {
    // SPEC-BRIEF-2
    const result = computeForecastNoiseScale(0, PARAMS);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("throws for non-finite investment", () => {
    // SPEC-BRIEF-2
    expect(() => computeForecastNoiseScale(NaN, PARAMS)).toThrow();
    expect(() => computeForecastNoiseScale(Infinity, PARAMS)).toThrow();
  });

  it("throws for negative investment", () => {
    // SPEC-BRIEF-2
    expect(() => computeForecastNoiseScale(-1, PARAMS)).toThrow();
  });
});

describe("applyForecastQuality", () => {
  it("returns finite forecast values at investment=0 (no NaN)", () => {
    // SPEC-BRIEF-2
    const rng = mulberry32(42);
    const result = applyForecastQuality(BASE_BRIEFING, 0, PARAMS, rng);
    for (const s of result.scenarios) {
      expect(Number.isFinite(s.forecast.inflation_outlook)).toBe(true);
      expect(Number.isFinite(s.forecast.unemployment_outlook)).toBe(true);
    }
  });

  it("is deterministic: same seed + investment → same result", () => {
    // SPEC-BRIEF-2
    const a = applyForecastQuality(BASE_BRIEFING, 30, PARAMS, mulberry32(7));
    const b = applyForecastQuality(BASE_BRIEFING, 30, PARAMS, mulberry32(7));
    expect(a.scenarios[0].forecast.inflation_outlook).toBe(
      b.scenarios[0].forecast.inflation_outlook,
    );
    expect(a.scenarios[2].forecast.unemployment_outlook).toBe(
      b.scenarios[2].forecast.unemployment_outlook,
    );
  });

  it("higher investment → smaller perturbation magnitude", () => {
    // SPEC-BRIEF-2
    const base = 0.10;
    const seed = 99;
    const briefing: Briefing = {
      ...BASE_BRIEFING,
      scenarios: [
        { ...BASE_BRIEFING.scenarios[0], forecast: { inflation_outlook: base, unemployment_outlook: 0.05 } },
        { ...BASE_BRIEFING.scenarios[1], forecast: { inflation_outlook: base, unemployment_outlook: 0.05 } },
        { ...BASE_BRIEFING.scenarios[2], forecast: { inflation_outlook: base, unemployment_outlook: 0.05 } },
      ],
    };
    const lowInv = applyForecastQuality(briefing, 0, PARAMS, mulberry32(seed));
    const highInv = applyForecastQuality(briefing, 10_000, PARAMS, mulberry32(seed));
    const errLow = Math.abs(lowInv.scenarios[0].forecast.inflation_outlook - base);
    const errHigh = Math.abs(highInv.scenarios[0].forecast.inflation_outlook - base);
    expect(errLow).toBeGreaterThan(errHigh);
  });

  it("preserves scenario_type order and count", () => {
    // SPEC-BRIEF-2
    const rng = mulberry32(1);
    const result = applyForecastQuality(BASE_BRIEFING, 10, PARAMS, rng);
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios[0].scenario_type).toBe("raise");
    expect(result.scenarios[1].scenario_type).toBe("hold");
    expect(result.scenarios[2].scenario_type).toBe("lower");
  });

  it("clamps unemployment_outlook to [0, 1]", () => {
    // SPEC-BRIEF-2
    const extremeParams: ForecastQualityParams = {
      base_noise_scale: 2.0,
      quality_slope: 0,
      min_noise_scale: 2.0,
    };
    const rng = mulberry32(5);
    const result = applyForecastQuality(BASE_BRIEFING, 0, extremeParams, rng);
    for (const s of result.scenarios) {
      expect(s.forecast.unemployment_outlook).toBeGreaterThanOrEqual(0);
      expect(s.forecast.unemployment_outlook).toBeLessThanOrEqual(1);
    }
  });

  it("passes through growth_outlook when present", () => {
    // SPEC-BRIEF-2
    const briefingWithGrowth: Briefing = {
      ...BASE_BRIEFING,
      scenarios: [
        { ...BASE_BRIEFING.scenarios[0], forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.07, growth_outlook: -0.01 } },
        { ...BASE_BRIEFING.scenarios[1], forecast: { inflation_outlook: 0.115, unemployment_outlook: 0.062, growth_outlook: 0.005 } },
        { ...BASE_BRIEFING.scenarios[2], forecast: { inflation_outlook: 0.13, unemployment_outlook: 0.058, growth_outlook: 0.015 } },
      ],
    };
    const rng = mulberry32(3);
    const result = applyForecastQuality(briefingWithGrowth, 10, PARAMS, rng);
    for (const s of result.scenarios) {
      expect(s.forecast.growth_outlook).toBeDefined();
      expect(Number.isFinite(s.forecast.growth_outlook!)).toBe(true);
    }
  });

  it("does not include growth_outlook when absent from base", () => {
    // SPEC-BRIEF-2
    const rng = mulberry32(2);
    const result = applyForecastQuality(BASE_BRIEFING, 0, PARAMS, rng);
    for (const s of result.scenarios) {
      expect(s.forecast.growth_outlook).toBeUndefined();
    }
  });

  it("does not mutate the input briefing", () => {
    // SPEC-BRIEF-2
    const orig = BASE_BRIEFING.scenarios[0].forecast.inflation_outlook;
    const rng = mulberry32(11);
    applyForecastQuality(BASE_BRIEFING, 10, PARAMS, rng);
    expect(BASE_BRIEFING.scenarios[0].forecast.inflation_outlook).toBe(orig);
  });
});

describe("loadForecastQualityParams", () => {
  it("loads without throwing and returns finite positive values", () => {
    // SPEC-BRIEF-2
    const params = loadForecastQualityParams();
    expect(Number.isFinite(params.base_noise_scale)).toBe(true);
    expect(params.base_noise_scale).toBeGreaterThan(0);
    expect(Number.isFinite(params.quality_slope)).toBe(true);
    expect(params.quality_slope).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(params.min_noise_scale)).toBe(true);
    expect(params.min_noise_scale).toBeGreaterThan(0);
    expect(params.min_noise_scale).toBeLessThanOrEqual(params.base_noise_scale);
  });

  it("returns the same reference on subsequent calls (cached)", () => {
    // SPEC-BRIEF-2
    const a = loadForecastQualityParams();
    const b = loadForecastQualityParams();
    expect(a).toBe(b);
  });
});
