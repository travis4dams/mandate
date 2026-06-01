import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Replay content type — mirrors schemas/replay.schema.json.
// A Replay is a committed player-strategy artifact: a structured record of
// what the player did (policy pivots). Engine-computed values must NOT appear
// in the committed file; they are produced at test time by running the engine.

export interface ReplayAction {
  date: string;
  policy_rate: number;
}

export interface Replay {
  id: string;
  name: string;
  desc: string;
  scenario: string;
  actions: ReplayAction[];
}

// Thrown when no replay with the requested id is found.
export class ReplayNotFoundError extends Error {
  constructor(id: string) {
    super(`Replay "${id}" not found in content/replays/`);
    this.name = "ReplayNotFoundError";
  }
}

// Thrown when a replay's actions are not strictly increasing by date.
// Loading guards this so Array.find() can never silently match the wrong action.
export class ReplayActionOrderError extends Error {
  constructor(replayId: string, badDate: string, prevDate: string) {
    super(`Replay "${replayId}": action date ${badDate} is not strictly after ${prevDate}.`);
    this.name = "ReplayActionOrderError";
  }
}

const REPLAYS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/replays"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/replay.schema.json"
);

/**
 * Load a replay strategy by id.
 *
 * @param id - The replay id, e.g. "replay.1979_volcker_chair_strategy".
 * @throws ReplayNotFoundError if the id is not present in content/replays/.
 */
export function loadReplay(id: string): Replay {
  const replays = loadValidated<Replay>(SCHEMA_PATH, REPLAYS_DIR);
  const replay = replays.find((r) => r.id === id);
  if (!replay) {
    throw new ReplayNotFoundError(id);
  }
  for (let i = 1; i < replay.actions.length; i++) {
    if (replay.actions[i].date <= replay.actions[i - 1].date) {
      throw new ReplayActionOrderError(id, replay.actions[i].date, replay.actions[i - 1].date);
    }
  }
  return replay;
}
