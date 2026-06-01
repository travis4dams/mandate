import type { GameState } from "../engine/state.js";

// The data-driven condition language. Events, techs, and decisions reference
// these objects in their content files; the engine evaluates them. Keeping the
// grammar tiny is deliberate: it must stay legible to designers and to agents.

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { var: string; op: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number }
  | { flag: string; value?: boolean };

// SPEC-COND-1: conditions evaluate against game state with all/any/not combinators,
// numeric variable comparisons, and boolean flag checks.
export function evaluate(cond: Condition, state: GameState): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluate(c, state));
  if ("any" in cond) return cond.any.some((c) => evaluate(c, state));
  if ("not" in cond) return !evaluate(cond.not, state);
  if ("flag" in cond) return (state.flags[cond.flag] ?? false) === (cond.value ?? true);
  const lhs = state.vars[cond.var] ?? 0;
  switch (cond.op) {
    case ">": return lhs > cond.value;
    case ">=": return lhs >= cond.value;
    case "<": return lhs < cond.value;
    case "<=": return lhs <= cond.value;
    case "==": return lhs === cond.value;
    case "!=": return lhs !== cond.value;
  }
}
