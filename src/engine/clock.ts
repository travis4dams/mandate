import { readFileSync } from "node:fs";
import type { GameState, GameStateSnapshot } from "./state.js";

// SPEC-SIM-3: pure calendar tick with bounded state history.
// No Math.random(), no Date(), no wall clock — engine purity contract.

/** Default history size fallback if params are not provided. */
const DEFAULT_HISTORY_SIZE = 24;

/** Load history_size from content/engine/params.json at module-load time. */
function loadDefaultHistorySize(): number {
  try {
    const raw = JSON.parse(readFileSync("content/engine/params.json", "utf8"));
    return (raw?.tick?.history_size as number | undefined) ?? DEFAULT_HISTORY_SIZE;
  } catch {
    return DEFAULT_HISTORY_SIZE;
  }
}

const contentHistorySize: number = loadDefaultHistorySize();

/**
 * Pure calendar tick: advances `state.date` (YYYY-MM) by N months and
 * maintains a bounded `state.history` of prior snapshots.
 *
 * Conventions (locked — see AC-2):
 *  - history[0] is the most-recent prior snapshot.
 *  - The current state is NOT in history.
 *  - For months <= 0, returns a clone with no history mutation.
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
  let history: GameStateSnapshot[] = state.history.map((s) => ({
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
    history = [snapshot, ...history];
    // Truncate from the back to honour history_size.
    if (history.length > historySize) {
      history = history.slice(0, historySize);
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
