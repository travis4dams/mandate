import { join } from "node:path";
import { loadValidated } from "./loader.js";
import { applyDotPlotMeetingEffects, loadDotPlotParams } from "../engine/dot-plot.js";
import type { GameState } from "../engine/state.js";
import type { MemberVotePreview } from "../engine/fomc.js";

/** The exhaustive set of game var names that standing effects may target.
 *  Mirrors the enum in schemas/doctrine.schema.json. */
export type GameVarName =
  | "credibility"
  | "expectations_anchor"
  | "inflation"
  | "unemployment"
  | "policy_rate"
  | "months_below_anchor";

export interface StandingEffect {
  target: GameVarName;
  value: number;
}

export type DoctrineHook = "dot_plot_meeting";

/** Function signature for meeting-hook handlers.
 *  Receives the post-vote state, member previews, and adopted flag.
 *  Returns updated state (pure — no mutations). */
export type MeetingHookFn = (
  state: GameState,
  previews: readonly MemberVotePreview[],
  adopted: boolean,
) => GameState;

/**
 * Registry of meeting-hook handlers, keyed by DoctrineHook name.
 * Lives outside src/engine/ so no content ID is ever hardcoded in engine code.
 * To add a new meeting hook: (1) add the string to DoctrineHook + schema enum,
 * (2) implement a handler, (3) register it here — no changes to src/engine/session.ts needed.
 */
export const HOOK_HANDLERS: Record<DoctrineHook, MeetingHookFn> = {
  dot_plot_meeting: (state, previews, adopted) =>
    applyDotPlotMeetingEffects(state, previews, loadDotPlotParams(), adopted),
};

export interface DoctrineEntry {
  id: string;
  name: string;
  description: string;
  standing_effects: StandingEffect[];
  /** Optional hook name. When set, proposeRate invokes the matching meeting-effect handler generically. */
  meeting_hook?: DoctrineHook;
  flip_flop_cost: number;
}

export class DoctrineNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Doctrine "${id}" not found in content/doctrines/`);
    this.name = "DoctrineNotFoundError";
  }
}

const DOCTRINES_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/doctrines"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/doctrine.schema.json"
);

let _cache: DoctrineEntry[] | null = null;

export function loadDoctrineCatalog(): DoctrineEntry[] {
  if (_cache !== null) return _cache;
  type RawDoctrine = Omit<DoctrineEntry, "standing_effects"> & { standing_effects?: StandingEffect[] };
  let raw: RawDoctrine[];
  try {
    raw = loadValidated<RawDoctrine>(SCHEMA_PATH, DOCTRINES_DIR);
  } catch (e) {
    throw new Error(
      "Failed to load doctrine catalog from content/doctrines/. Check that all .json files conform to schemas/doctrine.schema.json.",
      { cause: e },
    );
  }
  _cache = raw.map((d) => ({ ...d, standing_effects: d.standing_effects ?? [] }));
  return _cache;
}

export function _resetDoctrineCatalogCache(): void {
  _cache = null;
}

export function getDoctrine(
  id: string,
  catalog: DoctrineEntry[] = loadDoctrineCatalog()
): DoctrineEntry {
  const entry = catalog.find((d) => d.id === id);
  if (!entry) throw new DoctrineNotFoundError(id);
  return entry;
}
