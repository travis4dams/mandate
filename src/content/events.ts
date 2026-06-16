import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidated } from "./loader.js";
import type { Condition } from "./conditions.js";
import type { Effect } from "./effects.js";

// Data-driven event catalog. Content lives in content/events/*.json; each file
// may be a single event object or an array of events (like oil_shock.json).
// The loader flattens arrays so callers always receive a flat GameEvent[].
//
// SPEC-EVENT-1: loadEventCatalog validates and flattens content/events/*.json.

export interface EventOption {
  id: string;
  /** Localization key for the button label. */
  name: string;
  effects: Effect[];
}

export interface MtthModifier {
  condition: Condition;
  /** Multiplier on base_days; <1 makes the event more likely. */
  factor: number;
}

export interface MeanTimeToHappen {
  base_days: number;
  modifiers?: MtthModifier[];
}

export interface GameEvent {
  id: string;
  category: "exogenous" | "endogenous" | "fiscal_political";
  /** Localization key for the headline. */
  title: string;
  /** Localization key for the body text. */
  desc?: string;
  fires_once?: boolean;
  trigger?: Condition;
  mean_time_to_happen?: MeanTimeToHappen;
  options: EventOption[];
}

const _schemaPath = join(
  fileURLToPath(import.meta.url),
  "../../../schemas/event.schema.json"
);

const _contentDir = join(
  fileURLToPath(import.meta.url),
  "../../../content/events"
);

/** Loads, validates, and flattens all events from content/events/*.json.
 *  Arrays of events in a single file are flattened into the returned list.
 *  Throws if any file fails schema validation. */
export function loadEventCatalog(): GameEvent[] {
  return loadValidated<GameEvent>(_schemaPath, _contentDir);
}
