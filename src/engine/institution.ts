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
  /** SPEC-INST-5: months between automatic talent-market refreshes of candidate slates. */
  candidate_refresh_months: number;
}

/** SPEC-STAFF-1: the five skill dimensions every director candidate carries. */
export interface DirectorSkills {
  forecasting: number;
  markets: number;
  supervision: number;
  communication: number;
  crisis: number;
}

/** SPEC-DIV-2: the economic channel a division's effectiveness feeds. */
export type DivisionChannel =
  | "fog"
  | "transmission"
  | "fragility_visibility"
  | "fragility_mitigation"
  | "crisis_severity"
  | "external_shock"
  | "org"
  | "political"
  | "oversight";

/** SPEC-INST-2 + SPEC-STAFF-1 + SPEC-DIV-2: a single division from content/divisions/. */
export interface Division {
  id: string;
  name: string;
  desc: string;
  hire_cost: number;
  investment: number;
  /** SPEC-STAFF-1: importance weights for each skill dimension (all five required). */
  skill_weights: DirectorSkills;
  /** SPEC-DIV-2: which economic channel this division's effectiveness feeds. */
  channel: DivisionChannel;
  /** SPEC-DIV-2: optional tech id that must be researched before hire is available. */
  unlocked_by?: string;
}

/** SPEC-INST-2: policy orientation of a division head candidate. */
export type Lean = "hawk" | "dove" | "centrist";

