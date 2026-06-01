import Ajv2020 from "ajv/dist/2020";
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
