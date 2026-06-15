// SPEC-INST-1 + SPEC-INST-2: institution resources and division staffing.
// All randomness flows through fnv1a32 + mulberry32 (SPEC-SIM-1).
// Pure functions return new state; they never mutate inputs.
import { join } from "node:path";
import { loadValidatedFile, loadValidated } from "../content/loader.js";
import { mulberry32, fnv1a32 } from "./rng.js";
import type { NamePools, GeneratedName } from "./names.js";
import { generateName } from "./names.js";
import type { GameState } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SPEC-INST-1: institution resource params loaded from content/engine/institution.json. */
export interface InstitutionParams {
  initial_operating_budget: number;
  budget_monthly_growth: number;
  initial_political_capital: number;
  political_capital_baseline: number;
  political_capital_recovery: number;
  /** SPEC-INST-2: number of candidates generated per division hire cycle. */
  candidate_slate_size: number;
}

/** SPEC-INST-2: a single division from content/divisions/. */
export interface Division {
  id: string;
  name: string;
  desc: string;
  hire_cost: number;
  investment: number;
}

/** SPEC-INST-2: policy orientation of a division head candidate. */
export type Lean = "hawk" | "dove" | "centrist";

/** SPEC-INST-2: a candidate for a division head position. */
export interface Candidate {
  name: string;
  competence: number;
  lean: Lean;
}

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

/** Thrown by hireStaff when political_capital < division.hire_cost. */
export class InsufficientCapitalError extends Error {
  constructor(have: number, need: number) {
    super(`InsufficientCapitalError: need ${need} political capital, have ${have}`);
    this.name = "InsufficientCapitalError";
  }
}

/** Thrown by hireStaff when the division is already staffed. */
export class DivisionAlreadyStaffedError extends Error {
  constructor(divisionId: string) {
    super(`DivisionAlreadyStaffedError: division "${divisionId}" is already staffed`);
    this.name = "DivisionAlreadyStaffedError";
  }
}

// ---------------------------------------------------------------------------
// Content loader paths
// ---------------------------------------------------------------------------

const INST_SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/institution.schema.json",
);
const INST_FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/institution.json",
);

const DIV_SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/division.schema.json",
);
const DIV_DIR_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/divisions",
);

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

let _cachedParams: InstitutionParams | undefined;
let _cachedCatalog: Division[] | undefined;

// ---------------------------------------------------------------------------
// SPEC-INST-1: institution params loader
// ---------------------------------------------------------------------------

/**
 * Load and validate content/engine/institution.json.
 * Result is module-cached after the first successful call.
 */
export function loadInstitutionParams(): InstitutionParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<InstitutionParams>(INST_SCHEMA_PATH, INST_FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load institution params from content/engine/institution.json", { cause: e });
  }
  return _cachedParams;
}

/** Test-only: clear the module-level institution params cache. */
export function _resetInstitutionParamsCache(): void {
  _cachedParams = undefined;
}

// ---------------------------------------------------------------------------
// SPEC-INST-1: pure institution dynamics
// ---------------------------------------------------------------------------

/**
 * Apply one month of institution dynamics:
 *   operating_budget *= (1 + budget_monthly_growth)
 *   political_capital += political_capital_recovery * (political_capital_baseline - political_capital)
 *
 * Both vars default to their `params.initial_*` value when absent from state
 * (matches SPEC-PROD-1 pattern so existing scenarios are unaffected).
 *
 * Pure: returns a new GameState without mutating the input.
 */
export function applyInstitutionDynamics(state: GameState, params: InstitutionParams): GameState {
  const prevBudget = state.vars.operating_budget ?? params.initial_operating_budget;
  const prevCapital = state.vars.political_capital ?? params.initial_political_capital;

  const nextBudget = prevBudget * (1 + params.budget_monthly_growth);
  const nextCapital =
    prevCapital +
    params.political_capital_recovery * (params.political_capital_baseline - prevCapital);

  return {
    ...state,
    vars: {
      ...state.vars,
      operating_budget: nextBudget,
      political_capital: nextCapital,
    },
  };
}

// ---------------------------------------------------------------------------
// SPEC-INST-2: division catalog loader
// ---------------------------------------------------------------------------

