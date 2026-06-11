import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// SPEC-META-1
// Shared spec-parsing logic consumed by tools/spec-trace.ts and tools/gen-state.ts.
// Parses spec/requirements.md for SPEC-XXX-N ids, their section, tag, and
// referencing test files.

export interface SpecEntry {
  id: string;
  section: string;
  tag: "testable" | "design";
  tests: string[];
}

const ID_RE = /\bSPEC-[A-Z]+-\d+\b/g;

// A SPEC definition line must start with optional whitespace then "- **SPEC-"
const DEFN_RE = /^\s*- \*\*SPEC-[A-Z]+-\d+\*\*/;

/**
 * Scan a directory tree for .ts/.tsx files and collect which SPEC ids appear
 * in each file's content (comment references).
 */
function buildTestIndex(dir: string): Map<string, string[]> {
  // Map from spec id to sorted list of file paths
  const index = new Map<string, Set<string>>();

  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(p);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const text = readFileSync(p, "utf8");
        for (const id of new Set(text.match(ID_RE) ?? [])) {
          if (!index.has(id)) index.set(id, new Set());
          index.get(id)!.add(p);
        }
      }
    }
  }

  walk(dir);

  const result = new Map<string, string[]>();
  for (const [id, paths] of index) {
    result.set(id, [...paths].sort());
  }
  return result;
}

/**
 * Parse spec/requirements.md and return a per-id mapping including section,
 * tag, and list of test files that reference each id.
 *
 * Only lines matching the definition pattern `- **SPEC-XXX-N**` are
 * considered definitions; other mentions of spec ids (intro prose, cross-
 * references) are ignored for section/tag assignment.
 *
 * @param specPath  Path to spec/requirements.md
 * @param testDirs  Directories to scan for test references (default: ["test"])
 */
export function parseSpecs(specPath: string, testDirs: string[] = ["test"]): SpecEntry[] {
  const specText = readFileSync(specPath, "utf8");
  const lines = specText.split("\n");

  // Build test index from all specified directories
  const testIndex = new Map<string, Set<string>>();
  for (const dir of testDirs) {
    try {
      const idx = buildTestIndex(dir);
      for (const [id, files] of idx) {
        if (!testIndex.has(id)) testIndex.set(id, new Set());
        for (const f of files) testIndex.get(id)!.add(f);
      }
    } catch {
      // Directory doesn't exist — skip silently (matches spec-trace.ts behaviour)
    }
  }

  // Parse definitions from requirements.md
  let currentSection = "";
  const specMap = new Map<string, { id: string; section: string; tag: "testable" | "design" }>();

  for (const line of lines) {
    // Update current section on any heading line
    const hMatch = line.match(/^#{1,6}\s+(.+)/);
    if (hMatch) {
      currentSection = hMatch[1].trim();
      continue;
    }

    // Only capture SPEC ids from definition lines
    if (!DEFN_RE.test(line)) continue;

    const ids = line.match(ID_RE);
    if (!ids) continue;

    const primaryId = ids[0];
    if (!specMap.has(primaryId)) {
      const tag: "testable" | "design" = line.includes("[testable]") ? "testable" : "design";
      specMap.set(primaryId, { id: primaryId, section: currentSection, tag });
    }
  }

  // Build sorted output
  const entries: SpecEntry[] = [];
  for (const id of [...specMap.keys()].sort()) {
    const defn = specMap.get(id)!;
    const testFiles = testIndex.get(id);
    entries.push({
      id: defn.id,
      section: defn.section,
      tag: defn.tag,
      tests: testFiles ? [...testFiles].sort() : [],
    });
  }

  return entries;
}

/**
 * Return just the set of testable ids (for spec-trace compatibility).
 */
export function getTestableIds(specPath: string): Set<string> {
  const entries = parseSpecs(specPath);
  return new Set(entries.filter((e) => e.tag === "testable").map((e) => e.id));
}
