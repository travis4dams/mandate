import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import { mulberry32, fnv1a32 } from "./rng.js";
import type { SeededRng } from "./rng.js";

// SPEC-NAME-1: seeded deterministic NPC name generator.
// Names are drawn from content/names/pools.json (schema-validated).
// All randomness flows through the injected SeededRng (SPEC-SIM-1).
// nameForId derives a stable per-NPC seed so each NPC always gets the same
// name for a given game seed, regardless of call order.

export interface NamePools {
  honorifics: string[];
  given_names: string[];
  surnames: string[];
}

export interface GeneratedName {
  honorific?: string;
  given: string;
  surname: string;
  full: string;
}

/**
 * Pick a random element from an array using the supplied RNG.
 * Guards the indexed read for noUncheckedIndexedAccess.
 */
function pick<T>(rng: SeededRng, arr: T[]): T {
  const idx = Math.floor(rng() * arr.length);
  const item = arr[idx];
  if (item === undefined) {
    throw new Error(`pick: empty array or out-of-bounds index ${idx}`);
  }
  return item;
}

/**
 * Generate a name by drawing from the provided pools using `rng`.
 * Honorific is included ~50% of the time (when the pool value is non-empty).
 * `full` = `"<honorific> <given> <surname>"` when honorific is set, else
 * `"<given> <surname>"`.
 * Pure: no side effects. Advances the RNG by 3 draws.
 */
export function generateName(rng: SeededRng, pools: NamePools): GeneratedName {
  // Draw a candidate honorific from the pool (~50% chance via empty-string sentinel)
  const rawHonorific = pick(rng, pools.honorifics);
  const honorific = rawHonorific === "" ? undefined : rawHonorific;
  const given = pick(rng, pools.given_names);
  const surname = pick(rng, pools.surnames);
  const full = honorific !== undefined
    ? `${honorific} ${given} ${surname}`
    : `${given} ${surname}`;
  return { honorific, given, surname, full };
}

/**
 * Derive a stable name for an NPC identified by `npcId`, bound to a game `seed`.
 * Uses fnv1a32 to hash the compound key into a sub-seed so each (seed, npcId)
 * pair always resolves to the same name regardless of evaluation order.
 * Pure: does not touch any shared RNG state.
 */
export function nameForId(seed: number, npcId: string, pools: NamePools): GeneratedName {
  // Pipe separator matches SPEC-NAME-1 and the compound-key format used by
  // generateCandidates in institution.ts, so both helpers derive sub-seeds the same way.
  const subSeed = fnv1a32(`${seed}|${npcId}`);
  const rng = mulberry32(subSeed);
  return generateName(rng, pools);
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/names.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/names/pools.json");

let _cachedNamePools: NamePools | undefined;

/**
 * Load and validate the NPC name pools from content/names/pools.json.
 * Result is module-cached after the first call.
 */
export function loadNamePools(): NamePools {
  if (_cachedNamePools !== undefined) return _cachedNamePools;
  try {
    _cachedNamePools = loadValidatedFile<NamePools>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load name pools from content/names/pools.json", { cause: e });
  }
  return _cachedNamePools;
}

/** Test-only: clear the module-level name pools cache. */
export function _resetNamePoolsCache(): void {
  _cachedNamePools = undefined;
}
