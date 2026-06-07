import type { Committee } from "../content/committees.js";
import type { CommitteeParams } from "./committee-types.js";
import type { GameState } from "./state.js";

// SPEC-COMM-6: between-meeting stance drift.

/** Key under which a member's current stance is stored in state.vars. */
export function stanceKey(memberId: string): string {
  return `stance.${memberId}`;
}

/** Returns the stored stance for a member if finite, otherwise falls back to policy_rate. */
export function resolveStoredStance(stored: unknown, policyRate: number): number {
  return stored !== undefined && Number.isFinite(stored as number)
    ? (stored as number)
    : policyRate;
}

export function applyIntermeetingDrift(
  state: GameState,
  committee: Committee,
  params: CommitteeParams,
): GameState {
  const inflation = state.vars.inflation;
  const unemployment = state.vars.unemployment;
  const policyRate = state.vars.policy_rate;
  if (
    !Number.isFinite(inflation) ||
    !Number.isFinite(unemployment) ||
    !Number.isFinite(policyRate)
  ) {
    return state;
  }

  const gapInflation = (inflation as number) - params.target_inflation;
  const gapUnemployment = (unemployment as number) - params.target_unemployment;

  const newVars = { ...state.vars };
  for (const m of committee.members) {
    const key = stanceKey(m.id);
    const prevStance = resolveStoredStance(state.vars[key], policyRate as number);

    const taylorTarget =
      params.neutral_rate +
      m.inflation_coef * gapInflation -
      m.output_coef * gapUnemployment;

    newVars[key] = m.inertia * prevStance + (1 - m.inertia) * taylorTarget;
  }

  return { ...state, vars: newVars };
}
