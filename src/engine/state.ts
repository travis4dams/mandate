// The single source of truth for a running game. The financial-network "map"
// and every dashboard are views derived from this — never a separate store.

export interface GameState {
  /** ISO year-month, e.g. "1979-08". */
  date: string;
  /** Continuous economic + institutional variables, addressed by dotted name. */
  vars: Record<string, number>;
  /** Boolean world facts, e.g. at_war, recession. */
  flags: Record<string, boolean>;
}

export function makeState(partial: Partial<GameState> = {}): GameState {
  return { date: partial.date ?? "1913-01", vars: { ...(partial.vars ?? {}) }, flags: { ...(partial.flags ?? {}) } };
}
