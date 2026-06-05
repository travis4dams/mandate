// SPEC-LAG-1: distributed-lag kernel — translates the history of real-rate gaps
// into state.vars.output_gap via a weighted sum of past real-rate gaps.
// Weights come from content/engine/lags.json (schema-governed), so no content
// is hardcoded here. applyRateToOutputGap is pure: it returns a new state and
// never mutates its inputs.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState, GameStateSnapshot } from "./state.js";

export interface LagParams {
  policy_to_output_gap: readonly number[];
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/lags.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/lags.json");

let _cachedLagParams: LagParams | undefined;

export function loadLagParams(): LagParams {
  if (_cachedLagParams !== undefined) return _cachedLagParams;
  try {
    _cachedLagParams = loadValidatedFile<LagParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load lag params from content/engine/lags.json", { cause: e });
  }
  return _cachedLagParams;
}

/** Test-only: clear the cache so the next loadLagParams() re-reads and re-validates. */
export function _resetLagParamsCache(): void {
  _cachedLagParams = undefined;
}

/**
 * Compute output_gap as a weighted sum of past real-rate gaps (SPEC-LAG-1).
 *
 * trajectory: array of snapshots in chronological order (oldest first, newest last).
 * Only the last N entries are used (N = weights.length), read in reverse-chron order
 * so index 0 corresponds to the most-recent snapshot and gets the highest weight.
 *
 * A snapshot missing policy_rate or expectations_anchor is silently skipped
 * (contributes 0) so a sparse early trajectory does not throw.
 *
 * Returns new state with vars.output_gap set. Pure: never mutates inputs.
 */
export function applyRateToOutputGap(
  state: GameState,
  trajectory: readonly GameStateSnapshot[],
  lagParams: LagParams,
  realNeutralRate: number,
): GameState {
  const weights = lagParams.policy_to_output_gap;
  const N = weights.length;
  // Take the most recent N snapshots in reverse-chron order (index 0 = most recent).
  const recent = trajectory.slice(-N).reverse();
  let outputGap = 0;
  for (let k = 0; k < weights.length; k++) {
    const snap = recent[k];
    if (snap === undefined) break;
    const pr = snap.vars.policy_rate;
    const ea = snap.vars.expectations_anchor;
    if (pr === undefined || ea === undefined) continue;
    const realGap = (pr - ea) - realNeutralRate;
    outputGap += weights[k]! * realGap;
  }
  return {
    ...state,
    vars: { ...state.vars, output_gap: outputGap },
  };
}
