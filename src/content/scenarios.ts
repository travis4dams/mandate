import { join } from "node:path";
import { loadValidated } from "./loader.js";
import { makeState, type GameState } from "../engine/state.js";

// Scenario content type — mirrors schemas/scenario.schema.json.
export interface Scenario {
  id: string;
  date: string;
  name: string;
  desc: string;
  vars: Record<string, number>;
  flags: Record<string, boolean>;
  /** True for player-facing scenarios offered by the start screen (SPEC-WEB-10 filter). */
  playable?: boolean;
  /** Optional briefing content id shown in this scenario's meetings. */
  briefing?: string;
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

let _catalogCache: Scenario[] | null = null;

/**
 * Load the full scenario catalog (the start screen filters it on
 * `playable === true`). Cached after the first read.
 */
export function loadScenarioCatalog(): Scenario[] {
  if (_catalogCache !== null) return _catalogCache;
  _catalogCache = loadValidated<Scenario>(SCHEMA_PATH, SCENARIOS_DIR);
  return _catalogCache;
}

/** Test-only: clear the scenario catalog cache. */
export function _resetScenarioCatalogCache(): void {
  _catalogCache = null;
}

/**
 * Load a scenario by id and return the initial GameState.
 *
 * @param id          - The scenario id, e.g. "scen.1979_stagflation".
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
