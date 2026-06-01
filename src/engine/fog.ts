// SPEC-FOG-1: data fog mechanic — history-aware lag + deterministic noise.

import { join } from "node:path";
import { loadValidated } from "../content/loader.js";
import type { GameState } from "./state.js";

interface FogParams {
  noise_scale: number;
  lag_months: number;
}

// Partial view — full schema: schemas/engine-params.schema.json
interface FogParamsSection {
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

function loadFogParams(): FogParamsSection {
  const loaded = loadValidated<FogParamsSection>(SCHEMA_PATH, PARAMS_DIR);
  if (!loaded[0] || !loaded[0].fog) {
    throw new Error("Engine params content/engine/params.json not found or schema-invalid");
  }
  return loaded[0];
}

// Load params once at module level (content is static; hot-reload not needed).
const params: FogParamsSection = loadFogParams();

// observe() is pure: no Math.random(), no Date, no mutation of input.
// SPEC-FOG-1 lag indexing: lag_months===0 → current; lag_months>=1 → history[lag_months-1];
// if history is shorter than lag_months → current (graceful fallback).
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

  let truth: number;
  if (lag_months === 0) {
    if (!(seriesId in state.vars)) {
      throw new Error(`fog: series "${seriesId}" missing from state.vars`);
    }
    truth = state.vars[seriesId];
  } else if (state.history.length >= lag_months) {
    const slot = state.history[lag_months - 1];
    if (!(seriesId in slot.vars)) {
      throw new Error(`fog: series "${seriesId}" missing from state.history[${lag_months - 1}].vars`);
    }
    truth = slot.vars[seriesId];
  } else {
    // History is shorter than requested lag — fall back to current value.
    if (!(seriesId in state.vars)) {
      throw new Error(`fog: series "${seriesId}" missing from state.vars (fallback path)`);
    }
    truth = state.vars[seriesId];
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
