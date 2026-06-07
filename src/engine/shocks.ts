// SPEC-SHOCK-1: seeded supply-shock term in the Phillips curve.
//
// A pure applySupplyShock() draws a normally-distributed shock from the caller's
// seeded RNG (never Math.random() — SPEC-SIM-1), adds it to state.vars.inflation,
// and clamps the result at 0. The function is pure: input state is not mutated.
//
// Normal samples are generated via the Box-Muller transform, which consumes two
// uniform draws per call. Both draws come from the caller's seeded rng.

import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface ShocksParams {
  supply_shock_sigma: number;
}

// Box-Muller transform: produces one standard-normal sample from two uniform [0,1) draws.
// Uses the caller's seeded rng — never Math.random(). SPEC-SIM-1.
function sampleNormal(rng: () => number, mean: number, std: number): number {
  // Avoid log(0) by looping until u1 is non-zero. In practice mulberry32 never
  // returns exactly 0, but this guard ensures Math.log(0) = -Infinity can never
  // propagate as NaN through subsequent arithmetic.
  let u1 = 0;
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  // Box-Muller: z = sqrt(-2 * ln(u1)) * cos(2π * u2)
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

/**
 * SPEC-SHOCK-1: Apply a seeded supply shock to state.vars.inflation.
 *
 * Pure: does not mutate the input state. The returned state has only `inflation` changed.
 * When sigma=0, returns the original state reference unchanged.
 * The shock is normally distributed with mean 0 and std `params.supply_shock_sigma`.
 * Result is clamped at 0 (inflation can never go negative via a shock).
 *
 * @param state  Current game state (not mutated).
 * @param rng    Caller's seeded RNG — must be a mulberry32 instance (SPEC-SIM-1).
 * @param params Shock params; supply_shock_sigma >= 0.
 */
export function applySupplyShock(
  state: GameState,
  rng: () => number,
  params: ShocksParams,
): GameState {
  if (params.supply_shock_sigma === 0) return state;
  if (!Number.isFinite(state.vars.inflation as number | undefined)) {
    throw new Error(`applySupplyShock: state.vars.inflation is not finite: ${state.vars.inflation}`);
  }
  const shock = sampleNormal(rng, 0, params.supply_shock_sigma);
  const newInflation = Math.max(0, (state.vars.inflation as number) + shock);
  return {
    ...state,
    vars: { ...state.vars, inflation: newInflation },
  };
}

// --- Content loader ---

const SHOCKS_SCHEMA = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/shocks.schema.json",
);
const SHOCKS_FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/shocks.json",
);

let _cachedShocksParams: ShocksParams | undefined;

/** Load and cache the shocks params from content/engine/shocks.json. */
export function loadShocksParams(): ShocksParams {
  if (_cachedShocksParams !== undefined) return _cachedShocksParams;
  try {
    _cachedShocksParams = loadValidatedFile<ShocksParams>(SHOCKS_SCHEMA, SHOCKS_FILE);
  } catch (e) {
    throw new Error(
      "Failed to load shocks params from content/engine/shocks.json",
      { cause: e },
    );
  }
  return _cachedShocksParams;
}

/** Test-only: clear the cache so the next loadShocksParams() re-reads from disk. */
export function _resetShocksParamsCache(): void {
  _cachedShocksParams = undefined;
}
