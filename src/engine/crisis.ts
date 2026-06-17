// SPEC-CRISIS-1: endogenous banking crisis channel.
//
// crisisProbability() maps bank fragility to a monthly crisis probability using a
// linear ramp above a threshold, clamped to [0, 1].
//
// applyFinancialCrisis() is a pure function that injects a credit/demand shock when
// a Bernoulli draw fires: unemployment rises (scaled by severityReduction + seeded
// jitter), inflation falls, credibility falls, output_gap falls, and bank_fragility
// resets to post_crisis_fragility (the cleansing effect). All mutated vars are clamped
// to their valid ranges. Never calls Math.random() — randomness flows through the
// caller's seeded rng (SPEC-SIM-1).

import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";
import type { SeededRng } from "./rng.js";

export interface CrisisParams {
  /** Base probability at the threshold (flat portion below ramp). */
  crisis_base: number;
  /** Probability slope per unit of fragility above the threshold. */
  crisis_slope: number;
  /** Fragility level where the ramp begins. */
  crisis_threshold: number;
  /** Baseline unemployment increase on a crisis hit (before severityReduction). */
  severity: number;
  /** Absolute inflation decrease on a crisis hit. */
  inflation_drop: number;
  /** Credibility points lost on a crisis hit. */
  credibility_drop: number;
  /** Absolute output_gap decrease on a crisis hit. */
  output_gap_drop: number;
  /** bank_fragility is reset to this value after a crisis. */
  post_crisis_fragility: number;
  /** Std deviation of seeded jitter added to the unemployment impact. */
  severity_jitter: number;
  /** Months of post-crisis cooldown (wired by Session, stored as crisis_cooldown var). */
  cooldown_months: number;
  /** Default bank_fragility when absent from state (SPEC-PROD-1 pattern). */
  initial_bank_fragility: number;
  /** Default output_gap when absent from state (SPEC-PROD-1 pattern). */
  initial_output_gap: number;
}

/**
 * SPEC-CRISIS-1: Compute the monthly probability of a financial crisis.
 *
 * Formula: clamp(crisis_base + crisis_slope * max(0, fragility − crisis_threshold), 0, 1).
 * Returns 0 when fragility is at or below the threshold.
 *
 * @param fragility  Current bank_fragility ∈ [0, 1].
 * @param params     Crisis parameters from content/engine/crisis.json.
 */
export function crisisProbability(fragility: number, params: CrisisParams): number {
  const excess = Math.max(0, fragility - params.crisis_threshold);
  return Math.min(1, Math.max(0, params.crisis_base + params.crisis_slope * excess));
}

// Box-Muller: one standard-normal sample from two uniform [0,1) draws.
// Guards against log(0) by looping on exact zero — mulberry32 never emits exactly 0
// in practice, but the guard ensures -Infinity cannot propagate as NaN.
function sampleNormal(rng: () => number): number {
  let u1 = 0;
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * SPEC-CRISIS-1: Apply a financial crisis shock to the game state.
 *
 * Pure: does not mutate the input state. Returns a new GameState with:
 *   - unemployment += severity * (1 − severityReduction) + jitter (clamped ≥ 0)
 *   - inflation   -= inflation_drop (clamped ≥ 0)
 *   - credibility -= credibility_drop (clamped to [0, 100])
 *   - output_gap  -= output_gap_drop
 *   - bank_fragility = post_crisis_fragility (cleansing)
 *
 * The stochastic jitter on unemployment is drawn from the caller's seeded rng so
 * two runs with the same seed are bit-identical (SPEC-SIM-1).
 *
 * Vars that are absent from state.vars fall back to initial_* defaults from params
 * (SPEC-PROD-1 pattern), ensuring existing scenarios are unaffected.
 *
 * @param state             Current game state (not mutated).
 * @param severityReduction Fraction of unemployment impact absorbed by supervision (∈ [0, 1]).
 * @param params            Crisis params from content/engine/crisis.json.
 * @param rng               Seeded RNG — never Math.random() (SPEC-SIM-1).
 */
export function applyFinancialCrisis(
  state: GameState,
  severityReduction: number,
  params: CrisisParams,
  rng: SeededRng,
): GameState {
  // Read current vars, defaulting absent keys per SPEC-PROD-1 pattern.
  const currentUnemployment = state.vars["unemployment"] ?? 0;
  const currentInflation = state.vars["inflation"] ?? 0;
  const currentCredibility = state.vars["credibility"] ?? 50;
  const currentOutputGap = state.vars["output_gap"] ?? params.initial_output_gap;

  // Seeded jitter on the unemployment impact (Box-Muller, std = severity_jitter).
  // Scale jitter by (1 − severityReduction) so full mitigation zeroes both base
  // and variance contributions.
  const mitigation = Math.max(0, Math.min(1, severityReduction));
  const jitter =
    params.severity_jitter > 0
      ? sampleNormal(rng) * params.severity_jitter * (1 - mitigation)
      : 0;

  // Unemployment: base hit reduced by mitigation, plus seeded jitter; clamped ≥ 0.
  const unemploymentDelta = params.severity * (1 - mitigation) + jitter;
  const newUnemployment = Math.max(0, currentUnemployment + unemploymentDelta);

  // Inflation: drops by a fixed amount; clamped ≥ 0.
  const newInflation = Math.max(0, currentInflation - params.inflation_drop);

  // Credibility: drops by a fixed amount; clamped to [0, 100].
  const newCredibility = Math.min(100, Math.max(0, currentCredibility - params.credibility_drop));

  // Output gap: drops by a fixed amount (no floor — it can go negative).
  const newOutputGap = currentOutputGap - params.output_gap_drop;

  // bank_fragility resets to post_crisis_fragility (the "cleansing" effect).
  const newFragility = params.post_crisis_fragility;

  return {
    ...state,
    vars: {
      ...state.vars,
      unemployment: newUnemployment,
      inflation: newInflation,
      credibility: newCredibility,
      output_gap: newOutputGap,
      bank_fragility: newFragility,
    },
  };
}

// --- Content loader ---

const CRISIS_SCHEMA = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/crisis.schema.json",
);
const CRISIS_FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/crisis.json",
);

let _cachedCrisisParams: CrisisParams | undefined;

/** Load and cache the crisis params from content/engine/crisis.json. */
export function loadCrisisParams(): CrisisParams {
  if (_cachedCrisisParams !== undefined) return _cachedCrisisParams;
  try {
    _cachedCrisisParams = loadValidatedFile<CrisisParams>(CRISIS_SCHEMA, CRISIS_FILE);
  } catch (e) {
    throw new Error(
      "Failed to load crisis params from content/engine/crisis.json",
      { cause: e },
    );
  }
  return _cachedCrisisParams;
}

/** Test-only: clear the cache so the next loadCrisisParams() re-reads from disk. */
export function _resetCrisisParamsCache(): void {
  _cachedCrisisParams = undefined;
}
