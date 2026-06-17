import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface FragilityParams {
  /** Default bank_fragility when absent from state. ∈ [0,1]. */
  initial_fragility: number;
  /** Baseline monthly fragility accumulation (always positive). */
  base: number;
  /** Multiplier on max(0, -realGap): loose policy breeds fragility. */
  loose_policy_weight: number;
  /** Multiplier on max(0, easingSpeed): sustained easing breeds fragility. */
  easing_weight: number;
  /** Multiplier on (1 - supervisoryRigor): lax supervision compounds fragility. */
  lax_weight: number;
  /** Decay multiplier for fragilityMitigation ∈ [0,1]. */
  supervisory_decay: number;
  /** Unconditional monthly fragility decay (baseline healing). */
  natural_decay: number;
}

/**
 * SPEC-FRAG-1: pure banking-fragility dynamics — never mutates the input state.
 *
 * Computes:
 *   accumulation = base
 *     + loose_policy_weight * max(0, -realGap)   // loose policy breeds fragility
 *     + easing_weight       * max(0, easingSpeed) // sustained easing breeds fragility
 *     + lax_weight          * (1 - supervisoryRigor) // lax culture compounds it
 *   mitigation   = supervisory_decay * fragilityMitigation + natural_decay
 *   fragility    = clamp(prev + accumulation - mitigation, 0, 1)
 *
 * `bank_fragility` defaults to `params.initial_fragility` when absent from state.
 */
export function applyFragilityDynamics(
  state: GameState,
  inputs: {
    realGap: number;
    easingSpeed: number;
    supervisoryRigor: number;
    fragilityMitigation: number;
  },
  params: FragilityParams,
): GameState {
  const prev = state.vars["bank_fragility"] ?? params.initial_fragility;

  const accumulation =
    params.base +
    params.loose_policy_weight * Math.max(0, -inputs.realGap) +
    params.easing_weight * Math.max(0, inputs.easingSpeed) +
    params.lax_weight * (1 - inputs.supervisoryRigor);

  const mitigation =
    params.supervisory_decay * inputs.fragilityMitigation + params.natural_decay;

  const next = Math.min(1, Math.max(0, prev + accumulation - mitigation));

  return {
    ...state,
    vars: { ...state.vars, bank_fragility: next },
  };
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/fragility.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/fragility.json",
);

let _cachedParams: FragilityParams | undefined;

/**
 * Load and validate `content/engine/fragility.json`.
 * The validated result is cached in `_cachedParams` (this module).
 */
export function loadFragilityParams(): FragilityParams {
  if (_cachedParams !== undefined) return _cachedParams;
  let loaded: FragilityParams;
  try {
    loaded = loadValidatedFile<FragilityParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load fragility params from content/engine/fragility.json", { cause: e });
  }
  _cachedParams = loaded;
  return _cachedParams;
}

/** Test-only: clear the cache so the next `loadFragilityParams()` re-reads. */
export function _resetFragilityParamsCache(): void {
  _cachedParams = undefined;
}
