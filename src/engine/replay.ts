// SPEC-SIM-4: applies a player strategy to the engine and returns an in-memory trajectory.
import { loadReplay, ReplayNotFoundError } from "../content/replays.js";
import { loadScenario, MissingVarsError, ScenarioNotFoundError } from "../content/scenarios.js";
import { tick } from "./clock.js";
import type { GameState, GameStateSnapshot } from "./state.js";

export class UnconsumedReplayActionsError extends Error {
  constructor(
    public readonly replayId: string,
    public readonly unconsumedDates: readonly string[],
    public readonly months: number,
  ) {
    super(
      `runReplay("${replayId}", ${months}): replay contains action(s) at date(s) ` +
        `${unconsumedDates.join(", ")} that fall outside the simulated window — ` +
        `likely a typo or month-budget mismatch.`,
    );
    this.name = "UnconsumedReplayActionsError";
  }
}

export function runReplay(replayId: string, months: number): GameStateSnapshot[] {
  if (months <= 0) {
    throw new Error(`runReplay: months must be > 0 (got ${months})`);
  }

  let replay;
  try {
    replay = loadReplay(replayId);
  } catch (e) {
    if (e instanceof ReplayNotFoundError) {
      throw new Error(`runReplay("${replayId}"): ${e.message}`, { cause: e });
    }
    throw e;
  }

  let state: GameState;
  try {
    state = loadScenario(replay.scenario, ["policy_rate", "inflation", "unemployment"]);
  } catch (e) {
    if (e instanceof MissingVarsError || e instanceof ScenarioNotFoundError) {
      throw new Error(
        `runReplay("${replayId}"): scenario "${replay.scenario}" failed to load — ${e.message}`,
        { cause: e },
      );
    }
    throw e;
  }

  const trajectory: GameStateSnapshot[] = [];
  const consumed = new Set<string>();

  for (let m = 0; m < months; m++) {
    const action = replay.actions.find((a) => a.date === state.date);
    if (action !== undefined) {
      state = { ...state, vars: { ...state.vars, policy_rate: action.policy_rate } };
      consumed.add(action.date);
    }

    trajectory.push({
      date: state.date,
      vars: { ...state.vars },
      flags: { ...state.flags },
    });

    state = tick(state, 1);
  }

  const unconsumed = replay.actions
    .map((a) => a.date)
    .filter((d) => !consumed.has(d));
  if (unconsumed.length > 0) {
    throw new UnconsumedReplayActionsError(replayId, unconsumed, months);
  }

  return trajectory;
}
