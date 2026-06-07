import { loadValidated, loadValidatedFile } from "../src/content/loader";

// Stand-alone content validator used by `npm run validate` and CI. Exits non-zero
// on any schema violation so a bad content file blocks the merge.

const dirChecks = [
  { schema: "schemas/briefing.schema.json", dir: "content/briefings", label: "briefings" },
  { schema: "schemas/event.schema.json", dir: "content/events", label: "events" },
  { schema: "schemas/hearing.schema.json", dir: "content/hearings", label: "hearings" },
  { schema: "schemas/tech.schema.json", dir: "content/tech", label: "tech" },
  { schema: "schemas/scenario.schema.json", dir: "content/scenarios", label: "scenarios" },
  { schema: "schemas/replay.schema.json", dir: "content/replays", label: "replays" },
  { schema: "schemas/committee.schema.json", dir: "content/committees", label: "committees" },
  { schema: "schemas/calibration.schema.json", dir: "content/calibration", label: "calibration" },
  { schema: "schemas/traits.schema.json", dir: "content/traits", label: "traits" },
];

const fileChecks = [
  { schema: "schemas/tick.schema.json", file: "content/engine/tick.json", label: "tick" },
  { schema: "schemas/fog.schema.json", file: "content/engine/fog.json", label: "fog" },
  { schema: "schemas/credibility.schema.json", file: "content/engine/credibility.json", label: "credibility params" },
  { schema: "schemas/committee-params.schema.json", file: "content/engine/committee.json", label: "committee params" },
  { schema: "schemas/meeting-schedule.schema.json", file: "content/engine/meeting-schedule.json", label: "meeting schedule" },
  { schema: "schemas/guidance.schema.json", file: "content/engine/guidance.json", label: "guidance params" },
  { schema: "schemas/dynamics.schema.json", file: "content/engine/dynamics.json", label: "dynamics params" },
  { schema: "schemas/mandate.schema.json", file: "content/engine/mandate.json", label: "mandate params" },
  { schema: "schemas/chair-capital.schema.json", file: "content/engine/chair-capital.json", label: "chair capital params" },
  { schema: "schemas/clock-cadence.schema.json", file: "content/engine/clock-cadence.json", label: "clock cadence" },
  { schema: "schemas/forecast-quality.schema.json", file: "content/engine/forecast-quality.json", label: "forecast quality params" },
  { schema: "schemas/lags.schema.json", file: "content/engine/lags.json", label: "lags params" },
  { schema: "schemas/term-structure.schema.json", file: "content/engine/term-structure.json", label: "term-structure params" },
  { schema: "schemas/calibration-thresholds.schema.json", file: "content/engine/calibration-thresholds.json", label: "calibration thresholds" },
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
