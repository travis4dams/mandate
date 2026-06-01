// SPEC-SIM-4: replay runner — test utility only. Lives in test/, not src/engine/.
// Pure: no Math.random(), no Date(), no mutation of input state.
// The trajectory is in-memory only. It is NOT committed to disk.
import { loadReplay } from "../src/content/replays.js";
import { loadScenario } from "../src/content/scenarios.js";
import { tick } from "../src/engine/clock.js";
import type { GameState } from "../src/engine/state.js";

/**
 * Run a replay strategy headlessly and return the in-memory trajectory.
 *
 * Algorithm:
 *   1. loadReplay(replayId) to get the action list + scenario id.
 *   2. loadScenario(replay.scenario) to get the initial GameState.
 *   3. Iterate `months` times:
 *      a. If any action in replay.actions has date === state.date, apply its
 *         policy_rate to state.vars.policy_rate.
 *      b. Record the current state into the trajectory array.
 *      c. Advance via tick(state, 1).
 *   4. Return the trajectory (array of GameState snapshots).
 *
 * @param replayId - Replay id, e.g. "replay.1979_volcker_chair_strategy".
 * @param months   - Number of monthly snapshots to return.
 */
export function runReplay(replayId: string, months: number): GameState[] {
  const replay = loadReplay(replayId);
  let state = loadScenario(replay.scenario);

  const trajectory: GameState[] = [];

  for (let m = 0; m < months; m++) {
    // Apply any player action for the current date.
    const action = replay.actions.find((a) => a.date === state.date);
    if (action !== undefined) {
      const vars: Record<string, number> = { ...state.vars };
      if (action.policy_rate !== undefined) {
        vars.policy_rate = action.policy_rate;
      }
      state = { ...state, vars };
    }

    // Record the state (shallow copy so each entry is independent).
    trajectory.push({ ...state, vars: { ...state.vars }, flags: { ...state.flags }, history: state.history });

    // Advance by one month (pure — returns new state, never mutates).
    state = tick(state, 1);
  }

  return trajectory;
}
