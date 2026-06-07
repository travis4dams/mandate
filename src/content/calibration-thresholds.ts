import { join } from "node:path";
import { loadValidatedFile } from "./loader.js";

// Calibration thresholds content type — mirrors schemas/calibration-thresholds.schema.json.
// SPEC-CAL-3: thresholds are content-governed, not hardcoded in tool scripts.

export interface CalibrationThresholds {
  inflation_rmse_max: number;
  unemployment_rmse_max: number;
  policy_rate_rmse_max: number;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/calibration-thresholds.schema.json"
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/calibration-thresholds.json"
);

let _cached: CalibrationThresholds | undefined;

/**
 * Load and validate calibration RMSE thresholds from content.
 * Results are cached in a module-level variable; call _resetCalibrationThresholdsCache()
 * to clear the cache (test-only).
 */
export function loadCalibrationThresholds(): CalibrationThresholds {
  if (_cached !== undefined) return _cached;
  try {
    _cached = loadValidatedFile<CalibrationThresholds>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error(
      "Failed to load calibration thresholds from content/engine/calibration-thresholds.json",
      { cause: e }
    );
  }
  return _cached;
}

/** Test-only: clear the cached thresholds so subsequent calls re-load from disk. */
export function _resetCalibrationThresholdsCache(): void {
  _cached = undefined;
}
