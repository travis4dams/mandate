// SPEC-FOG-1: data fog mechanic — history-aware lag + deterministic noise.
// observe() is a pure function: no Math.random(), no Date, no mutation of input.

import { join } from "node:path";
import { loadValidated } from "../content/loader.js";
import type { GameState } from "./state.js";

interface FogParams {
  noise_scale: number;
  lag_months: number;
}

interface EngineParams {
  fog: Record<string, FogParams>;
}

// cwd-safe path resolution — mirrors src/content/scenarios.ts pattern.
const PARAMS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/engine-params.schema.json"
);

// Load params once at module level (content is static; hot-reload not needed).
const params: EngineParams = loadValidated<EngineParams>(SCHEMA_PATH, PARAMS_DIR)[0];

/**
 * Return a fogged observation of `seriesId` from `state`.
 *
 * Lag indexing (AC-4, locked):
 *   lag_months === 0  →  state.vars[seriesId]  (current)
 *   lag_months >= 1 && history.length >= lag_months
 *                     →  state.history[lag_months - 1].vars[seriesId]
 *   lag_months >= 1 && history.length < lag_months
 *                     →  state.vars[seriesId]  (graceful fallback)
 *
 * Noise: Box-Muller transform of two rng() calls produces standard-normal z;
 *   observed = truth + noise_scale * z
 *
 * @throws {Error} if seriesId is not present in content/engine/params.json#fog.
 */
export function observe(
  state: GameState,
  seriesId: string,
  rng: () => number
): number {
  const fogEntry = params.fog[seriesId];
  if (fogEntry === undefined) {
    throw new Error(
      `observe: unknown seriesId "${seriesId}" — add it to content/engine/params.json#fog`
    );
  }

  const { noise_scale, lag_months } = fogEntry;

  // Determine the truth value according to lag indexing.
  let truth: number;
  if (lag_months === 0) {
    truth = state.vars[seriesId] ?? 0;
  } else if (state.history.length >= lag_months) {
    truth = state.history[lag_months - 1].vars[seriesId] ?? 0;
  } else {
    // History is shorter than requested lag — fall back to current value.
    truth = state.vars[seriesId] ?? 0;
  }

  if (noise_scale === 0) {
    return truth;
  }

  // Box-Muller transform: two uniform samples → standard-normal z.
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 === 0 ? Number.EPSILON : u1)) *
            Math.cos(2 * Math.PI * u2);

  return truth + noise_scale * z;
}
