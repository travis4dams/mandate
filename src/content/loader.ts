import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Loads a directory of content files and validates every entity against its
// JSON Schema before the engine ever sees it. A malformed content file fails
// loudly here rather than corrupting a running game.

export function loadValidated<T>(schemaPath: string, dir: string): T[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);
  const out: T[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (!validate(item)) {
        throw new Error(`${file}: ${ajv.errorsText(validate.errors)}`);
      }
      out.push(item as T);
    }
  }
  return out;
}

// Module-level AJV instance and compile cache for loadValidatedFile.
// Keyed by schemaPath so the same schema is compiled at most once per process.
const _ajv = new Ajv2020({ allErrors: true, strict: false });
const _validateCache = new Map<string, ValidateFunction>();

// Validates a single JSON file against a schema. Throws on validation failure.
// Re-uses the compiled ValidateFunction on repeated calls with the same schemaPath.
export function loadValidatedFile<T>(schemaPath: string, filePath: string): T {
  let validate = _validateCache.get(schemaPath);
  if (validate === undefined) {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    validate = _ajv.compile(schema);
    _validateCache.set(schemaPath, validate);
  }
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!validate(raw)) {
    throw new Error(`${filePath}: ${_ajv.errorsText(validate.errors)}`);
  }
  return raw as T;
}

/** Test-only: clear the compile cache and remove schemas from the AJV instance
 *  so subsequent calls re-invoke ajv.compile cleanly. */
export function _resetValidateFileCache(): void {
  for (const schemaPath of _validateCache.keys()) {
    const raw = JSON.parse(readFileSync(schemaPath, "utf8")) as { $id?: string };
    if (raw.$id) {
      _ajv.removeSchema(raw.$id);
    }
  }
  _validateCache.clear();
}
