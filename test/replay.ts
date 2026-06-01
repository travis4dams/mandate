// SPEC-SIM-4: golden-replay test utility — lives in test/, not src/engine/.
// Pure: no Math.random(), no Date(), no mutation of input state.
import { loadScenario } from "../src/content/scenarios.js";
import { tick } from "../src/engine/clock.js";

/** Canned policy overrides keyed by YYYY-MM date string. */
export type PolicyScript = Record<string, Partial<{ policy_rate: number }>>;

/** One month's true (un-fogged) trajectory entry. */
export interface TrajectoryEntry {
  date: string;
  policy_rate: number;
  inflation: number;
  credibility: number;
  expectations_anchor: number;
}

/**
 * Run a seeded scenario through a canned policy script and return the true
 * trajectory (89 entries = 1979-08 → 1986-12 for the Volcker scenario).
 *
 * Algorithm:
 *   1. Load initial state from scenario content.
 *   2. For each month 0..months-1:
 *      a. Apply any policy overrides for state.date from policyScript.
 *      b. Record the snapshot.
 *      c. Advance state by one tick.
 *
 * The `seed` parameter is threaded through the signature for future stochastic
 * mechanics (CRED-4 will use mulberry32(seed)); for slice 1 it is accepted but
 * not consumed.
 *
 * @param scenarioId   Scenario id, e.g. "scen.1979_volcker".
 * @param policyScript Map from YYYY-MM to partial var overrides applied before recording.
 * @param seed         PRNG seed (reserved for CRED-4 spiral dynamics).
 * @param months       Number of monthly snapshots to return.
 */
export function replay(
  scenarioId: string,
  policyScript: PolicyScript,
  seed: number,  // reserved for CRED-4; slice-1 does not consume it
  months: number
): TrajectoryEntry[] {
  // Load initial state — clone vars defensively so we never mutate the loaded object.
  let state = loadScenario(scenarioId);

  const trajectory: TrajectoryEntry[] = [];

  for (let m = 0; m < months; m++) {
    // Apply policy script overrides for the current date before recording.
    const overrides = policyScript[state.date];
    if (overrides !== undefined) {
      state = {
        ...state,
        vars: { ...state.vars, ...overrides },
      };
    }

    // Record the true (un-fogged) snapshot.
    trajectory.push({
      date: state.date,
      policy_rate: state.vars.policy_rate,
      inflation: state.vars.inflation,
      credibility: state.vars.credibility,
      expectations_anchor: state.vars.expectations_anchor,
    });

    // Advance by one month (pure — returns new state, never mutates).
    state = tick(state, 1);
  }

  return trajectory;
}
