import type { GameState } from "./state.js";
import { evaluate } from "../content/conditions.js";
import type { GameEvent } from "../content/events.js";

// Pure event eligibility + probability functions. No randomness here — callers
// supply the seeded RNG draw. No content references — catalog injected by
// caller (SPEC-SIM-1 / engine purity).
//
// SPEC-EVENT-1: eligibleEvents + eventFireProbability

/** Returns the subset of catalog events that are currently eligible:
 *  - their `trigger` condition evaluates to true (or they have no trigger), AND
 *  - they are not in `firedOnce` when `fires_once` is true. */
export function eligibleEvents(
  state: GameState,
  catalog: GameEvent[],
  firedOnce: ReadonlySet<string>
): GameEvent[] {
  return catalog.filter((evt) => {
    if (evt.fires_once && firedOnce.has(evt.id)) return false;
    if (evt.trigger === undefined) return true;
    return evaluate(evt.trigger, state);
  });
}

/** Converts a Paradox-style mean_time_to_happen into a per-tick fire
 *  probability using the formula:  p = 1 − 0.5^(daysPerMonth / effectiveDays)
 *
 *  effectiveDays = base_days × Π(factor) for each modifier whose condition holds.
 *
 *  Events with no MTTH are always-eligible: probability = 1.
 *
 *  @param daysPerMonth  Number of simulated days per tick (default 30). */
export function eventFireProbability(
  event: GameEvent,
  state: GameState,
  daysPerMonth = 30
): number {
  if (event.mean_time_to_happen === undefined) return 1;

  const { base_days, modifiers } = event.mean_time_to_happen;
  let effectiveDays = base_days;

  if (modifiers !== undefined) {
    for (const mod of modifiers) {
      if (evaluate(mod.condition, state)) {
        effectiveDays *= mod.factor;
      }
    }
  }

  // 1 - 0.5^(daysPerMonth / effectiveDays)
  return 1 - Math.pow(0.5, daysPerMonth / effectiveDays);
}