/**
 * Load and validate all files in content/divisions/.
 * Result is module-cached after the first successful call.
 */
export function loadDivisionCatalog(): Division[] {
  if (_cachedCatalog !== undefined) return _cachedCatalog;
  try {
    _cachedCatalog = loadValidated<Division>(DIV_SCHEMA_PATH, DIV_DIR_PATH);
  } catch (e) {
    throw new Error("Failed to load division catalog from content/divisions/", { cause: e });
  }
  return _cachedCatalog;
}

/** Test-only: clear the module-level division catalog cache. */
export function _resetDivisionCatalogCache(): void {
  _cachedCatalog = undefined;
}

// ---------------------------------------------------------------------------
// SPEC-INST-2: staffing helpers
// ---------------------------------------------------------------------------

/**
 * Return the flag key used to record that a division is staffed.
 * e.g. staffedFlagKey("research") → "staffed.research"
 */
export function staffedFlagKey(divisionId: string): string {
  return `staffed.${divisionId}`;
}

// The lean values in draw order — determined by rng draw in thirds.
const LEANS: Lean[] = ["hawk", "dove", "centrist"];

/**
 * Generate a deterministic slate of candidates for a division hire cycle.
 *
 * Each candidate is seeded via fnv1a32(`${seed}|${divisionId}|${index}`) so the
 * same (divisionId, seed) pair always produces the same slate regardless of call
 * order (SPEC-SIM-1).
 *
 * Per candidate:
 *   - name: drawn via nameForId-equivalent seeding into generateName
 *   - competence: rng() → [0, 1)
 *   - lean: rng() binned into thirds → hawk / dove / centrist
 */
export function generateCandidates(
  divisionId: string,
  seed: number,
  pools: NamePools,
  params: InstitutionParams & { candidate_slate_size: number },
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let index = 0; index < params.candidate_slate_size; index++) {
    const subSeed = fnv1a32(`${seed}|${divisionId}|${index}`);
    const rng = mulberry32(subSeed);
    const generated: GeneratedName = generateName(rng, pools);
    const competence = rng();
    const leanRaw = rng();
    const leanIndex = Math.floor(leanRaw * LEANS.length);
    // Guard for noUncheckedIndexedAccess — leanIndex is always 0, 1, or 2.
    const lean: Lean = LEANS[leanIndex] ?? "centrist";
    candidates.push({ name: generated.full, competence, lean });
  }
  return candidates;
}

/**
 * Hire a candidate into a division.
 *
 * Records the hire in the returned state:
 *   flags[staffedFlagKey(divisionId)] = true
 *   vars["staff.<divisionId>.competence"] = candidate.competence
 *   vars.political_capital -= division.hire_cost
 *
 * Throws InsufficientCapitalError if political_capital < hire_cost.
 * Throws DivisionAlreadyStaffedError if the division is already staffed.
 *
 * Pure: never mutates the input state.
 */
export function hireStaff(state: GameState, division: Division, candidate: Candidate): GameState {
  if (state.flags[staffedFlagKey(division.id)]) {
    throw new DivisionAlreadyStaffedError(division.id);
  }
  const capital = state.vars.political_capital ?? 0;
  if (capital < division.hire_cost) {
    throw new InsufficientCapitalError(capital, division.hire_cost);
  }
  return {
    ...state,
    vars: {
      ...state.vars,
      political_capital: capital - division.hire_cost,
      [`staff.${division.id}.competence`]: candidate.competence,
    },
    flags: {
      ...state.flags,
      [staffedFlagKey(division.id)]: true,
    },
  };
}

/**
 * Sum investment * staffCompetence over all staffed divisions.
 *
 * This abstract investment score feeds SPEC-BRIEF-2 forecast quality.
 * Pure: does not mutate state.
 */
export function institutionInvestment(state: GameState, catalog: Division[]): number {
  let total = 0;
  for (const division of catalog) {
    if (state.flags[staffedFlagKey(division.id)]) {
      const competence = state.vars[`staff.${division.id}.competence`] ?? 0;
      total += division.investment * competence;
    }
  }
  return total;
}
