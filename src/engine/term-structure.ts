// SPEC-TERM-1: term structure — long_rate EWMA toward policy_rate.
//
// The long end of the yield curve adjusts gradually toward the current policy rate via an
// exponential weighted moving average (EWMA). The convergence speed is governed by a
// half-life (in months) from content/engine/term-structure.json (schema-governed).
//
// λ = 1 - exp(-ln(2) / half_life_months)
// long_rate_new = (1 - λ) * long_rate + λ * policy_rate
//
// If long_rate is absent from state (cold-start), it defaults to policy_rate,
// making the first output exactly equal to policy_rate.
//
// Pure: returns a new GameState and never mutates the input.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface TermStructureParams {
  half_life_months: number;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/term-structure.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/term-structure.json",
);

let _cachedParams: TermStructureParams | undefined;

/** Lazy-loaded, cached term-structure params from content/engine/term-structure.json. */
export function loadTermStructureParams(): TermStructureParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<TermStructureParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error(
      "Failed to load term-structure params from content/engine/term-structure.json",
      { cause: e },
    );
  }
  return _cachedParams;
}

/** Test-only: clear the cache so the next loadTermStructureParams() re-reads and re-validates. */
export function _resetTermStructureParamsCache(): void {
  _cachedParams = undefined;
}

/**
 * Apply one month of EWMA convergence of long_rate toward policy_rate (SPEC-TERM-1).
 *
 * λ = 1 - exp(-ln(2) / half_life_months)
 * long_rate_new = (1 - λ) * long_rate + λ * policy_rate
 *
 * Cold-start: if state.vars.long_rate is absent, defaults to policy_rate, making
 * the output on the first tick exactly equal to policy_rate.
 *
 * Pure: returns a new GameState; never mutates the input.
 */
export function applyTermStructure(
  state: GameState,
  params: TermStructureParams,
): GameState {
  const policyRate = state.vars.policy_rate as number;
  const prevLong = (state.vars.long_rate as number | undefined) ?? policyRate;
  const lambda = 1 - Math.exp(-Math.LN2 / params.half_life_months);
  const newLong = (1 - lambda) * prevLong + lambda * policyRate;
  return {
    ...state,
    vars: { ...state.vars, long_rate: newLong },
  };
}
