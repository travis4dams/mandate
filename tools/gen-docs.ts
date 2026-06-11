import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

// SPEC-META-2
// Emits three managed doc artifacts deterministically from tree-only facts:
//   (a) README.md managed sections (between <!-- gen:* --> marker pairs)
//   (b) docs/content-reference.md  from schemas/*.json
//   (c) docs/traceability.md        SPEC → tag → section → tests → PR
//
// Two modes:
//   tsx tools/gen-docs.ts           — plain (tree-pure, preserves existing PR cells)
//   tsx tools/gen-docs.ts --enrich  — also fills EMPTY PR cells from git log squash
//                                     subjects (never alters non-empty cells)
//
// --check mode: regenerate to memory, byte-compare all three artifacts (exit 2 naming
//               the stale file on mismatch).

import { parseSpecs, type SpecEntry } from "./lib/spec-parse.js";

// ---- types ------------------------------------------------------------------

interface SchemaProperty {
  type?: string;
  description?: string;
  pattern?: string;
  oneOf?: unknown[];
  anyOf?: unknown[];
  enum?: unknown[];
  $ref?: string;
}

interface Schema {
  title?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  $id?: string;
}

// ---- helpers ----------------------------------------------------------------

const CONTENT_SCHEMA_NAMES = [
  "scenario", "doctrine", "briefing", "hearing",
  "event", "tech", "traits", "committee", "replay",
];

const ENGINE_SCHEMA_NAMES = [
  "tick", "fog", "credibility", "committee-params", "dynamics",
  "guidance", "lags", "mandate", "meeting-schedule", "productivity",
  "shocks", "term-structure", "clock-cadence", "forecast-quality",
  "chair-capital", "dot-plot-params", "calibration-thresholds",
  "calibration", "state-manual",
];

const EXAMPLE_MAP: Record<string, string | null> = {
  scenario: "content/scenarios/1979_stagflation.json",
  doctrine: "content/doctrines/gradualism.json",
  briefing: "content/briefings/1979_q3_stagflation.json",
  hearing: "content/hearings/confirmation.json",
  event: "content/events/oil_shock.json",
  tech: null,
  traits: null,
  committee: "content/committees/1979.json",
  replay: "content/replays/1979_chair_tightening.json",
};

