import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// SPEC-META-1

import {
  genContent,
  genSlices,
  genSpecs,
  generateState,
  serialiseState,
} from "../tools/gen-state.js";

// ---- (a) generator output byte-equals committed STATE.json ------------------

describe("STATE.json byte-equality", () => {
  it("generator output byte-equals committed STATE.json", () => {
    // SPEC-META-1: regenerate in memory and compare to the committed file
    const generated = serialiseState(generateState());
    const committed = readFileSync("STATE.json", "utf8");
    expect(generated).toBe(committed);
  });
});

// ---- (b) two in-process runs are byte-identical -----------------------------

describe("determinism", () => {
  it("two in-process runs produce byte-identical output", () => {
    // SPEC-META-1: generator must be deterministic (no Date.now / Math.random)
    const run1 = serialiseState(generateState());
    const run2 = serialiseState(generateState());
    expect(run1).toBe(run2);
  });
});

// ---- (c) fixture-based checkbox counting ------------------------------------

describe("checkbox counting in fixture plans", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mandate-gen-state-${process.pid}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("slice-1-style nested AC checkboxes — exactly {done: 0, total: 14}", () => {
    // SPEC-META-1: copy the real slice-1 checkbox lines (14 items, all unchecked).
    // Note: the fixture text embeds SPEC ids (SIM-3, SCEN-1, FOG-1, SIM-4, CRED-4,
    // COMM-1, COMM-2) as plain text in AC labels. The scanner will find those ids in
    // this test file and add test/gen-state.test.ts to their tests[] arrays in
    // STATE.json — this is expected and consistent with spec-trace semantics.
    const slice1CheckboxLines = `
# Slice 1

- [ ] **AC-1 (Pre-push readiness).** Before the first git push origin main:
  - [ ] package-lock.json at repo root, consistent with package.json.
  - [ ] LICENSE at repo root with MIT text + user copyright line.
  - [ ] docs/ralph-runbook.md exists.
  - [ ] docs/adr/0001-vertical-slice-1.md exists.
- [ ] **AC-2 (SPEC-SIM-3 calendar tick + bounded state history).** src/engine/clock.ts exports tick.
- [ ] **AC-3 (SPEC-SCEN-1 scenario loader + required-vars assertion).** schemas/scenario.schema.json.
- [ ] **AC-4 (SPEC-FOG-1 data fog).** src/engine/fog.ts exports observe.
- [ ] **AC-5 (SPEC-SIM-4 golden-replay harness).** test/replay.ts exports replay.
- [ ] **AC-6 (SPEC-CRED-4 de-anchoring spiral).** credibility counter increments.
- [ ] **AC-7a (SPEC-COMM-1 committee schema + content).** schemas/committee.schema.json.
- [ ] **AC-7b (SPEC-COMM-2 FOMC vote engine).** src/engine/fomc.ts exports vote.
- [ ] **AC-8 (CI green throughout).** For every PR ralph opens, CI jobs are green.
- [ ] **AC-9 (Sanity replay — human gate).** Committed snapshot the user eyeball-approves.
`.trimStart();

    writeFileSync(join(tmpDir, "slice-1.md"), slice1CheckboxLines);
    const slices = genSlices(tmpDir);
    expect(slices).toHaveLength(1);
    expect(slices[0].checkboxes).toEqual({ done: 0, total: 14 });
  });

  it("no-checkbox plan yields checkboxes: null", () => {
    // SPEC-META-1: a plan with zero checkbox lines gets null, never 0/0
    const noCheckboxPlan = `
# Slice 2

This is a plan with no checkboxes at all.

Some prose, some code blocks, but no task items.
`.trimStart();

    writeFileSync(join(tmpDir, "slice-2.md"), noCheckboxPlan);
    const slices = genSlices(tmpDir);
    expect(slices).toHaveLength(1);
    expect(slices[0].checkboxes).toBeNull();
  });

  it("Step-style plan (all checked) — exact pinned counts", () => {
    // SPEC-META-1: slice-3-style plan with all items checked
    const stepPlan = `
# Slice 3

## SPEC-X-1

- [x] **Step 1: Register the requirement**
- [x] **Step 2: Write the failing test**
- [x] **Step 3: Run the test, confirm it fails**
- [x] **Step 4: Implement**
- [x] **Step 5: Commit**

## SPEC-X-2

- [x] **Step 1: Register the requirement**
- [x] **Step 2: Write the test**
- [x] **Step 3: Run the test**
- [x] **Step 4: Run the full verifier**
- [x] **Step 5: Commit**
`.trimStart();

    writeFileSync(join(tmpDir, "slice-3.md"), stepPlan);
    const slices = genSlices(tmpDir);
    expect(slices).toHaveLength(1);
    expect(slices[0].checkboxes).toEqual({ done: 10, total: 10 });
  });

  it("mixed checked/unchecked plan produces correct done count", () => {
    // SPEC-META-1: confirm done is a strict subset of total
    const mixed = `
# Mixed

- [x] done item 1
- [ ] not done item 1
- [x] done item 2
- [ ] not done item 2
- [ ] not done item 3
`.trimStart();

    writeFileSync(join(tmpDir, "mixed.md"), mixed);
    const slices = genSlices(tmpDir);
    expect(slices).toHaveLength(1);
    expect(slices[0].checkboxes).toEqual({ done: 2, total: 5 });
  });
});

