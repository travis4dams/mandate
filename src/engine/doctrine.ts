import type { GameState } from "./state.js";
import { clampCredibility } from "./credibility.js";
import type { DoctrineEntry } from "../content/doctrines.js";

export class DoctrineAlreadyAdoptedError extends Error {
  constructor(public readonly id: string) {
    super(`Doctrine "${id}" is already adopted`);
    this.name = "DoctrineAlreadyAdoptedError";
  }
}

export class DoctrineNotAdoptedError extends Error {
  constructor(public readonly id: string) {
    super(`Doctrine "${id}" is not currently adopted`);
    this.name = "DoctrineNotAdoptedError";
  }
}

/** Returns the flag key for a doctrine's adopted state.
 *  Doctrine IDs follow the schema pattern `^doctrine\.[a-z0-9_]+$`,
 *  so this produces e.g. `"doctrine.dot_plot.adopted"`. */
export function doctrineFlagKey(id: string): string {
  return `${id}.adopted`;
}

export function isDoctrineAdopted(state: GameState, id: string): boolean {
  return state.flags[doctrineFlagKey(id)] === true;
}

/** Adopt a doctrine: records it in state.flags and applies its standing effects to state.vars.
 *  No flip-flop cost is charged on adoption — only on abandonment (SPEC-DOCT-1). */
export function adoptDoctrine(state: GameState, doctrine: DoctrineEntry): GameState {
  if (isDoctrineAdopted(state, doctrine.id)) {
    throw new DoctrineAlreadyAdoptedError(doctrine.id);
  }
  const nextVars = { ...state.vars };
  for (const effect of doctrine.standing_effects) {
    if (!(effect.target in nextVars)) {
      throw new Error(
        `adoptDoctrine "${doctrine.id}": standing effect target "${effect.target}" ` +
        `is absent from state.vars. All targeted vars must be initialised by the scenario.`,
      );
    }
    nextVars[effect.target] = (nextVars[effect.target] as number) + effect.value;
  }
  return {
    ...state,
    vars: nextVars,
    flags: { ...state.flags, [doctrineFlagKey(doctrine.id)]: true },
  };
}

/** Abandon a doctrine: reverses its standing effects and deducts the flip-flop credibility cost
 *  (clamped to [0,100]). */
export function abandonDoctrine(state: GameState, doctrine: DoctrineEntry): GameState {
  if (!isDoctrineAdopted(state, doctrine.id)) {
    throw new DoctrineNotAdoptedError(doctrine.id);
  }
  const nextVars = { ...state.vars };
  // Reverse standing effects
  for (const effect of doctrine.standing_effects) {
    if (!(effect.target in nextVars)) {
      throw new Error(
        `abandonDoctrine "${doctrine.id}": standing effect target "${effect.target}" ` +
        `is absent from state.vars. All targeted vars must be initialised by the scenario.`,
      );
    }
    nextVars[effect.target] = (nextVars[effect.target] as number) - effect.value;
  }
  // Apply flip-flop credibility cost
  if (nextVars.credibility === undefined) {
    throw new Error(
      "abandonDoctrine: state.vars.credibility is missing. " +
      "All scenarios must initialise 'credibility' (it is in REQUIRED_VARS).",
    );
  }
  nextVars.credibility = clampCredibility(nextVars.credibility - doctrine.flip_flop_cost);
  return {
    ...state,
    vars: nextVars,
    flags: { ...state.flags, [doctrineFlagKey(doctrine.id)]: false },
  };
}
