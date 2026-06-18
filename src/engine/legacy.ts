// SPEC-LEGACY-1: tenure, reappointment, and legacy score — pure engine functions.
// No Math.random(), no Date.now(). All content values loaded from content/engine/legacy.json.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import { getCredibility } from "./credibility.js";
import type { GameState } from "./state.js";

export interface LegacyParams {
  term_length_months: number;
  reappointment_credibility_min: number;
  legacy_credibility_weight: number;
  legacy_mandate_bonus: number;
  legacy_anchor_penalty: number;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/legacy.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/legacy.json");

let _cachedParams: LegacyParams | undefined;

export function loadLegacyParams(): LegacyParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<LegacyParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load legacy params from content/engine/legacy.json", { cause: e });
  }
  return _cachedParams;
}

/** Test-only: clear the cached legacy params so subsequent calls re-load from disk. */
export function _resetLegacyParamsCache(): void {
  _cachedParams = undefined;
}

/**
 * SPEC-LEGACY-1: compute term progress for a given number of months elapsed.
 * A reappointment is due at each term boundary (when monthsElapsed is a positive
 * multiple of term_length_months).
 */
export function termProgress(
  monthsElapsed: number,
  params: LegacyParams,
): {
  termLength: number;
  termsServed: number;
  monthsIntoTerm: number;
  monthsToReappointment: number;
  reappointmentDue: boolean;
} {
  const { term_length_months } = params;
  const termsServed = Math.floor(monthsElapsed / term_length_months);
  const monthsIntoTerm = monthsElapsed % term_length_months;
  const reappointmentDue = monthsElapsed > 0 && monthsIntoTerm === 0;
  const monthsToReappointment = reappointmentDue ? 0 : term_length_months - monthsIntoTerm;
  return {
    termLength: term_length_months,
    termsServed,
    monthsIntoTerm,
    monthsToReappointment,
    reappointmentDue,
  };
}

/**
 * SPEC-LEGACY-1: evaluate whether the Chair is reappointed.
 * Reappointment succeeds iff credibility >= reappointment_credibility_min.
 */
export function evaluateReappointment(
  state: GameState,
  params: LegacyParams,
): { reappointed: boolean; credibility: number; threshold: number } {
  const credibility = getCredibility(state);
  const threshold = params.reappointment_credibility_min;
  return {
    reappointed: credibility >= threshold,
    credibility,
    threshold,
  };
}

/**
 * SPEC-LEGACY-1: compute the Chair's legacy score.
 * Formula: legacy_credibility_weight * credibility
 *          + legacy_mandate_bonus * months_on_target
 *          - legacy_anchor_penalty * months_below_anchor
 * months_on_target is accumulated by Session.advance() — not a final-snapshot check.
 */
export function computeLegacyScore(
  state: GameState,
  params: LegacyParams,
): number {
  const credibility = getCredibility(state);
  const monthsOnTarget = state.vars.months_on_target ?? 0;
  if (!Number.isInteger(monthsOnTarget) || monthsOnTarget < 0) {
    throw new Error(`computeLegacyScore: months_on_target is corrupted (got ${monthsOnTarget})`);
  }
  const monthsBelowAnchor = state.vars.months_below_anchor ?? 0;
  return (
    params.legacy_credibility_weight * credibility +
    params.legacy_mandate_bonus * monthsOnTarget -
    params.legacy_anchor_penalty * monthsBelowAnchor
  );
}
