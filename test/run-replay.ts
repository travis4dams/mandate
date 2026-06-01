// SPEC-SIM-4: pure test-side runner; applies a player strategy to the engine
// and returns an in-memory trajectory (no engine-computed values committed).
import { loadReplay } from "../src/content/replays.js";
import { loadScenario } from "../src/content/scenarios.js";
import { tick } from "../src/engine/clock.js";
import type { GameState, GameStateSnapshot } from "../src/engine/state.js";

export function runReplay(replayId: string, months: number): GameStateSnapshot[] {
  if (months <= 0) {
    throw new Error(`runReplay: months must be > 0 (got ${months})`);
  }
  const replay = loadReplay(replayId);
  let state: GameState;
  try {
    state = loadScenario(replay.scenario, ["policy_rate"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `runReplay("${replayId}"): scenario "${replay.scenario}" failed to load — ${msg}`,
      { cause: e },
    );
  }

  const trajectory: GameStateSnapshot[] = [];

  for (let m = 0; m < months; m++) {
    const action = replay.actions.find((a) => a.date === state.date);
    if (action !== undefined) {
      state = { ...state, vars: { ...state.vars, policy_rate: action.policy_rate } };
    }

    trajectory.push({
      date: state.date,
      vars: { ...state.vars },
      flags: { ...state.flags },
    });

    state = tick(state, 1);
  }

  return trajectory;
}
