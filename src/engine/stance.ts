import type { Committee } from "../content/committees.js";
import type { CommitteeParams } from "./fomc.js";
import type { GameState } from "./state.js";

// SPEC-COMM-6: between-meeting stance drift.

/** Key under which a member's current stance is stored in state.vars. */
export function stanceKey(memberId: string): string {
  return `stance.${memberId}`;
}

// new = inertia*prev + (1-inertia)*taylor
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
    const stored = state.vars[key];
    const prevStance =
      stored !== undefined && Number.isFinite(stored) ? stored : (policyRate as number);

    const taylorTarget =
      params.neutral_rate +
      m.inflation_coef * gapInflation -
      m.output_coef * gapUnemployment;

    newVars[key] = m.inertia * prevStance + (1 - m.inertia) * taylorTarget;
  }

  return { ...state, vars: newVars };
}
