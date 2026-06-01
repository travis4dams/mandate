import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState, GameStateSnapshot } from "./state.js";

// SPEC-SIM-3: pure calendar tick with bounded state history.
// No Math.random(), no Date(), no wall clock — engine purity contract.

/** Structural minimum: history_size must be at least this. */
const MIN_HISTORY_SIZE = 1;

interface TickParams {
  history_size: number;
}

// cwd-safe path resolution — mirrors src/content/scenarios.ts pattern.
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/tick.schema.json"
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/tick.json"
);

function loadHistorySize(): number {
  const loaded = loadValidatedFile<TickParams>(SCHEMA_PATH, FILE_PATH);
  const size = loaded.history_size;
  if (!Number.isInteger(size) || size < MIN_HISTORY_SIZE) {
    throw new Error(`tick.history_size must be an integer >= ${MIN_HISTORY_SIZE}, got: ${size}`);
  }
  return size;
}

const contentHistorySize: number = loadHistorySize();

/**
 * Pure calendar tick: advances `state.date` (YYYY-MM) by N months and
 * maintains a bounded `state.history` of prior snapshots.
 *
 * history[0] is the most-recent prior snapshot; current state is NOT in history.
 * For months <= 0, returns a clone with no history mutation.
 *
 * @param state   Input game state (never mutated).
 * @param months  Number of months to advance. Non-positive → pure clone.
 * @param params  Optional override for history_size (useful in tests).
 */
export function tick(
  state: GameState,
  months: number,
  params?: { history_size: number }
): GameState {
  const historySize = params?.history_size ?? contentHistorySize;

  if (months <= 0) {
    // Pure clone — no history mutation.
    return {
      date: state.date,
      vars: { ...state.vars },
      flags: { ...state.flags },
      history: state.history.map((s) => ({ ...s, vars: { ...s.vars }, flags: { ...s.flags } })),
    };
  }

  // Advance month by month, accumulating history.
  let currentDate = state.date;
  let currentVars = { ...state.vars };
  let currentFlags = { ...state.flags };
  // Start from a copy of the existing history (most-recent-first convention kept).
  const history: GameStateSnapshot[] = state.history.map((s) => ({
    ...s,
    vars: { ...s.vars },
    flags: { ...s.flags },
  }));

  for (let i = 0; i < months; i++) {
    // Push the snapshot of the state *before* this step to the front of history.
    const snapshot: GameStateSnapshot = {
      date: currentDate,
      vars: { ...currentVars },
      flags: { ...currentFlags },
    };
    // Prepend — history[0] must be the most-recent prior snapshot.
    history.unshift(snapshot);
    // Truncate from the back to honour history_size.
    if (history.length > historySize) {
      history.pop();
    }
    // Advance the date by one month (hand-rolled — no Date() constructor).
    currentDate = advanceOneMonth(currentDate);
  }

  return {
    date: currentDate,
    vars: currentVars,
    flags: currentFlags,
    history,
  };
}

/** Advance a YYYY-MM string by exactly one month. No Date() used. */
function advanceOneMonth(yyyyMM: string): string {
  const year = parseInt(yyyyMM.slice(0, 4), 10);
  const month = parseInt(yyyyMM.slice(5, 7), 10);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}
