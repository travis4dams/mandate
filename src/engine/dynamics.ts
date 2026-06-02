// SPEC-SIM-5: pure monthly macro dynamics.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface DynamicsParams {
  phillips_slope: number;
  unemployment_natural_rate: number;
  rate_sensitivity: number;
  neutral_rate: number;
  inflation_persistence: number;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/dynamics.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/dynamics.json");

let _cachedParams: DynamicsParams | undefined;

export function loadDynamicsParams(): DynamicsParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<DynamicsParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load dynamics params from content/engine/dynamics.json", { cause: e });
  }
  return _cachedParams;
}

/** Test-only: clear the cache so the next loadDynamicsParams() re-reads and re-validates
 *  the JSON. AJV's compiled validator is cached separately in loader.ts and is not affected. */
export function _resetDynamicsParamsCache(): void {
  _cachedParams = undefined;
}

// All four inputs are in Session.REQUIRED_VARS, so loadScenario's MissingVarsError catches
// any omission at scenario load time. Trust that boundary guard — adding silent `?? <default>`
// fallbacks here would either inject a directional error (inflation pulled to 0, anchor pulled
// to 0) or mask a real content authoring bug. Per CLAUDE.md: "Don't add error handling for
// scenarios that can't happen."
export function applyMacroDynamics(state: GameState, params: DynamicsParams): GameState {
  const inflation = state.vars.inflation as number;
  const unemployment = state.vars.unemployment as number;
  const policyRate = state.vars.policy_rate as number;
  const expectationsAnchor = state.vars.expectations_anchor as number;

  const unemploymentGap = unemployment - params.unemployment_natural_rate;
  const rateGap = policyRate - params.neutral_rate;

  const newInflation =
    params.inflation_persistence * inflation +
    (1 - params.inflation_persistence) * expectationsAnchor -
    params.phillips_slope * unemploymentGap;

  const newUnemployment = unemployment + params.rate_sensitivity * rateGap;

  return {
    ...state,
    vars: {
      ...state.vars,
      inflation: Math.max(0, newInflation),
      unemployment: Math.max(0, Math.min(1, newUnemployment)),
    },
  };
}
