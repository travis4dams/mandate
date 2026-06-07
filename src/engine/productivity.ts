import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface ProductivityParams {
  monthly_drift_rate: number;
}

/**
 * SPEC-PROD-1: pure productivity drift — never mutates the input state.
 *
 * Reads `state.vars.productivity` (defaults to 1.0 if absent) and returns a new
 * state with `productivity *= (1 + params.monthly_drift_rate)`.
 * `monthly_drift_rate` may be positive (growth) or negative (stagnation/decline).
 */
export function applyProductivityDrift(state: GameState, params: ProductivityParams): GameState {
  if (!Number.isFinite(params.monthly_drift_rate)) {
    throw new Error(`productivity: params.monthly_drift_rate is not finite (got ${params.monthly_drift_rate})`);
  }
  const prev = state.vars.productivity ?? 1.0;
  if (!Number.isFinite(prev)) {
    throw new Error("productivity: state.vars.productivity is not finite");
  }
  return {
    ...state,
    vars: { ...state.vars, productivity: prev * (1 + params.monthly_drift_rate) },
  };
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/productivity.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/productivity.json",
);

let _cachedParams: ProductivityParams | undefined;

/**
 * Load and validate `content/engine/productivity.json`.
 * The validated result is cached in `_cachedParams` (this module). The AJV compile
 * cache is a separate concern in `loader.ts` — `_resetProductivityParamsCache`
 * does not clear it.
 */
export function loadProductivityParams(): ProductivityParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<ProductivityParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load productivity params from content/engine/productivity.json", { cause: e });
  }
  // SPEC-PROD-1: JSON Schema enforces exclusiveMinimum: -1, but assert here for defence-in-depth.
  if (_cachedParams.monthly_drift_rate <= -1) {
    throw new Error(`productivity: monthly_drift_rate must be > -1, got ${_cachedParams.monthly_drift_rate}`);
  }
  return _cachedParams;
}

/** Test-only: clear the cache so the next `loadProductivityParams()` re-reads. */
export function _resetProductivityParamsCache(): void {
  _cachedParams = undefined;
}
