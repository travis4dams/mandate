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

export function doctrineFlagKey(id: string): string {
  return `${id}.adopted`;
}

export function isDoctrineAdopted(state: GameState, id: string): boolean {
  return state.flags[doctrineFlagKey(id)] === true;
}

/** Adopt a doctrine: records it in state.flags and applies its standing effects to state.vars.
 *  No flip-flop cost is charged on adoption — only on abandonment (SPEC-DOCT-1).
 *  Standing effects are applied as exact numeric deltas; credibility is NOT clamped here so
 *  that abandonDoctrine can reverse the exact same delta and restore the original value. */
export function adoptDoctrine(state: GameState, doctrine: DoctrineEntry): GameState {
  if (isDoctrineAdopted(state, doctrine.id)) {
    throw new DoctrineAlreadyAdoptedError(doctrine.id);
  }
  const nextVars = { ...state.vars };
  for (const effect of doctrine.standing_effects) {
    if (nextVars[effect.target] === undefined) {
      throw new Error(`adoptDoctrine: var "${effect.target}" is absent in state`);
    }
    nextVars[effect.target] = nextVars[effect.target]! + effect.value;
  }
  return {
    ...state,
    vars: nextVars,
    flags: { ...state.flags, [doctrineFlagKey(doctrine.id)]: true },
  };
}

/** Abandon a doctrine: reverses its standing effects and deducts the flip-flop credibility cost.
 *  The resulting credibility is clamped to [0, 100]; other standing-effect targets are unclamped. */
export function abandonDoctrine(state: GameState, doctrine: DoctrineEntry): GameState {
  if (!isDoctrineAdopted(state, doctrine.id)) {
    throw new DoctrineNotAdoptedError(doctrine.id);
  }
  const nextVars = { ...state.vars };
  for (const effect of doctrine.standing_effects) {
    if (nextVars[effect.target] === undefined) {
      throw new Error(`abandonDoctrine: var "${effect.target}" is absent in state`);
    }
    nextVars[effect.target] = nextVars[effect.target]! - effect.value;
  }
  // Apply flip-flop credibility cost only when there is an actual cost
  if (doctrine.flip_flop_cost > 0) {
    if (nextVars.credibility === undefined) {
      throw new Error(`abandonDoctrine: "credibility" var is absent; cannot deduct flip_flop_cost`);
    }
    nextVars.credibility = clampCredibility(nextVars.credibility - doctrine.flip_flop_cost);
  }
  return {
    ...state,
    vars: nextVars,
    flags: { ...state.flags, [doctrineFlagKey(doctrine.id)]: false },
  };
}
