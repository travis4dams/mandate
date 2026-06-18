// SPEC-SIM-6: sub-monthly tick cadence.
//
// Session.advance() runs ticks_per_month dynamics steps per calendar month.
// scaleParamsForTick re-expresses monthly params as per-tick params so the
// macro trajectory is invariant to cadence:
//   - AR(1) persistence: p_tick = p_monthly^(1/n)  [exact for geometric decay]
//   - Mean-reversion speed: α_tick = 1 − (1−α_monthly)^(1/n)  [exact for linear AR]
//   - Flow contributions (phillips_slope, expectations_adaptivity, expectations_anchor_pull, credibility_mission_gain, credibility_drain_rate): divided by n  [first-order approximation, error O(α²/n)]
//   - Structural params (natural rates, targets, thresholds): unchanged
//
// Documented tolerance: monthly and weekly (n=4) trajectories agree within 0.2pp
// over 36 months; typical error < 0.01pp.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { MacroDynamicsParams } from "./dynamics.js";

export interface ClockCadenceParams {
  /** Number of simulation ticks per calendar month. 1 = monthly, 4 = weekly. Integer in [1, 31]; validated by schemas/clock-cadence.schema.json. */
  ticks_per_month: number;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/clock-cadence.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/clock-cadence.json",
);

let _cachedClockCadenceParams: ClockCadenceParams | undefined;

export function loadClockCadenceParams(): ClockCadenceParams {
  if (_cachedClockCadenceParams !== undefined) return _cachedClockCadenceParams;
  try {
    _cachedClockCadenceParams = loadValidatedFile<ClockCadenceParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error(
      `Failed to load clock cadence params from content/engine/clock-cadence.json: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  return _cachedClockCadenceParams;
}

/** Test-only: clear the cache so the next loadClockCadenceParams() re-reads. */
export function _resetClockCadenceParamsCache(): void {
  _cachedClockCadenceParams = undefined;
}

/**
 * Re-express monthly MacroDynamicsParams as per-tick params for n ticks per month.
 * Returns the same reference when n === 1 (identity, no allocation).
 */
export function scaleParamsForTick(params: MacroDynamicsParams, n: number): Readonly<MacroDynamicsParams> {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`scaleParamsForTick: n must be a positive integer, got ${n}`);
  }
  if (n === 1) return params;
  return {
    ...params,
    // AR(1) memory: composing n ticks reproduces the monthly persistence exactly.
    inflation_persistence: Math.pow(params.inflation_persistence, 1 / n),
    // Mean-reversion: exact discrete-time scaling so the gap closes at the same rate.
    unemployment_adjustment_speed: 1 - Math.pow(1 - params.unemployment_adjustment_speed, 1 / n),
    // Flow contributions: first-order linear scaling (error O(α²/n) ≈ negligible).
    phillips_slope: params.phillips_slope / n,
    expectations_adaptivity: params.expectations_adaptivity / n,
    expectations_anchor_pull: params.expectations_anchor_pull / n,
    credibility_mission_gain: params.credibility_mission_gain / n,
    credibility_drain_rate: params.credibility_drain_rate / n,
  };
}
