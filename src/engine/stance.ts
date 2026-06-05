import type { Committee } from "../content/committees.js";
import type { CommitteeParams } from "./fomc.js";
import type { GameState } from "./state.js";

// SPEC-COMM-6: between-meeting stance drift.
// Between FOMC meetings each member's preferred-rate (stance) drifts toward
// their Taylor-rule prescription from incoming macro data. The stored stance is
// used by previewVote in place of the cold policy-rate anchor so meeting stances
// reflect the intermeeting period rather than recomputing cold.

/** Key under which a member's current stance is stored in state.vars. */
export function stanceKey(memberId: string): string {
  return `stance.${memberId}`;
}

/**
 * Evolve per-member stances one month toward their Taylor-rule prescription.
 *
 * Formula per member:
 *   taylor_target = neutral_rate + inflation_coef * gapInflation - output_coef * gapUnemployment
 *   new_stance = inertia * prev_stance + (1 - inertia) * taylor_target
 *
 * `prev_stance` is read from `state.vars[stanceKey(m.id)]`; on first call (key
 * absent or NaN/Infinity) it falls back to `state.vars.policy_rate`.
 * Returns state unchanged (same reference) when required vars are missing.
 *
 * Pure: no Math.random / Date.now. (SPEC-SIM-1)
 * Effects return new state; never mutates inputs.
 */
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