function loadSchema(schemasDir: string, name: string): Schema | null {
  const p = join(schemasDir, `${name}.schema.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Schema;
}

function firstContentFile(contentDir: string, typeDir: string): string | null {
  const d = join(contentDir, typeDir);
  try {
    const files = readdirSync(d).filter((f) => f.endsWith(".json")).sort();
    return files.length > 0 ? `content/${typeDir}/${files[0]}` : null;
  } catch {
    return null;
  }
}

function schemaToMd(name: string, schema: Schema, examplePath: string | null): string {
  const title = schema.title ?? name;
  const desc = schema.description ?? "";
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const idProp = props["id"];
  const idPattern = idProp?.pattern ?? "";

  const lines: string[] = [`### ${title}`, ""];
  if (desc) lines.push(desc, "");
  if (idPattern) lines.push(`**Id pattern:** \`${idPattern}\``, "");

  if (Object.keys(props).length > 0) {
    lines.push("| Field | Type | Required | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const [field, fdef] of Object.entries(props)) {
      let ftype = fdef.type ?? "";
      if (!ftype) {
        if (fdef.oneOf || fdef.anyOf) ftype = "oneOf/anyOf";
        else if (fdef.enum) ftype = "enum";
        else if (fdef.$ref) ftype = "ref";
      }
      const freq = required.includes(field) ? "yes" : "no";
      const fdesc = (fdef.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
      lines.push(`| \`${field}\` | ${ftype} | ${freq} | ${fdesc} |`);
    }
    lines.push("");
  }

  if (examplePath && existsSync(examplePath)) {
    lines.push(`**Example:** [\`${examplePath}\`](${examplePath})`, "");
  }

  return lines.join("\n");
}

// ---- (a) README managed sections -------------------------------------------

const README_MARKER_RE = /<!--\s*gen:(\w+)\s*-->([\s\S]*?)<!--\s*\/gen:\1\s*-->/g;

export function genReadmeSections(
  packageJson: Record<string, unknown>
): Record<string, string> {
  const scripts = (packageJson["scripts"] as Record<string, string>) ?? {};

  const layoutContent = [
    "```",
    "schemas/     JSON Schemas — the contract for every content type",
    "content/     The game, as data:",
    "  briefings/   staff briefings with raise/hold/lower forecast branches",
    "  calibration/ FRED baseline data for engine calibration",
    "  committees/  FOMC-style voting committees",
    "  doctrines/   adoptable policy frameworks",
    "  engine/      engine parameter files (tick, fog, credibility, dynamics, …)",
    "  events/      weighted, condition-gated events",
    "  hearings/    confirmation-hearing questions and answers",
    "  localization/ all player-facing text, keyed (never inline in logic)",
    "  replays/     committed player-strategy artifacts (policy sequences)",
    "  scenarios/   starting game states",
    "  tech/        the three research trees (theory / applied / infrastructure)",
    "  traits/      committee-member trait catalog",
    "src/",
    "  engine/      deterministic simulation core (no I/O, no wall clock, seeded RNG)",
    "  content/     the interpreters: condition evaluator, effect applier, schema loader",
    "web/",
    "  src/         React 18 + Vite UI — Dashboard, MeetingPanel, ChartsPanel",
    "tools/       CLI scripts: validate-content, spec-trace, gen-state, gen-docs, calibrate",
    "spec/        DESIGN.md (the vision) + requirements.md (ID'd, testable requirements)",
    "test/        the test suite; every test cites the SPEC id it covers",
    ".github/     CI: TDD gate, content validation, spec traceability, state/docs freshness",
    "```",
  ].join("\n");

  const contentSection = [
    "Engine code contains no game content. All content lives in `content/`,",
    "governed by JSON Schemas in `schemas/`. Adding content (e.g. a new event) is",
    "just dropping a JSON object into the right subdirectory and its strings into",
    "`content/localization/en.json`; `npm run validate` confirms it conforms.",
    "",
    "Three patterns are borrowed directly from Paradox modding: logic is separated",
    "from display text (localization keys), content is split by type into predictable",
    "folders, and everything is validated by external tooling (here, JSON Schema in",
    "place of CWTools).",
  ].join("\n");

  const cmdRows = Object.entries(scripts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, cmd]) => `| \`npm run ${name}\` | ${cmd} |`);
  const commandsSection = [
    "| Command | What it does |",
    "| --- | --- |",
    ...cmdRows,
  ].join("\n");

  return { layout: layoutContent, content: contentSection, commands: commandsSection };
}

/** Apply managed sections into README text. Throws if a marker pair is missing/malformed. */
export function applyReadmeMarkers(
  readmeText: string,
  sections: Record<string, string>
): string {
  // Verify all expected markers exist
  for (const key of Object.keys(sections)) {
    const openTag = `<!-- gen:${key} -->`;
    const closeTag = `<!-- /gen:${key} -->`;
    if (!readmeText.includes(openTag)) {
      throw new Error(`README is missing opening marker: ${openTag}`);
    }
    if (!readmeText.includes(closeTag)) {
      throw new Error(`README is missing closing marker: ${closeTag}`);
    }
  }
  // Replace each managed section
  let result = readmeText;
  for (const [key, body] of Object.entries(sections)) {
    const openTag = `<!-- gen:${key} -->`;
    const closeTag = `<!-- /gen:${key} -->`;
    const openIdx = result.indexOf(openTag);
    const closeIdx = result.indexOf(closeTag);
    if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
      throw new Error(`README marker pair for '${key}' is malformed`);
    }
    result =
      result.slice(0, openIdx + openTag.length) +
      "\n" +
      body +
      "\n" +
      result.slice(closeIdx);
  }
  return result;
}

