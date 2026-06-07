import { join } from "node:path";
import { loadValidated } from "./loader.js";

export interface StandingEffect {
  target: string;
  value: number;
}

export type DoctrineHook = "dot_plot_meeting";

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
  const raw = loadValidated<RawDoctrine>(SCHEMA_PATH, DOCTRINES_DIR);
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