// ---- (d) state.manual.json checksum identical before/after generator --------

describe("state.manual.json is untouched by the generator", () => {
  it("state.manual.json content is unchanged before and after generateState()", () => {
    // SPEC-META-1: no generator ever writes state.manual.json
    const manualBefore = readFileSync("state.manual.json", "utf8");
    generateState(); // must not touch state.manual.json
    const manualAfter = readFileSync("state.manual.json", "utf8");
    expect(manualAfter).toBe(manualBefore);
  });
});

// ---- (e) invalid manual file (extra key) fails Ajv validation ---------------

describe("state.manual.json Ajv validation", () => {
  it("an invalid manual file (extra key) fails Ajv validation with an error", async () => {
    // SPEC-META-1: additionalProperties: false rejects unknown keys
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const schema = JSON.parse(readFileSync("schemas/state-manual.schema.json", "utf8"));
    const validate = ajv.compile(schema);

    const invalid = {
      activeSlice: "slice-4",
      gates: [],
      notes: "",
      parked: [],
      extraKey: "this should fail",
    };

    const ok = validate(invalid);
    expect(ok).toBe(false);
    expect(validate.errors).toBeTruthy();
    expect(validate.errors!.length).toBeGreaterThan(0);
  });

  it("the real state.manual.json passes Ajv validation", async () => {
    // SPEC-META-1: the committed file must always be valid
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const schema = JSON.parse(readFileSync("schemas/state-manual.schema.json", "utf8"));
    const validate = ajv.compile(schema);

    const manual = JSON.parse(readFileSync("state.manual.json", "utf8"));
    const ok = validate(manual);
    expect(ok).toBe(true);
  });

  it("missing required field (e.g. notes) fails Ajv validation", async () => {
    // SPEC-META-1: all four fields are required
    const { default: Ajv2020 } = await import("ajv/dist/2020");
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const schema = JSON.parse(readFileSync("schemas/state-manual.schema.json", "utf8"));
    const validate = ajv.compile(schema);

    const missing = { activeSlice: "slice-4", gates: [], parked: [] };
    const ok = validate(missing);
    expect(ok).toBe(false);
  });
});

// ---- helpers: title extraction ----------------------------------------------

describe("slice title extraction", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mandate-gen-state-title-${process.pid}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts the first H1 as title", () => {
    writeFileSync(
      join(tmpDir, "plan.md"),
      "# My Plan Title\n\nSome content\n\n## Section\n\n- [x] item\n"
    );
    const slices = genSlices(tmpDir);
    expect(slices[0].title).toBe("My Plan Title");
  });

  it("uses empty string when no H1 is present", () => {
    writeFileSync(join(tmpDir, "plan.md"), "## No H1 here\n\n- [x] item\n");
    const slices = genSlices(tmpDir);
    expect(slices[0].title).toBe("");
  });
});

// ---- helpers: content counting ----------------------------------------------

describe("content counting", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `mandate-gen-state-content-${process.pid}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts only JSON files in each subdirectory", () => {
    mkdirSync(join(tmpDir, "events"));
    mkdirSync(join(tmpDir, "tech"));
    writeFileSync(join(tmpDir, "events", "oil_shock.json"), "{}");
    writeFileSync(join(tmpDir, "events", "notes.md"), "");
    writeFileSync(join(tmpDir, "tech", "a.json"), "{}");
    writeFileSync(join(tmpDir, "tech", "b.json"), "{}");

    const counts = genContent(tmpDir);
    expect(counts["events"]).toBe(1);
    expect(counts["tech"]).toBe(2);
  });

  it("keys are sorted alphabetically", () => {
    mkdirSync(join(tmpDir, "z_last"));
    mkdirSync(join(tmpDir, "a_first"));
    writeFileSync(join(tmpDir, "z_last", "x.json"), "{}");
    writeFileSync(join(tmpDir, "a_first", "y.json"), "{}");

    const counts = genContent(tmpDir);
    const keys = Object.keys(counts);
    expect(keys).toEqual(["a_first", "z_last"]);
  });
});
