import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Briefing, BriefingForecast } from "../content/briefings.js";

// SPEC-BRIEF-2: forecast quality scales with organizational investment.
// Higher investment → lower noise scale → tighter, less-biased scenario forecasts.
// The investment parameter is intentionally abstract (not yet wired to the tech
// tree) so this SPEC does not block on the org/resource system.

export interface ForecastQualityParams {
  readonly base_noise_scale: number;
  readonly quality_slope: number;
  readonly min_noise_scale: number;
}

const PARAMS_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/forecast-quality.json",
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/forecast-quality.schema.json",
);

let _cache: ForecastQualityParams | null = null;

export function _resetForecastQualityParamsCache(): void {
  _cache = null;
}

export function loadForecastQualityParams(): ForecastQualityParams {
  if (!_cache) {
    try {
      _cache = loadValidatedFile<ForecastQualityParams>(SCHEMA_PATH, PARAMS_PATH);
    } catch (e) {
      throw new Error("loadForecastQualityParams: failed to load params", { cause: e });
    }
  }
  return _cache;
}

// Returns the noise half-width for a given investment level.
// noise = max(min_noise_scale, base_noise_scale - quality_slope * investment)
// Monotonically non-increasing; always >= min_noise_scale (finite, > 0).
export function computeForecastNoiseScale(
  investment: number,
  params: ForecastQualityParams,
): number {
  if (!Number.isFinite(investment) || investment < 0) {
    throw new Error(
      `computeForecastNoiseScale: investment must be a non-negative finite number, got ${investment}`,
    );
  }
  return Math.max(
    params.min_noise_scale,
    params.base_noise_scale - params.quality_slope * investment,
  );
}

// Returns a new Briefing with each scenario forecast perturbed by uniform
// noise in the range [-noiseScale, +noiseScale]. unemployment_outlook is
// clamped to [0, 1] after perturbation. Purity: never mutates inputs.
// The rng argument must be the caller's seeded generator (SPEC-SIM-1).
export function applyForecastQuality(
  briefing: Briefing,
  investment: number,
  params: ForecastQualityParams,
  rng: () => number,
): Briefing {
  const noiseScale = computeForecastNoiseScale(investment, params);
  return {
    ...briefing,
    scenarios: briefing.scenarios.map((s) => ({
      ...s,
      forecast: perturbForecast(s.forecast, noiseScale, rng),
    })) as Briefing["scenarios"],
  };
}

function perturbForecast(
  forecast: BriefingForecast,
  scale: number,
  rng: () => number,
): BriefingForecast {
  const result: BriefingForecast = {
    inflation_outlook: forecast.inflation_outlook + (rng() - 0.5) * 2 * scale,
    unemployment_outlook: Math.max(
      0,
      Math.min(1, forecast.unemployment_outlook + (rng() - 0.5) * 2 * scale),
    ),
  };
  if (forecast.growth_outlook !== undefined) {
    result.growth_outlook = forecast.growth_outlook + (rng() - 0.5) * 2 * scale;
  }
  return result;
}
