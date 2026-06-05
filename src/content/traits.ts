import { join } from "node:path";
import { loadValidated } from "./loader.js";

// SPEC-COMM-5: trait catalog content type — mirrors schemas/traits.schema.json.

export interface TraitEffects {
  preferred_rate_shift?: number;
  band_modifier?: number;
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
  readonly effects: Readonly<TraitEffects>;
  readonly signal_hooks?: readonly SignalHook[];
}

const DEFAULT_TRAITS_DIR = join(new URL(".", import.meta.url).pathname, "../../content/traits");
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/traits.schema.json");

let _cachedTraitCatalog: TraitEntry[] | undefined;

export function loadTraitCatalog(dir: string = DEFAULT_TRAITS_DIR): TraitEntry[] {
  if (dir === DEFAULT_TRAITS_DIR) {
    if (_cachedTraitCatalog === undefined) {
      try {
        _cachedTraitCatalog = loadValidated<TraitEntry>(SCHEMA_PATH, dir);
      } catch (e) {
        throw new Error("Failed to load trait catalog from content/traits/catalog.json", { cause: e });
      }
    }
    return _cachedTraitCatalog;
  }
  try {
    return loadValidated<TraitEntry>(SCHEMA_PATH, dir);
  } catch (e) {
    throw new Error(`Failed to load trait catalog from ${dir}`, { cause: e });
  }
}

export function _resetTraitCatalogCache(): void {
  _cachedTraitCatalog = undefined;
}
