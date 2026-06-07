import type { Committee } from "../content/committees.js";
import type { CommitteeParams } from "./committee-types.js";
import type { GameState } from "./state.js";

// SPEC-COMM-6: between-meeting stance drift — each member drifts toward their Taylor-rule prescription monthly.

/** Key under which a member's current stance is stored in state.vars. */
export function stanceKey(memberId: string): string {
  return `stance.${memberId}`;
}

/** Returns stored if it is a finite number; falls back to policyRate otherwise.
 *  Covers: absent key (undefined), NaN/Infinity/-Infinity, or any non-numeric value. */
export function resolveStoredStance(stored: number | undefined, policyRate: number): number {
  return Number.isFinite(stored) ? (stored as number) : policyRate;
}

/** Evolve per-member stances one month: new = inertia * prev + (1 - inertia) * taylor_target.
 *  Falls back to policy_rate on first call or corrupt (NaN/Infinity) stored stance.
 *  Returns state unchanged (same reference) when required macro vars are missing. (SPEC-SIM-1) */
export function applyIntermeetingDrift(
  state: GameState,
  committee: Committee,
  params: CommitteeParams,
): GameState {
  const inflationRaw = state.vars.inflation;
  const unemploymentRaw = state.vars.unemployment;
  const policyRateRaw = state.vars.policy_rate;
  if (
    !Number.isFinite(inflationRaw) ||
    !Number.isFinite(unemploymentRaw) ||
    !Number.isFinite(policyRateRaw)
  ) {
    return state;
  }
  // Safe casts: guarded by Number.isFinite above (undefined and NaN both fail isFinite).
  const inflation = inflationRaw as number;
  const unemployment = unemploymentRaw as number;
  const policyRate = policyRateRaw as number;

  const gapInflation = inflation - params.target_inflation;
  const gapUnemployment = unemployment - params.target_unemployment;

  const newVars = { ...state.vars };
  for (const m of committee.members) {
    if (!Number.isFinite(m.inertia) || !Number.isFinite(m.inflation_coef) || !Number.isFinite(m.output_coef)) {
      throw new Error(
        `applyIntermeetingDrift: member "${m.id}" has non-finite coefficient(s) ` +
        `(inertia=${m.inertia}, inflation_coef=${m.inflation_coef}, output_coef=${m.output_coef}).`,
      );
    }
    const key = stanceKey(m.id);
    const prevStance = resolveStoredStance(state.vars[key], policyRate);

    const taylorTarget =
      params.neutral_rate +
      m.inflation_coef * gapInflation -
      m.output_coef * gapUnemployment;

    newVars[key] = m.inertia * prevStance + (1 - m.inertia) * taylorTarget;
  }

  return { ...state, vars: newVars };
}