// ---- (b) content-reference.md ----------------------------------------------

export function genContentReference(
  schemasDir: string,
  contentDir: string
): string {
  const parts: string[] = [
    "# Content Reference",
    "",
    "Auto-generated from `schemas/*.json`. Do not edit by hand — run `npm run docs:gen`.",
    "",
    "## Content types",
    "",
  ];

  for (const sname of CONTENT_SCHEMA_NAMES) {
    const schema = loadSchema(schemasDir, sname);
    if (!schema) continue;
    const examplePath =
      EXAMPLE_MAP[sname] !== undefined
        ? EXAMPLE_MAP[sname]
        : firstContentFile(contentDir, sname);
    parts.push(schemaToMd(sname, schema, examplePath));
  }

  parts.push(
    "## Engine parameter files",
    "",
    "Engine parameters live in `content/engine/` and are validated by per-section schemas.",
    "They are not player-authored content — they tune the simulation internals.",
    "",
    "| Schema | Content file(s) | Description |",
    "| --- | --- | --- |"
  );

  const engineContentDir = join(contentDir, "engine");
  for (const sname of ENGINE_SCHEMA_NAMES) {
    const schema = loadSchema(schemasDir, sname);
    if (!schema) continue;
    const desc = (schema.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80);
    // Find matching content file(s)
    let candidates: string[] = [];
    try {
      const snameNorm = sname.replace(/-/g, "_");
      candidates = readdirSync(engineContentDir).filter((f) => {
        const fNorm = f.replace(/-/g, "_").replace(".json", "");
        return fNorm === snameNorm || fNorm.startsWith(snameNorm.split("_")[0]);
      });
      // More targeted: prefer exact match
      const exact = readdirSync(engineContentDir).find((f) => {
        return f === `${sname}.json` || f === sname.replace(/-/g, "_") + ".json";
      });
      if (exact) candidates = [exact];
    } catch { /* ignore */ }
    const cf = candidates.length > 0
      ? candidates.sort().map((c) => `\`content/engine/${c}\``).join(", ")
      : "—";
    parts.push(`| \`schemas/${sname}.schema.json\` | ${cf} | ${desc} |`);
  }

  parts.push("");
  return parts.join("\n");
}

// ---- (c) traceability.md ---------------------------------------------------

/** Parse existing PR cells from a committed traceability.md (plain mode — preserve). */
export function parsePrCells(existingText: string): Map<string, string> {
  const cells = new Map<string, string>();
  for (const line of existingText.split("\n")) {
    // Table rows: | SPEC-XXX-N | tag | section | tests | PR |
    const m = line.match(/^\|\s*(SPEC-[A-Z]+-\d+)\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/);
    if (m) {
      cells.set(m[1], m[2].trim());
    }
  }
  return cells;
}

/**
 * Parse PR cells from git log lines (--enrich mode only).
 * Returns map of SPEC-id -> "#N" for highest PR# found.
 * Injectable for testing — pass git log lines directly.
 */
