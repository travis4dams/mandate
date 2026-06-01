import { loadValidated } from "../src/content/loader";

// Stand-alone content validator used by `npm run validate` and CI. Exits non-zero
// on any schema violation so a bad content file blocks the merge.

const checks = [
  { schema: "schemas/event.schema.json", dir: "content/events", label: "events" },
  { schema: "schemas/tech.schema.json", dir: "content/tech", label: "tech" },
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
process.exit(failed ? 1 : 0);
