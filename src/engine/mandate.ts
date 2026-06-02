// SPEC-MANDATE-1: pure mandate evaluator — no Math.random(), no Date.now(), no mutation.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
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

export function onTarget(state: GameState, params: MandateParams): boolean {
  const inflation = state.vars.inflation ?? 0;
  const inflationOnTarget = Math.abs(inflation - params.target_inflation) <= params.tolerance_band;
  if (params.mandate_type === "single") return inflationOnTarget;
  const unemployment = state.vars.unemployment ?? 0;
  return inflationOnTarget && Math.abs(unemployment - params.unemployment_target) <= params.unemployment_band;
}
