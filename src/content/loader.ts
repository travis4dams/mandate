import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Loads a directory of content files and validates every entity against its
// JSON Schema before the engine ever sees it. A malformed content file fails
// loudly here rather than corrupting a running game.
//
// SPEC-WEB-2: the loader also supports a pre-registered content registry so the
// engine can run in a browser bundle. Browser code registers JSON via Vite static
// imports before the engine starts; Node code falls back to readFileSync. The
// registry lookup is keyed by the normalized project-relative path.

const _fileRegistry = new Map<string, unknown>();
const _dirRegistry = new Map<string, unknown[]>();

/** Normalize a path to its project-relative form starting at the LAST `schemas/`
 *  or `content/` segment. Absolute paths produced by `join(import.meta.url pathname,
 *  "../../content/...")` and Vite-resolved bundler paths collapse to the same key —
 *  letting the browser content bundle register once and have every engine loader
 *  find the data. The "last segment" rule matters because absolute paths like
 *  `/home/.../src/content/../../schemas/foo.json` contain BOTH `content/` and
 *  `schemas/` — a right-to-left scan anchors on the correct (rightmost) segment. */
function registryKey(path: string): string {
  const segments = path.split("/");
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] === "schemas" || segments[i] === "content") {
      return segments.slice(i).join("/");
    }
  }
  return path;
}

/** Register a JSON file (schema or content) in the registry so subsequent
 *  loadValidated*[File] calls for this path skip readFileSync. The browser
 *  content bundle calls this before constructing any Session. */
export function registerContentFile(filePath: string, content: unknown): void {
  _fileRegistry.set(registryKey(filePath), content);
}

/** Register the JSON entities found under a content directory (e.g. content/scenarios)
 *  so subsequent loadValidated calls for dir skip readdirSync + readFileSync. */
export function registerContentDir(dir: string, items: unknown[]): void {
  _dirRegistry.set(registryKey(dir), items);
}

/** Test-only: clear both content registries so subsequent calls re-populate from disk. */
export function _resetRegistries(): void {
  _fileRegistry.clear();
  _dirRegistry.clear();
}

function readJsonFile(filePath: string): unknown {
  const key = registryKey(filePath);
  // Use .has() rather than checking for undefined — a Vite parse failure could
  // legitimately register `mod.default === undefined`, which would otherwise
  // silently fall through to readFileSync and surface as the misleading
  // "import ordering" stub error.
  if (_fileRegistry.has(key)) return _fileRegistry.get(key);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

// Module-level AJV instance and compile cache shared by both loaders.
// Keyed by schemaPath so the same schema is compiled at most once per process.
const _ajv = new Ajv2020({ allErrors: true, strict: false });
const _validateCache = new Map<string, ValidateFunction>();

export function loadValidated<T>(schemaPath: string, dir: string): T[] {
  let validate = _validateCache.get(schemaPath);
  if (validate === undefined) {
    const schema = readJsonFile(schemaPath);
    try {
      validate = _ajv.compile(schema as object);
    } catch (err) {
      throw new Error(`Failed to compile schema "${schemaPath}": ${(err as Error).message}`, { cause: err });
    }
    _validateCache.set(schemaPath, validate);
  }
  const out: T[] = [];
  const registeredItems = _dirRegistry.get(registryKey(dir));
  if (registeredItems !== undefined) {
    // Browser path: items pre-registered; individual filenames not available.
    for (const raw of registeredItems) {
      const expanded = Array.isArray(raw) ? raw : [raw];
      for (const item of expanded) {
        if (!validate(item)) {
          throw new Error(`${dir}: ${_ajv.errorsText(validate.errors)}`);
        }
        out.push(item as T);
      }
    }
  } else {
    // Node.js path: read files one-by-one to preserve filename in error messages.
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
      const expanded = Array.isArray(raw) ? raw : [raw];
      for (const item of expanded) {
        if (!validate(item)) {
          throw new Error(`${file}: ${_ajv.errorsText(validate.errors)}`);
        }
        out.push(item as T);
      }
    }
  }
  return out;
}

// Validates a single JSON file against a schema. Throws on validation failure.
// Re-uses the compiled ValidateFunction on repeated calls with the same schemaPath.
export function loadValidatedFile<T>(schemaPath: string, filePath: string): T {
  let validate = _validateCache.get(schemaPath);
  if (validate === undefined) {
    const schema = readJsonFile(schemaPath);
    try {
      validate = _ajv.compile(schema as object);
    } catch (err) {
      throw new Error(`Failed to compile schema "${schemaPath}": ${(err as Error).message}`, { cause: err });
    }
    _validateCache.set(schemaPath, validate);
  }
  const raw = readJsonFile(filePath);
  if (!validate(raw)) {
    throw new Error(`${filePath}: ${_ajv.errorsText(validate.errors)}`);
  }
  return raw as T;
}

/** Test-only: clear the compile cache and remove schemas from the AJV instance
 *  so subsequent calls re-invoke ajv.compile cleanly. */
export function _resetValidateFileCache(): void {
  for (const schemaPath of _validateCache.keys()) {
    const raw = readJsonFile(schemaPath) as { $id?: string };
    if (raw.$id) {
      _ajv.removeSchema(raw.$id);
    }
  }
  _validateCache.clear();
}
