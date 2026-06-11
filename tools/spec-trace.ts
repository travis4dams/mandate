import { existsSync } from "node:fs";

// Requirements traceability — the automated "level-set against the spec".
// Every requirement in spec/requirements.md tagged [testable] must be referenced
// by at least one test (by its SPEC-XXX-N id). Orphans fail CI, so the spec and
// the test suite can never silently drift apart.
//
// SPEC-META-1: refactored to consume tools/lib/spec-parse.ts; CLI behaviour
// and exit codes are unchanged.

import { parseSpecs } from "./lib/spec-parse.js";

// Each walk root is existsSync-guarded so a missing directory (wrong CWD, renamed dir)
// surfaces as a structured diagnostic, not an opaque ENOENT crash.
const testDirs: string[] = [];
if (existsSync("test")) testDirs.push("test");
if (existsSync("web/src")) testDirs.push("web/src");

const entries = parseSpecs("spec/requirements.md", testDirs);
const testable = entries.filter((e) => e.tag === "testable");
const covered = testable.filter((e) => e.tests.length > 0);
const orphans = testable.filter((e) => e.tests.length === 0);

console.log(`Testable requirements: ${testable.length}`);
console.log(`Covered by tests:      ${covered.length}`);
if (orphans.length) {
  console.error(`✗ Orphan requirements (specced, untested): ${orphans.map((e) => e.id).join(", ")}`);
  process.exit(1);
}
console.log("✓ Every testable requirement is referenced by a test.");
