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
// The structural invariant lets callers iterate actions predictably (e.g.,
// a streaming runner could advance a single cursor instead of scanning).
export class ReplayActionOrderError extends Error {
  constructor(
    public readonly replayId: string,
    public readonly badDate: string,
    public readonly prevDate: string,
  ) {
    super(`Replay "${replayId}": action date ${badDate} is not strictly after ${prevDate}.`);
    this.name = "ReplayActionOrderError";
  }
}

const DEFAULT_REPLAYS_DIR = join(
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
 * @param id  - The replay id, e.g. "replay.1979_chair_tightening".
 * @param dir - Optional override of the content directory (used by tests to
 *              load a synthetic fixture without touching `content/replays/`).
 * @throws ReplayNotFoundError    when no replay with the id is present in `dir`.
 * @throws ReplayActionOrderError when action dates are not strictly increasing.
 */
export function loadReplay(id: string, dir: string = DEFAULT_REPLAYS_DIR): Replay {
  const replays = loadValidated<Replay>(SCHEMA_PATH, dir);
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
