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
  const prev = (state.vars.productivity as number | undefined) ?? 1.0;
  return {
    ...state,
    vars: { ...state.vars, productivity: prev * (1 + params.monthly_drift_rate) },
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
 * Compiled AJV validator and result are cached module-level; safe to call every month.
 */
export function loadProductivityParams(): ProductivityParams {
  if (_cached !== undefined) return _cached;
  _cached = loadValidatedFile<ProductivityParams>(SCHEMA, FILE);
  return _cached;
}

/** Test-only: clear the cache so the next `loadProductivityParams()` re-reads. */
export function _resetProductivityParamsCache(): void {
  _cached = undefined;
}
