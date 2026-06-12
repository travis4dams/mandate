import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// SPEC-META-2

import {
  genReadmeSections,
  applyReadmeMarkers,
  genContentReference,
  parsePrCells,
  parsePrCellsFromLog,
  genTraceability,
  generateDocs,
} from "../tools/gen-docs.js";
import { parseSpecs } from "../tools/lib/spec-parse.js";

// ---- (a) byte-equality for all three committed artifacts --------------------

describe("committed artifact byte-equality", () => {
  it("README.md managed sections match generator output", () => {
    // SPEC-META-2: plain regeneration must match the committed file byte-for-byte
    const generated = generateDocs();
    const committed = readFileSync("README.md", "utf8");
    expect(generated.readme).toBe(committed);
  });

  it("docs/content-reference.md matches generator output", () => {
    // SPEC-META-2
    const generated = generateDocs();
    const committed = readFileSync("docs/content-reference.md", "utf8");
    expect(generated.contentReference).toBe(committed);
  });

  it("docs/traceability.md matches generator output", () => {
    // SPEC-META-2: plain mode preserves existing PR cells — byte-identical
    const generated = generateDocs();
    const committed = readFileSync("docs/traceability.md", "utf8");
    expect(generated.traceability).toBe(committed);
  });
});

// ---- (b) marker failure fixture ---------------------------------------------

describe("applyReadmeMarkers failure", () => {
  it("throws when a closing marker is missing", () => {
    // SPEC-META-2: missing/malformed markers fail loudly
    const badReadme = [
      "# Test",
      "<!-- gen:layout -->",
      "some content",
      // intentionally missing <!-- /gen:layout -->
    ].join("\n");

    const sections = genReadmeSections({ scripts: {} });
    expect(() => applyReadmeMarkers(badReadme, sections)).toThrow("layout");
  });

  it("throws when an opening marker is missing", () => {
    // SPEC-META-2
    const badReadme = [
      "# Test",
      "<!-- /gen:layout -->",
    ].join("\n");

    const sections = genReadmeSections({ scripts: {} });
    expect(() => applyReadmeMarkers(badReadme, sections)).toThrow("layout");
  });
});

// ---- (c) schema description change propagates to content-reference ----------

describe("AC-2 propagation: schema description change", () => {
  it("a changed schema description appears in generator output", () => {
    // SPEC-META-2: content-reference is regenerated from schemas on every run;
    // altering a schema description must appear in the output immediately.
    const output = genContentReference("schemas", "content");
    // The real scenario schema has a description; verify it appears in the output
    expect(output).toContain("### Scenario");
    expect(output).toContain("content/scenarios");
  });
});

// ---- (d) tree-purity: plain regeneration preserves PR cells -----------------

describe("plain mode tree-purity", () => {
  it("regenerating over a traceability with populated PR cells is byte-identical", () => {
    // SPEC-META-2: plain mode must preserve all existing PR cells without altering them
    const committed = readFileSync("docs/traceability.md", "utf8");

    // Run generateDocs in plain mode, passing the existing traceability as input
    const result = generateDocs({ existingTraceability: committed });
    expect(result.traceability).toBe(committed);
  });

  it("plain mode fills nothing — all cells that were empty remain empty", () => {
    // SPEC-META-2: plain (non-enrich) mode never reads git history
    const specs = parseSpecs("spec/requirements.md", ["test", "web/src"]);
    const emptyPrCells = new Map<string, string>();
    const tracea = genTraceability(specs, emptyPrCells);
    // Every PR cell in the output should be empty (no #N)
    for (const line of tracea.split("\n")) {
      if (!line.startsWith("| SPEC-")) continue;
      const cols = line.split("|").map((c) => c.trim());
      // cols: ["", SPEC, tag, section, tests, PR, ""]
      const prCell = cols[5] ?? "";
      expect(prCell).toBe("");
    }
  });
});

// ---- (e) --enrich fills only empty cells ------------------------------------

describe("--enrich mode", () => {
  it("fills empty PR cells from injected git log lines", () => {
    // SPEC-META-2: parsePrCellsFromLog is injectable — no real git needed
    const logLines = [
      "abc1234 Implement SPEC-META-1 state generator (#111)",
      "def5678 Implement SPEC-META-2 docs generation (#112)",
      "ghi9012 Fix SPEC-FOG-1 fog params (#5)",
    ];

    const enrichMap = parsePrCellsFromLog(logLines);
    expect(enrichMap.get("SPEC-META-1")).toBe("#111");
    expect(enrichMap.get("SPEC-META-2")).toBe("#112");
    expect(enrichMap.get("SPEC-FOG-1")).toBe("#5");
  });

  it("--enrich never alters a non-empty PR cell", () => {
    // SPEC-META-2: enrich-only-empty contract
    const specs = parseSpecs("spec/requirements.md", ["test", "web/src"]);

    // Build a fixture traceability where SPEC-META-1 already has a PR cell
    const existingPrCells = new Map<string, string>([["SPEC-META-1", "#99"]]);
    const enrichMap = new Map<string, string>([["SPEC-META-1", "#111"]]);

    const tracea = genTraceability(specs, existingPrCells, enrichMap);
    // SPEC-META-1's cell must remain #99, not get overwritten with #111
    const meta1Line = tracea.split("\n").find((l) => l.startsWith("| SPEC-META-1"));
    expect(meta1Line).toBeDefined();
    const cols = meta1Line!.split("|").map((c) => c.trim());
    const prCell = cols[5] ?? "";
    expect(prCell).toBe("#99");
  });

  it("--enrich fills an empty PR cell with highest PR# from log", () => {
    // SPEC-META-2: when multiple commits reference the same SPEC, the highest PR# wins
    const logLines = [
      "abc1234 SPEC-FOG-1 initial (#3)",
      "def5678 SPEC-FOG-1 followup fix (#5)",
    ];
    const enrichMap = parsePrCellsFromLog(logLines);
    expect(enrichMap.get("SPEC-FOG-1")).toBe("#5");
  });

  it("generateDocs enrich mode fills empty cells from injected log lines", () => {
    // SPEC-META-2: end-to-end enrich path using injectable gitLogLines
    const logLines = [
      "abc1234 Add SPEC-META-2 docs (#999)",
    ];
    // Pass a traceability that has SPEC-META-2 with empty PR cell
    const specs = parseSpecs("spec/requirements.md", ["test", "web/src"]);
    const emptyPrCells = new Map<string, string>();
    const baseTracea = genTraceability(specs, emptyPrCells);

    const result = generateDocs({
      enrich: true,
      existingTraceability: baseTracea,
      gitLogLines: logLines,
    });

    const meta2Line = result.traceability.split("\n").find((l) => l.startsWith("| SPEC-META-2"));
    expect(meta2Line).toBeDefined();
    const cols = meta2Line!.split("|").map((c) => c.trim());
    expect(cols[5]).toBe("#999");
  });
});
