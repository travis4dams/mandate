import { join } from "node:path";
import { loadValidated } from "./loader.js";
import { makeState, type GameState } from "../engine/state.js";

// Scenario content type — mirrors schemas/scenario.schema.json.
interface Scenario {
  id: string;
  date: string;
  name: string;
  desc: string;
  vars: Record<string, number>;
  flags: Record<string, boolean>;
}

// Thrown when the caller requests vars that are absent from the scenario.
// Prevents the silent-default-to-0 failure mode.
export class MissingVarsError extends Error {
  constructor(
    public readonly missing: string[],
    scenarioId: string
  ) {
    super(
      `Scenario "${scenarioId}" is missing required vars: ${missing.join(", ")}`
    );
    this.name = "MissingVarsError";
  }
}

// Thrown when no scenario with the requested id is found.
export class ScenarioNotFoundError extends Error {
  constructor(id: string) {
    super(`Scenario "${id}" not found in content/scenarios/`);
    this.name = "ScenarioNotFoundError";
  }
}

const SCENARIOS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/scenarios"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/scenario.schema.json"
);

/**
 * Load a scenario by id and return the initial GameState.
 *
 * @param id          - The scenario id, e.g. "scen.1979_volcker".
 * @param requiredVars - If provided, throws MissingVarsError if any key is absent
 *                       from the scenario's vars — preventing silent defaults to 0.
 */
export function loadScenario(
  id: string,
  requiredVars?: string[]
): GameState {
  const scenarios = loadValidated<Scenario>(SCHEMA_PATH, SCENARIOS_DIR);
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) {
    throw new ScenarioNotFoundError(id);
  }

  if (requiredVars && requiredVars.length > 0) {
    const missing = requiredVars.filter(
      (key) => !(key in scenario.vars)
    );
    if (missing.length > 0) {
      throw new MissingVarsError(missing, id);
    }
  }

  return makeState({
    date: scenario.date,
    vars: scenario.vars,
    flags: scenario.flags,
    // history: [] is the makeState default
  });
}
