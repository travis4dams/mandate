import { join } from "node:path";
import { loadValidated } from "./loader.js";

// SPEC-COMM-5: trait catalog content type — mirrors schemas/traits.schema.json.

export interface TraitEffects {
  /** Additive shift to the member's preferred rate, in decimal rate units (0.005 = 50 bp). Positive = hawkish lean. */
  readonly preferred_rate_shift?: number;
  /** Fractional multiplier adjustment to `compromise_band` via `(1 + band_modifier)`. -0.3 narrows the band by 30%; 0 = no effect. */
  readonly band_modifier?: number;
}

export interface SignalHook {
  readonly signal: string;
  readonly direction: 1 | -1;
  readonly magnitude: number;
}

export interface TraitEntry {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly effects: TraitEffects;
  readonly signal_hooks: readonly SignalHook[];
}

// Thrown when the trait catalog contains duplicate ids — the schema can't express this.
export class TraitDuplicateIdError extends Error {
  constructor(public readonly duplicateId: string) {
    super(`Trait catalog: duplicate trait id "${duplicateId}".`);
    this.name = "TraitDuplicateIdError";
  }
}

const DEFAULT_TRAITS_DIR = join(new URL(".", import.meta.url).pathname, "../../content/traits");
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/traits.schema.json");

let _cachedTraitCatalog: TraitEntry[] | undefined;

function checkDuplicateIds(entries: TraitEntry[]): void {
  const seen = new Set<string>();
  for (const t of entries) {
    if (seen.has(t.id)) throw new TraitDuplicateIdError(t.id);
    seen.add(t.id);
  }
}

export function loadTraitCatalog(dir: string = DEFAULT_TRAITS_DIR): TraitEntry[] {
  if (dir === DEFAULT_TRAITS_DIR) {
    if (_cachedTraitCatalog === undefined) {
      let entries: TraitEntry[];
      try {
        entries = loadValidated<TraitEntry>(SCHEMA_PATH, dir);
      } catch (e) {
        throw new Error(`Failed to load trait catalog from ${DEFAULT_TRAITS_DIR}`, { cause: e });
      }
      checkDuplicateIds(entries);
      _cachedTraitCatalog = entries;
    }
    return _cachedTraitCatalog;
  }
  let entries: TraitEntry[];
  try {
    entries = loadValidated<TraitEntry>(SCHEMA_PATH, dir);
  } catch (e) {
    throw new Error(`Failed to load trait catalog from ${dir}`, { cause: e });
  }
  checkDuplicateIds(entries);
  return entries;
}

export function _resetTraitCatalogCache(): void {
  _cachedTraitCatalog = undefined;
}
