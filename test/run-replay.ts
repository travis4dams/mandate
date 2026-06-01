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
  if (months <= 0) {
    throw new Error(`runReplay: months must be > 0 (got ${months})`);
  }
  const replay = loadReplay(replayId);
  let state: GameState;
  try {
    state = loadScenario(replay.scenario);
  } catch (e) {
    throw new Error(`runReplay("${replayId}"): scenario "${replay.scenario}" failed to load — ${(e as Error).message}`);
  }

  const trajectory: GameState[] = [];

  for (let m = 0; m < months; m++) {
    const action = replay.actions.find((a) => a.date === state.date);
    if (action !== undefined) {
      state = { ...state, vars: { ...state.vars, policy_rate: action.policy_rate } };
    }

    // Independent snapshot — history is copied so consumers can mutate freely.
    trajectory.push({ ...state, vars: { ...state.vars }, flags: { ...state.flags }, history: [...state.history] });

    state = tick(state, 1);
  }

  return trajectory;
}
