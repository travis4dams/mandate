import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface CongressParams {
  /** Deferred-asset level above which Congress opens an inquiry (same units as deferred_asset). */
  inquiry_threshold: number;
  /** Political capital deducted each month the deferred asset exceeds the threshold. Clamped ≥ 0. */
  political_capital_drain: number;
  /** Independence points deducted each month above threshold. Clamped [0,100]. */
  independence_drain: number;
  /** Default `independence` when absent from state (the fiscal-dominance axis, ∈ [0,100]). */
  initial_independence: number;
}

/**
 * SPEC-CONGRESS-1: pure congressional-pressure step — never mutates the input state.
 *
 * When `deferred_asset > inquiry_threshold`:
 *   - deducts `political_capital_drain` from `political_capital` (clamped ≥ 0)
 *   - deducts `independence_drain` from `independence` (clamped [0,100])
 *   - sets `flags["pending_inquiry.deferred_asset"] = true`
 *
 * Below the threshold: no-op. Clears `pending_inquiry.deferred_asset` once `deferred_asset <= 0`.
 * `independence` defaults to `params.initial_independence` when absent from state.
 */
export function applyCongressionalPressure(state: GameState, params: CongressParams): GameState {
  const deferredAsset = state.vars.deferred_asset ?? 0;
  const independence = state.vars.independence ?? params.initial_independence;

  if (deferredAsset > params.inquiry_threshold) {
    const politicalCapital = state.vars.political_capital ?? 0;
    const newPoliticalCapital = Math.max(0, politicalCapital - params.political_capital_drain);
    const newIndependence = Math.min(100, Math.max(0, independence - params.independence_drain));
    return {
      ...state,
      vars: {
        ...state.vars,
        political_capital: newPoliticalCapital,
        independence: newIndependence,
      },
      flags: {
        ...state.flags,
        "pending_inquiry.deferred_asset": true,
      },
    };
  }

  // Below threshold — no-op, but clear the flag once deferred_asset returns to 0.
  if (deferredAsset <= 0 && state.flags["pending_inquiry.deferred_asset"]) {
    return {
      ...state,
      flags: {
        ...state.flags,
        "pending_inquiry.deferred_asset": false,
      },
    };
  }

  return state;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/congress.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/congress.json",
);

let _cachedParams: CongressParams | undefined;

/**
 * Load and validate `content/engine/congress.json`.
 * The validated result is cached in `_cachedParams` (this module). The AJV compile
 * cache is a separate concern in `loader.ts` — `_resetCongressParamsCache`
 * does not clear it.
 */
export function loadCongressParams(): CongressParams {
  if (_cachedParams !== undefined) return _cachedParams;
  let loaded: CongressParams;
  try {
    loaded = loadValidatedFile<CongressParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load congress params from content/engine/congress.json", { cause: e });
  }
  _cachedParams = loaded;
  return _cachedParams;
}

/** Test-only: clear the cache so the next `loadCongressParams()` re-reads. */
export function _resetCongressParamsCache(): void {
  _cachedParams = undefined;
}
