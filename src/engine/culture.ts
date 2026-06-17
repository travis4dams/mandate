// SPEC-CULTURE-1: institutional culture drift — EWMA policy_lean + supervisory_rigor.
// Pure functions return new state; they never mutate inputs (SPEC-SIM-1).
// All params loaded from content/engine/culture.json — no numbers in engine code.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";
import type { Division } from "./institution.js";
import { staffedFlagKey } from "./institution.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SPEC-CULTURE-1: culture drift params loaded from content/engine/culture.json. */
export interface CultureParams {
  /** Half-life in months for the policy_lean EWMA. Alpha = 1 - 2^(-1/halflife). */
  policy_lean_halflife: number;
  /** Half-life in months for the supervisory_rigor EWMA. */
  supervisory_rigor_halflife: number;
  /**
   * Baseline supervisory_rigor target when neither supervision nor
   * financial_stability division is staffed. ∈ [0,1].
   */
  initial_supervisory_rigor: number;
  /**
   * SPEC-STAFF-2: how strongly each director's HIDDEN disposition blends into the
   * policy_lean target, alongside their visible lean. Small (a secondary tilt), so
   * a cohort of secretly-hawkish directors gradually pulls the institution hawkish.
   */
  disposition_lean_weight: number;
}

// ---------------------------------------------------------------------------
// Content loader
// ---------------------------------------------------------------------------

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/culture.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/culture.json",
);

let _cachedParams: CultureParams | undefined;

/**
 * Load and validate `content/engine/culture.json`.
 * The validated result is cached in `_cachedParams` (this module).
 */
export function loadCultureParams(): CultureParams {
  if (_cachedParams !== undefined) return _cachedParams;
  let loaded: CultureParams;
  try {
    loaded = loadValidatedFile<CultureParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load culture params from content/engine/culture.json", { cause: e });
  }
  _cachedParams = loaded;
  return _cachedParams;
}

/** Test-only: clear the cache so the next `loadCultureParams()` re-reads. */
export function _resetCultureParamsCache(): void {
  _cachedParams = undefined;
}

// ---------------------------------------------------------------------------
// SPEC-CULTURE-1: pure culture drift
// ---------------------------------------------------------------------------

/**
 * The ids of the two divisions whose effectiveness feeds supervisory_rigor.
 * These ids match the content/divisions/ filenames — no hardcoded behaviour,
 * only id-string comparisons against the catalog supplied by the caller.
 */
const SUPERVISION_ID = "supervision";
const FINANCIAL_STABILITY_ID = "financial_stability";

/**
 * Compute EWMA alpha from a half-life in months.
 *
 * alpha = 1 − 2^(−1/halflife)
 *
 * At this rate, the value closes half the gap to the target every `halflife` months.
 */
function ewmaAlpha(halflife: number): number {
  return 1 - Math.pow(2, -1 / halflife);
}

/**
 * Apply one month of institutional culture drift.
 *
 * **culture.policy_lean** (EWMA toward mean staff lean):
 *   - target = mean of `state.vars["staff.<id>.lean"]` over staffed divisions
 *   - baseline target = 0 when no divisions are staffed
 *   - EWMA: new = old + alpha * (target − old)
 *   - alpha derived from `params.policy_lean_halflife`
 *   - `culture.policy_lean` defaults to 0 when absent from state
 *
 * **culture.supervisory_rigor** (EWMA toward effectiveness-weighted rigor):
 *   - target = eff-weighted average of `staff.supervision.eff` and
 *     `staff.financial_stability.eff` for whichever of those two are staffed
 *   - when neither is staffed, target = `params.initial_supervisory_rigor`
 *   - EWMA: new = old + alpha * (target − old)
 *   - alpha derived from `params.supervisory_rigor_halflife`
 *   - `culture.supervisory_rigor` defaults to `params.initial_supervisory_rigor` when absent
 *
 * Pure: returns a new GameState without mutating the input. (SPEC-SIM-1)
 */
export function applyCultureDrift(
  state: GameState,
  catalog: Division[],
  params: CultureParams,
): GameState {
  // --- policy_lean: EWMA toward mean lean of all staffed divisions ---
  let leanSum = 0;
  let staffedCount = 0;
  for (const div of catalog) {
    if (state.flags[staffedFlagKey(div.id)]) {
      const lean = state.vars[`staff.${div.id}.lean`] ?? 0;
      // SPEC-STAFF-2: blend the hidden disposition into the lean target so a
      // secretly hawkish/dovish cohort tilts the institution over time.
      const disposition = state.vars[`staff.${div.id}.disposition`] ?? 0;
      leanSum += lean + params.disposition_lean_weight * disposition;
      staffedCount += 1;
    }
  }
  // Clamp to [-1,1] so the blended target stays a valid lean even if disposition pushes it past.
  const rawLeanTarget = staffedCount > 0 ? leanSum / staffedCount : 0;
  const leanTarget = Math.max(-1, Math.min(1, rawLeanTarget));
  const prevLean = state.vars["culture.policy_lean"] ?? 0;
  const alphaLean = ewmaAlpha(params.policy_lean_halflife);
  const nextLean = prevLean + alphaLean * (leanTarget - prevLean);

  // --- supervisory_rigor: EWMA toward eff-weighted blend of supervision + financial_stability ---
  let rigorEffSum = 0;  // Σ eff²  (eff-weighted eff = eff * eff, since target = eff)
  let rigorWeightSum = 0; // Σ eff  (denominator)
  for (const div of catalog) {
    if (
      (div.id === SUPERVISION_ID || div.id === FINANCIAL_STABILITY_ID) &&
      state.flags[staffedFlagKey(div.id)]
    ) {
      const eff = state.vars[`staff.${div.id}.eff`] ?? 0;
      rigorEffSum += eff * eff;
      rigorWeightSum += eff;
    }
  }
  const rigorTarget =
    rigorWeightSum > 0
      ? rigorEffSum / rigorWeightSum
      : params.initial_supervisory_rigor;

  const prevRigor = state.vars["culture.supervisory_rigor"] ?? params.initial_supervisory_rigor;
  const alphaRigor = ewmaAlpha(params.supervisory_rigor_halflife);
  const nextRigor = prevRigor + alphaRigor * (rigorTarget - prevRigor);

  return {
    ...state,
    vars: {
      ...state.vars,
      "culture.policy_lean": nextLean,
      "culture.supervisory_rigor": nextRigor,
    },
  };
}
