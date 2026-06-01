import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Requirements traceability — the automated "level-set against the spec".
// Every requirement in spec/requirements.md tagged [testable] must be referenced
// by at least one test (by its SPEC-XXX-N id). Orphans fail CI, so the spec and
// the test suite can never silently drift apart.

const ID_RE = /\bSPEC-[A-Z]+-\d+\b/g;

const specText = readFileSync("spec/requirements.md", "utf8");
const testable = new Set<string>();
for (const line of specText.split("\n")) {
  if (line.includes("[testable]")) {
    for (const id of line.match(ID_RE) ?? []) testable.add(id);
  }
}

const referenced = new Set<string>();
function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".ts")) {
      for (const id of readFileSync(p, "utf8").match(ID_RE) ?? []) referenced.add(id);
    }
  }
}
walk("test");

const orphans = [...testable].filter((id) => !referenced.has(id));
console.log(`Testable requirements: ${testable.size}`);
console.log(`Covered by tests:      ${[...testable].filter((id) => referenced.has(id)).length}`);
if (orphans.length) {
  console.error(`\u2717 Orphan requirements (specced, untested): ${orphans.join(", ")}`);
  process.exit(1);
}
console.log("\u2713 Every testable requirement is referenced by a test.");
