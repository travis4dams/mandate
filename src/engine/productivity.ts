// SPEC-PROD-1: total-factor productivity drift.
//
// A pure `applyProductivityDrift(state, params)` evolves `state.vars.productivity`
// each month by a content-governed fractional growth rate. The rate lives in
// `content/engine/productivity.json` (schema: `schemas/productivity.schema.json`).
// No content is hardcoded here — all numbers flow from content. (CLAUDE.md)
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
  const prev = state.vars.productivity;
  if (prev !== undefined && !Number.isFinite(prev)) {
    throw new Error("productivity: state.vars.productivity is not finite");
  }
  const current = prev ?? 1.0;
  return {
    ...state,
    vars: { ...state.vars, productivity: current * (1 + params.monthly_drift_rate) },
  };
}

const SCHEMA = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/productivity.schema.json",
);
const FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/productivity.json",
);

let _cached: ProductivityParams | undefined;

/**
 * Load and validate `content/engine/productivity.json`.
 * The validated result is cached in `_cached` (this module). The AJV compile
 * cache is a separate concern in `loader.ts` — `_resetProductivityParamsCache`
 * does not clear it.
 */
export function loadProductivityParams(): ProductivityParams {
  if (_cached !== undefined) return _cached;
  try {
    _cached = loadValidatedFile<ProductivityParams>(SCHEMA, FILE);
  } catch (e) {
    throw new Error("Failed to load productivity params from content/engine/productivity.json", { cause: e });
  }
  // SPEC-PROD-1: JSON Schema enforces exclusiveMinimum: -1, but assert here for defence-in-depth.
  if (_cached.monthly_drift_rate <= -1) {
    throw new Error(`productivity: monthly_drift_rate must be > -1, got ${_cached.monthly_drift_rate}`);
  }
  return _cached;
}

/** Test-only: clear the cache so the next `loadProductivityParams()` re-reads. */
export function _resetProductivityParamsCache(): void {
  _cached = undefined;
}
