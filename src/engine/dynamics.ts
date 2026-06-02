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

// Update rule (one month):
// inflation: persistence * current + (1-persistence) * expectations_anchor − phillips contribution
// unemployment: current + rate effect (higher rate above neutral -> higher unemployment)
export function applyMacroDynamics(state: GameState, params: DynamicsParams): GameState {
  const inflation = state.vars.inflation ?? 0;
  const unemployment = state.vars.unemployment ?? params.unemployment_natural_rate;
  const policyRate = state.vars.policy_rate ?? params.neutral_rate;
  const expectationsAnchor = state.vars.expectations_anchor ?? 0;

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
