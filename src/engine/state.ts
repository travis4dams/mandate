// The single source of truth for a running game. The financial-network "map"
// and every dashboard are views derived from this — never a separate store.

/** A non-recursive snapshot of game state (flat date/vars/flags — excludes history).
 *  tick() is the only writer of state.history; tests that build a GameState
 *  directly start with history: [].
 */
export interface GameStateSnapshot {
  date: string;
  vars: Record<string, number>;
  flags: Record<string, boolean>;
}

export interface GameState {
  /** ISO year-month, e.g. "1979-08". */
  date: string;
  /** Continuous economic + institutional variables, addressed by dotted name. */
  vars: Record<string, number>;
  /** Boolean world facts, e.g. at_war, recession. */
  flags: Record<string, boolean>;
  /** Bounded ring of prior snapshots (excludes current state). history[0] is
   *  the most-recent prior snapshot. Size capped by params.tick.history_size. */
  history: GameStateSnapshot[];
}

export function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    date: partial.date ?? "1913-01",
    vars: { ...(partial.vars ?? {}) },
    flags: { ...(partial.flags ?? {}) },
    history: partial.history ? [...partial.history] : [],
  };
}
