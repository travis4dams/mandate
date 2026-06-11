import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

// SPEC-META-1
// Emits STATE.json (repo root) with deterministic, tree-only facts:
//   - content: JSON file counts per content/ subdirectory
//   - slices: .omc/plans/*.md checkbox tallies and titles
//   - specs: SPEC-id mapping from spec/requirements.md + test references
//
// Run: tsx tools/gen-state.ts          — write STATE.json
//      tsx tools/gen-state.ts --check  — regenerate to memory, byte-compare,
//                                        Ajv-validate state.manual.json

import { parseSpecs } from "./lib/spec-parse.js";

// ---- helpers ----------------------------------------------------------------

/** Count *.json files in a directory (non-recursive). */
function countJsonFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

/** Extract the first H1 heading text from markdown content. */
function firstH1(text: string): string {
  const m = text.match(/^# (.+)$/m);
  return m ? m[1].trim() : "";
}

/** Count checkbox lines matching /^\s*- \[[ x]\]/ (case-sensitive 'x'). */
function countCheckboxes(text: string): { done: number; total: number } | null {
  const matches = text.match(/^\s*- \[[ x]\]/gm) ?? [];
  if (matches.length === 0) return null;
  const done = matches.filter((m) => m.includes("[x]")).length;
  return { done, total: matches.length };
}

// ---- generators -------------------------------------------------------------

export interface ContentCounts {
  [typeDir: string]: number;
}

export interface SliceEntry {
  checkboxes: { done: number; total: number } | null;
  file: string;
  title: string;
}

export interface SpecEntry {
  id: string;
  section: string;
  tag: string;
  tests: string[];
}

export interface StateJson {
  content: ContentCounts;
  slices: SliceEntry[];
  specs: SpecEntry[];
}

/** Generate content counts from content/ directory. */
export function genContent(contentDir: string = "content"): ContentCounts {
  const result: ContentCounts = {};
  for (const name of readdirSync(contentDir).sort()) {
    const subdir = join(contentDir, name);
    try {
      const stat = readdirSync(subdir); // throws if not a directory
      void stat;
      result[name] = countJsonFiles(subdir);
    } catch {
      // skip non-directories
    }
  }
  return result;
}

/** Generate slice entries from .omc/plans/ directory. */
export function genSlices(plansDir: string = ".omc/plans"): SliceEntry[] {
  const files = readdirSync(plansDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files.map((fname) => {
    const text = readFileSync(join(plansDir, fname), "utf8");
    return {
      checkboxes: countCheckboxes(text),
      file: basename(fname),
      title: firstH1(text),
    };
  });
}

/** Generate spec entries from spec/requirements.md and test/ directory. */
export function genSpecs(
  specPath: string = "spec/requirements.md",
  testDirs: string[] = ["test"]
): SpecEntry[] {
  const testDirsExisting = testDirs.filter((d) => existsSync(d));
  return parseSpecs(specPath, testDirsExisting);
}

/** Generate the full STATE.json object. */
export function generateState(): StateJson {
  return {
    content: genContent(),
    slices: genSlices(),
    specs: genSpecs(),
  };
}

/** Serialise STATE.json: 2-space indent, sorted keys, trailing newline. */
export function serialiseState(state: StateJson): string {
  return JSON.stringify(state, sortedReplacer, 2) + "\n";
}

/** JSON replacer that sorts object keys. Arrays preserve order. */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// ---- CLI entry point --------------------------------------------------------

const isCheck = process.argv.includes("--check");

if (isCheck) {
  // --check mode: regenerate to memory, byte-compare with STATE.json,
  //               Ajv-validate state.manual.json against its schema.
  let failed = false;

  // 1. Byte-compare STATE.json
  const generated = serialiseState(generateState());
  const stateJsonPath = "STATE.json";
  if (!existsSync(stateJsonPath)) {
    console.error(`state:check: ${stateJsonPath} does not exist — run npm run state:gen first`);
    process.exit(2);
  }
  const committed = readFileSync(stateJsonPath, "utf8");
  if (generated !== committed) {
    console.error(`state:check: ${stateJsonPath} is stale — run npm run state:gen to regenerate`);
    failed = true;
  }

  // 2. Ajv-validate state.manual.json
  const manualPath = "state.manual.json";
  const schemaPath = "schemas/state-manual.schema.json";
  if (!existsSync(manualPath)) {
    console.error(`state:check: ${manualPath} does not exist`);
    process.exit(2);
  }
  if (!existsSync(schemaPath)) {
    console.error(`state:check: ${schemaPath} does not exist`);
    process.exit(2);
  }

  // Dynamic import of Ajv (ESM-compatible)
  const { default: Ajv } = await import("ajv");
  const ajv = new Ajv({ strict: true, allErrors: true });
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = ajv.compile(schema);
  const manual = JSON.parse(readFileSync(manualPath, "utf8"));

  if (!validate(manual)) {
    console.error(`state:check: ${manualPath} failed schema validation:`);
    for (const err of validate.errors ?? []) {
      console.error(`  ${err.instancePath || "/"} ${err.message}`);
    }
    failed = true;
  }

  if (failed) {
    process.exit(2);
  }
  console.log("state:check: STATE.json is up-to-date and state.manual.json is valid.");
} else {
  // Default: write STATE.json
  const state = generateState();
  const output = serialiseState(state);
  writeFileSync("STATE.json", output, "utf8");
  console.log("Wrote STATE.json");
}
