import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Briefing content type — mirrors schemas/briefing.schema.json.
// Each briefing carries exactly three policy-scenario branches (raise/hold/lower)
// with a macro forecast payload per branch. SPEC-BRIEF-1.

export interface BriefingForecast {
  inflation_outlook: number;
  unemployment_outlook: number;
  growth_outlook?: number;
}

export interface BriefingScenario {
  scenario_type: "raise" | "hold" | "lower";
  name: string;
  forecast: BriefingForecast;
}

export interface Briefing {
  id: string;
  name: string;
  desc: string;
  scenarios: readonly [BriefingScenario, BriefingScenario, BriefingScenario];
}

// Thrown when no briefing with the requested id is found in the search dir.
export class BriefingNotFoundError extends Error {
  constructor(
    public readonly briefingId: string,
    public readonly dir: string,
  ) {
    super(`Briefing "${briefingId}" not found in ${dir}`);
    this.name = "BriefingNotFoundError";
  }
}

// Thrown when a briefing's scenarios are not in the required raise/hold/lower order.
// The schema enforces order for content files; this guards dynamically-constructed
// briefings passed through loadBriefing with an alternate dir.
export class BriefingScenarioOrderError extends Error {
  constructor(
    public readonly briefingId: string,
    public readonly actual: readonly string[],
  ) {
    super(
      `Briefing "${briefingId}": scenarios must be [raise, hold, lower], got [${actual.join(", ")}].`,
    );
    this.name = "BriefingScenarioOrderError";
  }
}

const DEFAULT_BRIEFINGS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/briefings",
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/briefing.schema.json",
);

const REQUIRED_ORDER = ["raise", "hold", "lower"] as const;

export function loadBriefing(id: string, dir: string = DEFAULT_BRIEFINGS_DIR): Briefing {
  const briefings = loadValidated<Briefing>(SCHEMA_PATH, dir);
  const briefing = briefings.find((b) => b.id === id);
  if (!briefing) throw new BriefingNotFoundError(id, dir);

  const actual = briefing.scenarios.map((s) => s.scenario_type);
  if (actual[0] !== "raise" || actual[1] !== "hold" || actual[2] !== "lower") {
    throw new BriefingScenarioOrderError(id, actual);
  }

  return briefing;
}
