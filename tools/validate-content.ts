import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { loadValidated } from "../src/content/loader";

// Stand-alone content validator used by `npm run validate` and CI. Exits non-zero
// on any schema violation so a bad content file blocks the merge.

const checks = [
  { schema: "schemas/event.schema.json", dir: "content/events", label: "events" },
  { schema: "schemas/tech.schema.json", dir: "content/tech", label: "tech" },
  { schema: "schemas/scenario.schema.json", dir: "content/scenarios", label: "scenarios" },
  { schema: "schemas/replay.schema.json", dir: "content/replays", label: "replays" },
];

let failed = false;
for (const c of checks) {
  try {
    const items = loadValidated(c.schema, c.dir);
    console.log(`\u2713 ${c.label}: ${items.length} valid`);
  } catch (e) {
    failed = true;
    console.error(`\u2717 ${c.label}: ${(e as Error).message}`);
  }
}

// Single-file validation for content/engine/params.json against schemas/engine-params.schema.json.
try {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = JSON.parse(readFileSync("schemas/engine-params.schema.json", "utf8"));
  const validate = ajv.compile(schema);
  const raw = JSON.parse(readFileSync("content/engine/params.json", "utf8"));
  if (!validate(raw)) {
    throw new Error(`content/engine/params.json: ${ajv.errorsText(validate.errors)}`);
  }
  console.log("\u2713 engine-params: valid");
} catch (e) {
  failed = true;
  console.error(`\u2717 engine-params: ${(e as Error).message}`);
}

process.exit(failed ? 1 : 0);
