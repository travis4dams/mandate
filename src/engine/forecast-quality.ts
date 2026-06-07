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
    _cache = loadValidatedFile<ForecastQualityParams>(SCHEMA_PATH, PARAMS_PATH);
    if (_cache.min_noise_scale > _cache.base_noise_scale) {
      throw new Error(
        `loadForecastQualityParams: min_noise_scale (${_cache.min_noise_scale}) must be <= base_noise_scale (${_cache.base_noise_scale})`,
      );
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
  if (
    !Number.isFinite(params.base_noise_scale) ||
    !Number.isFinite(params.quality_slope) ||
    !Number.isFinite(params.min_noise_scale)
  ) {
    throw new Error(
      `computeForecastNoiseScale: params fields must all be finite numbers (base_noise_scale=${params.base_noise_scale}, quality_slope=${params.quality_slope}, min_noise_scale=${params.min_noise_scale})`,
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
  const [s0, s1, s2] = briefing.scenarios;
  const scenarios: Briefing["scenarios"] = [
    { ...s0, forecast: perturbForecast(s0.forecast, noiseScale, rng) },
    { ...s1, forecast: perturbForecast(s1.forecast, noiseScale, rng) },
    { ...s2, forecast: perturbForecast(s2.forecast, noiseScale, rng) },
  ];
  return { ...briefing, scenarios };
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