export function parsePrCellsFromLog(logLines: string[]): Map<string, string> {
  const ID_RE = /\bSPEC-[A-Z]+-\d+\b/g;
  const prMap = new Map<string, number>();
  for (const subject of logLines) {
    const pm = subject.match(/\(#(\d+)\)\s*$/);
    const fm = subject.match(/Fixes #(\d+)/);
    const prNum = pm ? parseInt(pm[1]) : fm ? parseInt(fm[1]) : null;
    if (!prNum) continue;
    for (const sid of subject.match(ID_RE) ?? []) {
      if (prNum > (prMap.get(sid) ?? 0)) prMap.set(sid, prNum);
    }
  }
  const result = new Map<string, string>();
  for (const [sid, n] of prMap) result.set(sid, `#${n}`);
  return result;
}

function formatTests(tests: string[]): string {
  if (tests.length === 0) return "—";
  return tests.map((t) => `\`${t}\``).join(", ");
}

export function genTraceability(
  specs: SpecEntry[],
  existingPrCells: Map<string, string>,
  enrichPrCells?: Map<string, string>
): string {
  const parts: string[] = [
    "# Traceability",
    "",
    "Auto-generated by `tools/gen-docs.ts`. Do not edit the SPEC, tag, section, or tests",
    "columns by hand — run `npm run docs:gen` to regenerate. The PR column is preserved",
    "input in plain mode; only `--enrich` (workflow-only) fills empty cells from git log.",
    "",
    "| SPEC | Tag | Section | Tests | PR |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const s of specs) {
    const existingPr = existingPrCells.get(s.id) ?? "";
    let prCell = existingPr;
    // --enrich: only fill EMPTY cells (never alter a non-empty cell)
    if (!prCell && enrichPrCells) {
      prCell = enrichPrCells.get(s.id) ?? "";
    }
    const section = s.section.replace(/\|/g, "\\|");
    parts.push(
      `| ${s.id} | ${s.tag} | ${section} | ${formatTests(s.tests)} | ${prCell} |`
    );
  }

  parts.push("");
  return parts.join("\n");
}

// ---- top-level generate ----------------------------------------------------

export interface GenDocsResult {
  readme: string;
  contentReference: string;
  traceability: string;
}

export function generateDocs(options: {
  enrich?: boolean;
  existingReadme?: string;
  existingTraceability?: string;
  gitLogLines?: string[];
} = {}): GenDocsResult {
  const testDirs: string[] = [];
  if (existsSync("test")) testDirs.push("test");
  if (existsSync("web/src")) testDirs.push("web/src");
  const specs = parseSpecs("spec/requirements.md", testDirs);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
  const sections = genReadmeSections(packageJson);

  const readmeText = options.existingReadme ?? readFileSync("README.md", "utf8");
  const readme = applyReadmeMarkers(readmeText, sections);

  const contentReference = genContentReference("schemas", "content");

  const existingTraceabilityText =
    options.existingTraceability ??
    (existsSync("docs/traceability.md") ? readFileSync("docs/traceability.md", "utf8") : "");
  const existingPrCells = parsePrCells(existingTraceabilityText);

  let enrichPrCells: Map<string, string> | undefined;
  if (options.enrich) {
    const logLines =
      options.gitLogLines ??
      execSync("git log --oneline", { encoding: "utf8" }).trim().split("\n");
    enrichPrCells = parsePrCellsFromLog(logLines);
  }

  const traceability = genTraceability(specs, existingPrCells, enrichPrCells);

  return { readme, contentReference, traceability };
}

// ---- CLI entry point -------------------------------------------------------

const isCheck = process.argv.includes("--check");
const isEnrich = process.argv.includes("--enrich");

if (isCheck) {
  const generated = generateDocs({ enrich: false });
  let failed = false;
  const checks: Array<[string, string]> = [
    ["README.md", generated.readme],
    ["docs/content-reference.md", generated.contentReference],
    ["docs/traceability.md", generated.traceability],
  ];
  for (const [path, content] of checks) {
    if (!existsSync(path)) {
      console.error(`docs:check: ${path} does not exist — run npm run docs:gen first`);
      process.exit(2);
    }
    const committed = readFileSync(path, "utf8");
    if (content !== committed) {
      console.error(`docs:check: ${path} is stale — run npm run docs:gen to regenerate`);
      failed = true;
    }
  }
  if (failed) process.exit(2);
  console.log("docs:check: all three doc artifacts are up-to-date.");
} else {
  // Write mode (plain or --enrich)
  const generated = generateDocs({ enrich: isEnrich });
  writeFileSync("README.md", generated.readme, "utf8");
  writeFileSync("docs/content-reference.md", generated.contentReference, "utf8");
  writeFileSync("docs/traceability.md", generated.traceability, "utf8");
  console.log(`Wrote README.md, docs/content-reference.md, docs/traceability.md${isEnrich ? " (--enrich)" : ""}`);
}
