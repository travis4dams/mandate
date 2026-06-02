// SPEC-MANDATE-1: pure mandate evaluator — no Math.random(), no Date.now().
// loadMandateParams mutates the module-level _cachedParams; onTarget is a pure function.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import { VoteMissingVarError } from "./fomc.js";
import type { GameState } from "./state.js";

export interface MandateParams {
  target_inflation: number;
  tolerance_band: number;
  mandate_type: "single" | "dual";
  unemployment_target: number;
  unemployment_band: number;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/mandate.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/mandate.json");

let _cachedParams: MandateParams | undefined;

export function loadMandateParams(): MandateParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<MandateParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load mandate params from content/engine/mandate.json", { cause: e });
  }
  return _cachedParams;
}

/** Test-only: clear the cached mandate params so subsequent calls re-load from disk. */
export function _resetMandateParamsCache(): void {
  _cachedParams = undefined;
}

export function onTarget(state: GameState, params: MandateParams): boolean {
  const inflation = state.vars.inflation;
  if (inflation === undefined) throw new VoteMissingVarError("inflation", "missing");
  if (!Number.isFinite(inflation)) throw new VoteMissingVarError("inflation", "non_finite");
  const inflationOnTarget = Math.abs(inflation - params.target_inflation) <= params.tolerance_band;
  if (params.mandate_type === "single") return inflationOnTarget;
  const unemployment = state.vars.unemployment;
  if (unemployment === undefined) throw new VoteMissingVarError("unemployment", "missing");
  if (!Number.isFinite(unemployment)) throw new VoteMissingVarError("unemployment", "non_finite");
  return inflationOnTarget && Math.abs(unemployment - params.unemployment_target) <= params.unemployment_band;
}
