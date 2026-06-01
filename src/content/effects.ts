import type { GameState } from "../engine/state.js";

export type Effect =
  | { op: "add" | "sub" | "mul" | "set"; target: string; value: number }
  | { set_flag: string; value: boolean }
  | { trigger_event: string };

export interface ApplyResult {
  state: GameState;
  /** Event ids queued by trigger_event effects, resolved by the event loop. */
  queuedEvents: string[];
}

// SPEC-COND-2: effects are pure — they return a new state rather than mutating the
// input, which keeps the simulation reproducible and easy to test.
export function applyEffects(effects: Effect[], state: GameState): ApplyResult {
  const next: GameState = { date: state.date, vars: { ...state.vars }, flags: { ...state.flags } };
  const queuedEvents: string[] = [];
  for (const e of effects) {
    if ("set_flag" in e) { next.flags[e.set_flag] = e.value; continue; }
    if ("trigger_event" in e) { queuedEvents.push(e.trigger_event); continue; }
    const cur = next.vars[e.target] ?? 0;
    switch (e.op) {
      case "add": next.vars[e.target] = cur + e.value; break;
      case "sub": next.vars[e.target] = cur - e.value; break;
      case "mul": next.vars[e.target] = cur * e.value; break;
      case "set": next.vars[e.target] = e.value; break;
    }
  }
  return { state: next, queuedEvents };
}
