import { loadValidated, loadValidatedFile } from "../src/content/loader";

// Stand-alone content validator used by `npm run validate` and CI. Exits non-zero
// on any schema violation so a bad content file blocks the merge.

const dirChecks = [
  { schema: "schemas/event.schema.json", dir: "content/events", label: "events" },
  { schema: "schemas/tech.schema.json", dir: "content/tech", label: "tech" },
  { schema: "schemas/scenario.schema.json", dir: "content/scenarios", label: "scenarios" },
  { schema: "schemas/replay.schema.json", dir: "content/replays", label: "replays" },
  { schema: "schemas/committee.schema.json", dir: "content/committees", label: "committees" },
];

const fileChecks = [
  { schema: "schemas/tick.schema.json", file: "content/engine/tick.json", label: "tick" },
  { schema: "schemas/fog.schema.json", file: "content/engine/fog.json", label: "fog" },
  { schema: "schemas/credibility.schema.json", file: "content/engine/credibility.json", label: "credibility params" },
  { schema: "schemas/committee-params.schema.json", file: "content/engine/committee.json", label: "committee params" },
  { schema: "schemas/meeting-schedule.schema.json", file: "content/engine/meeting-schedule.json", label: "meeting schedule" },
];

let failed = false;

for (const c of dirChecks) {
  try {
    const items = loadValidated(c.schema, c.dir);
    console.log(`✓ ${c.label}: ${items.length} valid`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${c.label}: ${(e as Error).message}`);
  }
}

for (const c of fileChecks) {
  try {
    loadValidatedFile(c.schema, c.file);
    console.log(`✓ ${c.label}: 1 valid`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${c.label}: ${(e as Error).message}`);
  }
}

process.exit(failed ? 1 : 0);
