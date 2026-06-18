// SPEC-SIM-6: sub-monthly tick cadence.
//
// Session.advance() runs ticks_per_month dynamics steps per calendar month.
// scaleParamsForTick re-expresses monthly params as per-tick params so the
// macro trajectory is invariant to cadence:
//   - AR(1) persistence: p_tick = p_monthly^(1/n)  [exact for geometric decay]
//   - Mean-reversion speed: α_tick = 1 − (1−α_monthly)^(1/n)  [exact for linear AR]
//   - Soft-ceiling drain rate: `1 − (1−rate)^(1/n)` — exact when drain is the sole active credibility term; first-order approximation when `credibility_mission_gain` is simultaneously active (cross-term error; 2pp loose tripwire in cadence.test.ts guards against gross divergence)
//   - Flow contributions (phillips_slope, expectations_adaptivity, expectations_anchor_pull, credibility_mission_gain): divided by n  [first-order approximation, error O(α²/n)]
//   - Structural params (natural rates, targets, thresholds): unchanged
//
// Documented tolerance: monthly and weekly (n=4) trajectories agree within 0.2pp
// over 36 months for inflation, unemployment, and expectations_anchor; typical error < 0.01pp.
// Credibility cadence invariance is tested at two levels: a tight 0.002-point test for the
// isolated-drain case (fixed-point state, mission_gain = 0, where geometric scaling is exact);
// and a loose 2pp tripwire for the combined (drain + active mission_gain) case. The combined
// trajectory is a first-order approximation — the drain's geometric scaling is exact in isolation,
// but the cross-term interaction with the /n-scaled mission_gain introduces error.
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
  // Guard runs before the n=1 early-return so callers always receive a validated-or-thrown
  // result. applyMacroDynamics uses drain_rate directly and has no guard for it; accepting
  // an invalid rate for n=1 and returning it unchanged would let the bad value propagate.
  if (!Number.isFinite(params.credibility_drain_rate) || params.credibility_drain_rate <= 0 || params.credibility_drain_rate >= 1) {
    throw new RangeError(
      `scaleParamsForTick: credibility_drain_rate must be a finite number in (0,1), got ${params.credibility_drain_rate}`,
    );
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
    // Drain is AR(1) toward soft_ceiling — exact geometric scaling for the drain alone;
    // first-order approximation when mission_gain is also active (see module header).
    credibility_drain_rate: 1 - Math.pow(1 - params.credibility_drain_rate, 1 / n),
  };
}