/** SPEC-INST-2 + SPEC-STAFF-1 + SPEC-STAFF-2: a candidate for a division head position. */
export interface Candidate {
  name: string;
  competence: number;
  lean: Lean;
  /** SPEC-STAFF-1: per-dimension skill scores in [0,1]. */
  skills: DirectorSkills;
  /**
   * SPEC-STAFF-2: a HIDDEN hawkish(+)/dovish(−) disposition in [-1,1], distinct
   * from and uncorrelated with the visible `lean`. It slightly colors the
   * division's work and is NOT surfaced on the candidate card — the player infers
   * it over time from how the division behaves. Optional on the type (defaults to
   * a neutral 0 on hire) but always populated by generateCandidates.
   */
  disposition?: number;
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

/** SPEC-STAFF-3: Thrown by hireStaff when operating_budget < division.hire_cost. */
export class InsufficientBudgetError extends Error {
  constructor(have: number, need: number) {
    super(`InsufficientBudgetError: need ${need} operating budget, have ${have}`);
    this.name = "InsufficientBudgetError";
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

// ---------------------------------------------------------------------------
// SPEC-STAFF-1: director effectiveness
// ---------------------------------------------------------------------------

/** The ordered skill keys — used to iterate DirectorSkills without index tricks. */
const SKILL_KEYS: ReadonlyArray<keyof DirectorSkills> = [
  "forecasting",
  "markets",
  "supervision",
  "communication",
  "crisis",
];

/**
 * Compute a director's weighted effectiveness against a division's skill demands.
 *
 * Returns Σ(weights[s] * skills[s]) / Σ(weights[s]) ∈ [0, 1].
 * If all weights are zero the result is 0 (safe default).
 * Pure; no randomness (SPEC-SIM-1).
 */
export function directorEffectiveness(skills: DirectorSkills, weights: DirectorSkills): number {
  let numerator = 0;
  let denominator = 0;
  for (const key of SKILL_KEYS) {
    const w = weights[key];
    numerator += w * skills[key];
    denominator += w;
  }
  return denominator === 0 ? 0 : numerator / denominator;
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
 *   - name: drawn via generateName from the candidate's seeded stream
 *   - competence: rng() → [0, 1)
 *   - lean: rng() binned into thirds → hawk / dove / centrist
 *   - skills: five rng() draws → each skill ∈ [0, 1) (SPEC-STAFF-1)
 */
export function generateCandidates(
  divisionId: string,
  seed: number,
  pools: NamePools,
  params: InstitutionParams & { candidate_slate_size: number },
  refreshIndex = 0,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let index = 0; index < params.candidate_slate_size; index++) {
    // SPEC-INST-5: refreshIndex folds into the seed so the talent market turns over
    // (a fresh slate after a dismissal and as time passes) — deterministic per index.
    const subSeed = fnv1a32(`${seed}|${divisionId}|${refreshIndex}|${index}`);
    const rng = mulberry32(subSeed);
    const generated: GeneratedName = generateName(rng, pools);
    const competence = rng();
    const leanRaw = rng();
    const leanIndex = Math.floor(leanRaw * LEANS.length);
    // Guard for noUncheckedIndexedAccess — leanIndex is always 0, 1, or 2.
    const lean: Lean = LEANS[leanIndex] ?? "centrist";
    // SPEC-STAFF-1: draw each skill from the same per-candidate seeded stream.
    const skills: DirectorSkills = {
      forecasting:   rng(),
      markets:       rng(),
      supervision:   rng(),
      communication: rng(),
      crisis:        rng(),
    };
    // SPEC-STAFF-2: hidden disposition ∈ [-1,1), drawn from the same seeded stream
    // (a separate draw from `lean`, so the two are independent).
    const disposition = rng() * 2 - 1;
    candidates.push({ name: generated.full, competence, lean, skills, disposition });
  }
  return candidates;
}

/**
 * Hire a candidate into a division.
 *
 * Records the hire in the returned state:
 *   flags[staffedFlagKey(divisionId)] = true
 *   vars["staff.<divisionId>.competence"] = candidate.competence
 *   vars["staff.<divisionId>.eff"]        = directorEffectiveness(candidate.skills, division.skill_weights)  (SPEC-STAFF-1)
 *   vars["staff.<divisionId>.lean"]       = hawk→+1, dove→-1, centrist→0                                     (SPEC-STAFF-1)
 *   vars.operating_budget -= division.hire_cost                                                               (SPEC-STAFF-3)
 *
 * Throws InsufficientBudgetError if operating_budget < hire_cost.
 * Throws DivisionAlreadyStaffedError if the division is already staffed.
 *
 * Pure: never mutates the input state.
 */
export function hireStaff(
  state: GameState,
  division: Division,
  candidate: Candidate,
  params?: Pick<InstitutionParams, "initial_operating_budget">,
): GameState {
  if (state.flags[staffedFlagKey(division.id)]) {
    throw new DivisionAlreadyStaffedError(division.id);
  }
  // SPEC-STAFF-3: hire is funded by operating_budget, not political_capital.
  // Absent operating_budget defaults to params.initial_operating_budget when provided,
  // or 0 for bare-state unit tests that don't pass params.
  const budget = state.vars.operating_budget ?? params?.initial_operating_budget ?? 0;
  if (budget < division.hire_cost) {
    throw new InsufficientBudgetError(budget, division.hire_cost);
  }
  // SPEC-STAFF-1: numeric lean stored as +1 / 0 / -1 so other modules can read it
  // without importing institution.ts (state-convention contract).
  const leanValue = candidate.lean === "hawk" ? 1 : candidate.lean === "dove" ? -1 : 0;
  const eff = directorEffectiveness(candidate.skills, division.skill_weights);
  return {
    ...state,
    vars: {
      ...state.vars,
      operating_budget: budget - division.hire_cost,
      [`staff.${division.id}.competence`]: candidate.competence,
      [`staff.${division.id}.eff`]:        eff,
      [`staff.${division.id}.lean`]:       leanValue,
      // SPEC-STAFF-2: persist the hidden disposition so divisionEffects + culture can read it.
      [`staff.${division.id}.disposition`]: candidate.disposition ?? 0,
    },
    flags: {
      ...state.flags,
      [staffedFlagKey(division.id)]: true,
    },
  };
}

/**
 * SPEC-STAFF-3: Fire a division director.
 *
 * Clears the staffed flag and removes all staff.<id>.* vars from the returned state,
 * allowing the Chair to hire a replacement on the next turn.
 *
 * Pure: never mutates the input state.
 */
export function fireStaff(state: GameState, division: Division): GameState {
  const flagKey = staffedFlagKey(division.id);
  const prefix = `staff.${division.id}.`;
  // Filter out all staff.<id>.* vars for the fired division.
  const nextVars: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.vars)) {
    if (!k.startsWith(prefix)) {
      nextVars[k] = v;
    }
  }
  return {
    ...state,
    vars: nextVars,
    flags: {
      ...state.flags,
      [flagKey]: false,
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
