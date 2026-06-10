# MANDATE Slice 3 — Content Expansion + Deferred Tech Debt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship briefing/doctrine/hearing content for the 2008 and COVID scenarios, close the content-validation test gap, and pay down the two deferred Slice-2 debts (SPEC-CRED-5 params-to-content refactor, distribution-property tests for fog and shocks).

**Architecture:** Pure content-and-tests slice. One engine file changes (`src/engine/credibility.ts`, to load its numbers from content per SPEC-CRED-5); everything else is new JSON content validated by existing schemas, plus new tests. Every task follows the repo loop from CLAUDE.md: spec requirement first, failing test second, smallest implementation third.

**Tech Stack:** TypeScript (ESM), vitest, Ajv-backed `loadValidated`/`loadValidatedFile` content loaders, JSON Schema 2020-12.

**Process contract (controller, not implementer):**
- One task = one SPEC = one PR, titled `SPEC-XXX-N: <short description>` (CLAUDE.md).
- Tasks run **sequentially**; a task's PR must merge before the next task starts (Tasks 3 and 4 both touch `content/localization/en.json`; serial execution is the conflict-avoidance rule from `docs/ralph-runbook.md`).
- Verifier: `npm run check` (typecheck + validate + spec:trace + test) green before every PR.
- Budgets per `docs/ralph-runbook.md`: 3 self-fix cycles per `npm run check` failure; 3 `REQUEST_CHANGES` rounds per PR, then STUCK-escalate and park.
- Each PR includes its checkbox updates to this plan file.
- New SPEC ids used here (verified non-colliding against `spec/requirements.md`): SPEC-CRED-5, SPEC-CONTENT-4, SPEC-BRIEF-3, SPEC-DOCT-3, SPEC-HEAR-2, SPEC-SHOCK-2, SPEC-FOG-2. All match the spec-trace regex `/\bSPEC-[A-Z]+-\d+\b/g`.

---

### Task 1: SPEC-CRED-5 — credibility bounds + meeting-outcome weights move to content

Slice 2 deferred this. `src/engine/credibility.ts` hardcodes `CRED_MIN = 0`, `CRED_MAX = 100`, a `-5` surprise penalty, and a `+3` on-target gain. Per the "no content in engine code" rule these numbers belong in `content/engine/credibility.json`. Follow the module-level-load pattern from `src/engine/fog.ts` so no function signature changes and `dynamics.ts` (which imports `CRED_MIN`/`CRED_MAX`) is untouched.

**Files:**
- Modify: `spec/requirements.md` (Credibility section — insert after the SPEC-CRED-6 entry)
- Modify: `content/engine/credibility.json`
- Modify: `schemas/credibility.schema.json`
- Modify: `src/engine/credibility.ts`
- Test: `test/credibility.test.ts` (add to existing file)

- [x] **Step 1: Register the requirement in spec/requirements.md**

Insert in the Credibility section, after the existing `SPEC-CRED-6` bullet:

```markdown
- **SPEC-CRED-5** `[testable]` Credibility bounds and meeting-outcome weights are content, not code: `cred_min`, `cred_max`, `surprise_penalty`, and `on_target_gain` live in `content/engine/credibility.json` (schema-governed by `schemas/credibility.schema.json`). `src/engine/credibility.ts` loads them through the validated content loader; the exported `CRED_MIN`/`CRED_MAX` constants and `applyMeetingOutcome` (which subtracts `surprise_penalty` when `surprisedMarkets` and adds `on_target_gain` when `onTarget`) take their values from that file, with no hardcoded copies in engine code. Tests assert the engine's observed deltas and bounds equal the content-file values.
```

- [x] **Step 2: Write the failing test**

Append to `test/credibility.test.ts`:

```typescript
import { readFileSync } from "node:fs";

// SPEC-CRED-5: bounds and meeting-outcome weights come from content/engine/credibility.json,
// not from literals in engine code. These assertions read the content file and require the
// engine's behavior to match it, so editing the JSON is sufficient to retune the mechanic.
describe("SPEC-CRED-5: weights and bounds are content-driven", () => {
  const raw = JSON.parse(
    readFileSync("content/engine/credibility.json", "utf8"),
  ) as { cred_min: number; cred_max: number; surprise_penalty: number; on_target_gain: number };

  it("content file declares the four params", () => {
    expect(raw.cred_min).toBeTypeOf("number");
    expect(raw.cred_max).toBeTypeOf("number");
    expect(raw.surprise_penalty).toBeTypeOf("number");
    expect(raw.on_target_gain).toBeTypeOf("number");
  });

  it("exported bounds equal the content values", () => {
    expect(CRED_MIN).toBe(raw.cred_min);
    expect(CRED_MAX).toBe(raw.cred_max);
  });

  it("applyMeetingOutcome deltas equal the content values", () => {
    const mid = (raw.cred_min + raw.cred_max) / 2;
    expect(applyMeetingOutcome(mid, { surprisedMarkets: true, onTarget: false }))
      .toBe(mid - raw.surprise_penalty);
    expect(applyMeetingOutcome(mid, { surprisedMarkets: false, onTarget: true }))
      .toBe(mid + raw.on_target_gain);
  });
});
```

Reuse the file's existing imports of `CRED_MIN`, `CRED_MAX`, `applyMeetingOutcome` (add any that are missing to the import from `../src/engine/credibility`).

- [x] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run test/credibility.test.ts`
Expected: FAIL — `raw.cred_min` is `undefined` (content file doesn't declare the params yet).

- [x] **Step 4: Add the params to content and schema**

`content/engine/credibility.json` — add four keys (keep existing seven):

```json
{
  "target_inflation": 0.02,
  "unemployment_target": 0.055,
  "expectations_adaptivity": 0.051,
  "expectations_anchor_pull": 0.025,
  "credibility_mission_gain": 300,
  "credibility_unemployment_weight": 0.5,
  "anchor_threshold": 60,
  "cred_min": 0,
  "cred_max": 100,
  "surprise_penalty": 5,
  "on_target_gain": 3
}
```

`schemas/credibility.schema.json` — append `"cred_min"`, `"cred_max"`, `"surprise_penalty"`, `"on_target_gain"` to the `required` array, and add to `properties` (the schema has `additionalProperties: false`, so this is mandatory):

```json
"cred_min": {
  "type": "number",
  "description": "SPEC-CRED-5: lower bound of the credibility score."
},
"cred_max": {
  "type": "number",
  "description": "SPEC-CRED-5: upper bound of the credibility score."
},
"surprise_penalty": {
  "type": "number",
  "minimum": 0,
  "description": "SPEC-CRED-5: credibility lost when a decision diverges from prior forward guidance (SPEC-CRED-1)."
},
"on_target_gain": {
  "type": "number",
  "minimum": 0,
  "description": "SPEC-CRED-5: credibility gained when the mandate is satisfied within tolerance at a meeting (SPEC-CRED-1)."
}
```

Also update the schema's top-level `description` to mention SPEC-CRED-5.

- [x] **Step 5: Rewrite src/engine/credibility.ts to load from content**

Replace the constants and `applyMeetingOutcome` body; keep every export name and signature identical:

```typescript
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

// The credibility/expectations core: never spent, only earned or lost; both the score and the effectiveness multiplier.

// SPEC-CRED-5: bounds and meeting-outcome weights are content, not code.
// cwd-safe path resolution — mirrors src/engine/fog.ts.
interface CredibilityMeetingParams {
  cred_min: number;
  cred_max: number;
  surprise_penalty: number;
  on_target_gain: number;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/credibility.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/credibility.json");

const params = loadValidatedFile<CredibilityMeetingParams>(SCHEMA_PATH, FILE_PATH);

export const CRED_MIN = params.cred_min;
export const CRED_MAX = params.cred_max;

export function clampCredibility(v: number): number {
  return Math.max(CRED_MIN, Math.min(CRED_MAX, v));
}

export interface MeetingOutcome {
  /** True if the decision diverged from prior forward guidance. */
  surprisedMarkets: boolean;
  /** True if the mandate is currently satisfied within tolerance. */
  onTarget: boolean;
}

// SPEC-CRED-1: market surprises erode credibility; on-target outcomes build it. Committee
// dissents do NOT affect credibility — FOMC dissents are not published in a way that damages
// the Chair's standing, and the continuous mission-tied channel (SPEC-CRED-6) is where economic
// outcomes move credibility. Consensus-building costs are a separate, future mechanic (issue #33).
// SPEC-CRED-5: the weights live in content/engine/credibility.json.
export function applyMeetingOutcome(credibility: number, o: MeetingOutcome): number {
  let next = credibility;
  if (o.surprisedMarkets) next -= params.surprise_penalty;
  if (o.onTarget) next += params.on_target_gain;
  return clampCredibility(next);
}
```

Keep `expectationsAnchored`, `painMultiplier`, and `getCredibility` exactly as they are (painMultiplier's `/50` is SPEC-CRED-3 territory, out of scope here).

- [x] **Step 6: Run the full verifier**

Run: `npm run check`
Expected: all four steps green (typecheck, validate, spec:trace, test). If `npm run validate` fails on credibility.json, the schema and content edits in Step 4 are out of sync — fix there, max 3 self-fix cycles.

- [x] **Step 7: Commit**

```bash
git add spec/requirements.md content/engine/credibility.json schemas/credibility.schema.json src/engine/credibility.ts test/credibility.test.ts
git commit -m "SPEC-CRED-5: move credibility bounds + meeting-outcome weights to content"
```

---

### Task 2: SPEC-CONTENT-4 — content validation covers every shipped content directory

`test/content.test.ts` only validates `content/events` and `content/tech`. Scenarios, doctrines, briefings, and hearings ship today but nothing in the test suite walks their directories. (They are covered by `npm run validate`, but the SPEC-CONTENT-1 test is the documented backstop and should match reality.)

**Files:**
- Modify: `spec/requirements.md` (Content section — insert after the SPEC-CONTENT-3 entry)
- Test/Modify: `test/content.test.ts`

- [x] **Step 1: Register the requirement**

Insert after the `SPEC-CONTENT-3` bullet:

```markdown
- **SPEC-CONTENT-4** `[testable]` The shipped-content validation test covers every content directory, not just events and tech: `test/content.test.ts` loads `content/scenarios` against `schemas/scenario.schema.json`, `content/doctrines` against `schemas/doctrine.schema.json`, `content/briefings` against `schemas/briefing.schema.json`, and `content/hearings` against `schemas/hearing.schema.json` via `loadValidated`, asserting each directory yields at least one validated file.
```

- [x] **Step 2: Extend the test**

Append inside the existing `describe("shipped content validates against schema", ...)` block in `test/content.test.ts`:

```typescript
  // SPEC-CONTENT-4: the backstop covers all shipped content types, not just events/tech.
  it("scenarios", () => {
    const scenarios = loadValidated("schemas/scenario.schema.json", "content/scenarios");
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
  });
  it("doctrines", () => {
    const doctrines = loadValidated("schemas/doctrine.schema.json", "content/doctrines");
    expect(doctrines.length).toBeGreaterThanOrEqual(2);
  });
  it("briefings", () => {
    const briefings = loadValidated("schemas/briefing.schema.json", "content/briefings");
    expect(briefings.length).toBeGreaterThanOrEqual(1);
  });
  it("hearings", () => {
    const hearings = loadValidated("schemas/hearing.schema.json", "content/hearings");
    expect(hearings.length).toBeGreaterThanOrEqual(1);
  });
```

- [x] **Step 3: Run the test**

Run: `npx vitest run test/content.test.ts`
Expected: PASS immediately — the content already validates; the test IS the deliverable here (it pins the invariant). This is a test-only requirement, so the usual red step doesn't apply; confirm instead that each new `it` actually executed (5+ tests reported).

- [x] **Step 4: Run the full verifier**

Run: `npm run check`
Expected: green, and `spec:trace` finds the `// SPEC-CONTENT-4` comment.

- [x] **Step 5: Commit**

```bash
git add spec/requirements.md test/content.test.ts
git commit -m "SPEC-CONTENT-4: validate scenarios, doctrines, briefings, hearings in content test"
```

---

### Task 3: SPEC-BRIEF-3 — staff briefings for the 2008 and COVID scenarios

Only `brief.1979_q3_stagflation` exists. The 2008 and COVID scenarios (already shipped in `content/scenarios/`) need briefings so a hearing-selected start has staff forecasts. Both are demand-collapse regimes, so unlike 1979, the **raise** path forecasts *lower* inflation and *higher* unemployment than the **lower** path.

**Files:**
- Modify: `spec/requirements.md` (Briefings section — insert after the SPEC-BRIEF-2 entry)
- Create: `content/briefings/2008_q4_crisis.json`
- Create: `content/briefings/2020_q1_pandemic.json`
- Modify: `content/localization/en.json`
- Test: `test/briefings-content.test.ts` (new file)

- [ ] **Step 1: Register the requirement**

Insert after the `SPEC-BRIEF-2` bullet:

```markdown
- **SPEC-BRIEF-3** `[testable]` Each authored starting scenario beyond 1979 ships with a staff briefing: `content/briefings/2008_q4_crisis.json` and `content/briefings/2020_q1_pandemic.json` validate against `schemas/briefing.schema.json`, load via `loadBriefing`, and every localization key they reference resolves in `content/localization/en.json`. Forecasts are internally consistent with each scenario's demand-collapse regime: the raise scenario forecasts strictly lower `inflation_outlook` and strictly higher `unemployment_outlook` than the lower scenario. No real person names appear.
```

- [ ] **Step 2: Write the failing test**

Create `test/briefings-content.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadBriefing } from "../src/content/briefings";

// SPEC-BRIEF-3: the 2008 and COVID scenarios ship with staff briefings whose forecasts
// reflect a demand collapse (tightening lowers the inflation outlook and raises the
// unemployment outlook relative to easing), and whose loc keys all resolve.
describe("SPEC-BRIEF-3: crisis-scenario briefings", () => {
  const locale = JSON.parse(
    readFileSync("content/localization/en.json", "utf8"),
  ) as Record<string, string>;

  for (const id of ["brief.2008_q4_crisis", "brief.2020_q1_pandemic"]) {
    describe(id, () => {
      it("loads via loadBriefing", () => {
        const b = loadBriefing(id);
        expect(b.id).toBe(id);
        expect(b.scenarios).toHaveLength(3);
      });

      it("raise forecasts lower inflation and higher unemployment than lower", () => {
        const b = loadBriefing(id);
        const raise = b.scenarios.find((s) => s.scenario_type === "raise")!;
        const lower = b.scenarios.find((s) => s.scenario_type === "lower")!;
        expect(raise.forecast.inflation_outlook).toBeLessThan(lower.forecast.inflation_outlook);
        expect(raise.forecast.unemployment_outlook).toBeGreaterThan(lower.forecast.unemployment_outlook);
      });

      it("all localization keys resolve", () => {
        const b = loadBriefing(id);
        for (const key of [b.name, b.desc, ...b.scenarios.map((s) => s.name)]) {
          expect(locale[key], `missing en.json key: ${key}`).toBeTypeOf("string");
        }
      });
    });
  }
});
```

(Adjust property access to the actual `Briefing` type exported by `src/content/briefings.ts` if field names differ — check that file before running.)

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run test/briefings-content.test.ts`
Expected: FAIL — `loadBriefing("brief.2008_q4_crisis")` throws (file not found).

- [ ] **Step 4: Author the briefing content**

Create `content/briefings/2008_q4_crisis.json`:

```json
{
  "id": "brief.2008_q4_crisis",
  "name": "brief.2008_q4_crisis.name",
  "desc": "brief.2008_q4_crisis.desc",
  "scenarios": [
    {
      "scenario_type": "raise",
      "name": "brief.2008_q4_crisis.raise.name",
      "forecast": {
        "inflation_outlook": 0.025,
        "unemployment_outlook": 0.085,
        "growth_outlook": -0.035
      }
    },
    {
      "scenario_type": "hold",
      "name": "brief.2008_q4_crisis.hold.name",
      "forecast": {
        "inflation_outlook": 0.032,
        "unemployment_outlook": 0.078,
        "growth_outlook": -0.025
      }
    },
    {
      "scenario_type": "lower",
      "name": "brief.2008_q4_crisis.lower.name",
      "forecast": {
        "inflation_outlook": 0.04,
        "unemployment_outlook": 0.07,
        "growth_outlook": -0.015
      }
    }
  ]
}
```

Create `content/briefings/2020_q1_pandemic.json`:

```json
{
  "id": "brief.2020_q1_pandemic",
  "name": "brief.2020_q1_pandemic.name",
  "desc": "brief.2020_q1_pandemic.desc",
  "scenarios": [
    {
      "scenario_type": "raise",
      "name": "brief.2020_q1_pandemic.raise.name",
      "forecast": {
        "inflation_outlook": 0.012,
        "unemployment_outlook": 0.13,
        "growth_outlook": -0.09
      }
    },
    {
      "scenario_type": "hold",
      "name": "brief.2020_q1_pandemic.hold.name",
      "forecast": {
        "inflation_outlook": 0.015,
        "unemployment_outlook": 0.115,
        "growth_outlook": -0.07
      }
    },
    {
      "scenario_type": "lower",
      "name": "brief.2020_q1_pandemic.lower.name",
      "forecast": {
        "inflation_outlook": 0.019,
        "unemployment_outlook": 0.095,
        "growth_outlook": -0.05
      }
    }
  ]
}
```

- [ ] **Step 5: Add localization entries**

Add to `content/localization/en.json` (alongside the existing `brief.1979_q3_stagflation.*` keys):

```json
"brief.2008_q4_crisis.name": "Q4 2008 Staff Economic Briefing",
"brief.2008_q4_crisis.desc": "Staff outlook under three policy scenarios as credit markets seize. A deflationary demand collapse is the dominant near-term risk; the toolkit is untested at the zero lower bound.",
"brief.2008_q4_crisis.raise.name": "Raise — Lean Against Inflation",
"brief.2008_q4_crisis.hold.name": "Hold — Current Stance",
"brief.2008_q4_crisis.lower.name": "Lower — Emergency Easing",
"brief.2020_q1_pandemic.name": "Q1 2020 Staff Economic Briefing",
"brief.2020_q1_pandemic.desc": "Staff outlook under three policy scenarios as the pandemic halts activity. Simultaneous demand and supply disruption; unemployment is projected to spike at unprecedented speed.",
"brief.2020_q1_pandemic.raise.name": "Raise — Preempt Supply Inflation",
"brief.2020_q1_pandemic.hold.name": "Hold — Assess Incoming Data",
"brief.2020_q1_pandemic.lower.name": "Lower — Cut to the Floor"
```

- [ ] **Step 6: Run the test, then the full verifier**

Run: `npx vitest run test/briefings-content.test.ts` → PASS.
Run: `npm run check` → green (validate covers the new briefing files against the schema).

- [ ] **Step 7: Commit**

```bash
git add spec/requirements.md content/briefings/2008_q4_crisis.json content/briefings/2020_q1_pandemic.json content/localization/en.json test/briefings-content.test.ts
git commit -m "SPEC-BRIEF-3: staff briefings for 2008 GFC and COVID scenarios"
```

---

### Task 4: SPEC-DOCT-3 — third adoptable doctrine (gradualism)

The doctrine catalog has two entries (`dot_plot`, `inflation_targeting`). Add `doctrine.gradualism` — a pure-content doctrine using only schema-supported fields (`standing_effects` + `flip_flop_cost`, no `meeting_hook`), exercising the catalog with a doctrine that has no bespoke engine code.

**Files:**
- Modify: `spec/requirements.md` (Doctrine section — insert after the SPEC-DOCT-2 entry)
- Create: `content/doctrines/gradualism.json`
- Modify: `content/localization/en.json`
- Test: `test/doctrines-content.test.ts` (new file; if a doctrine content test file already exists, append there instead)

- [ ] **Step 1: Register the requirement**

Insert after the `SPEC-DOCT-2` bullet:

```markdown
- **SPEC-DOCT-3** `[testable]` A third adoptable doctrine ships as pure content: `content/doctrines/gradualism.json` validates against `schemas/doctrine.schema.json`, uses only generic schema fields (standing effects + flip-flop cost, no meeting hook, no bespoke engine code), appears in `loadDoctrineCatalog()`, resolves via `getDoctrine("doctrine.gradualism")`, and its localization keys resolve in `content/localization/en.json`.
```

- [ ] **Step 2: Write the failing test**

Create `test/doctrines-content.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDoctrineCatalog, getDoctrine } from "../src/content/doctrines";

// SPEC-DOCT-3: the catalog carries a third, purely-generic doctrine (no meeting hook),
// proving doctrines can ship as content without engine changes.
describe("SPEC-DOCT-3: gradualism doctrine", () => {
  it("is in the catalog", () => {
    const catalog = loadDoctrineCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    expect(catalog.map((d) => d.id)).toContain("doctrine.gradualism");
  });

  it("resolves with generic fields only", () => {
    const d = getDoctrine("doctrine.gradualism");
    expect(d.flip_flop_cost).toBeGreaterThan(0);
    expect(d.meeting_hook).toBeUndefined();
    expect(d.standing_effects?.length).toBeGreaterThan(0);
  });

  it("localization keys resolve", () => {
    const locale = JSON.parse(
      readFileSync("content/localization/en.json", "utf8"),
    ) as Record<string, string>;
    const d = getDoctrine("doctrine.gradualism");
    expect(locale[d.name]).toBeTypeOf("string");
    expect(locale[d.description]).toBeTypeOf("string");
  });
});
```

(Match the actual exported API of `src/content/doctrines.ts` — check whether `getDoctrine` throws or returns undefined for unknown ids, and adjust.)

- [ ] **Step 3: Run the test, confirm it fails**

Run: `npx vitest run test/doctrines-content.test.ts`
Expected: FAIL — catalog has 2 entries, `doctrine.gradualism` missing.

- [ ] **Step 4: Author the doctrine + localization**

Create `content/doctrines/gradualism.json`:

```json
{
  "id": "doctrine.gradualism",
  "name": "doctrine.gradualism.name",
  "description": "doctrine.gradualism.desc",
  "standing_effects": [
    { "target": "credibility", "value": 2 }
  ],
  "flip_flop_cost": 8
}
```

Add to `content/localization/en.json` (alongside the existing `doctrine.*` keys):

```json
"doctrine.gradualism.name": "Gradualism",
"doctrine.gradualism.desc": "Commit to moving the policy rate in small, well-telegraphed steps. Markets reward the predictability with a standing credibility bonus — but abandoning the commitment mid-cycle is costly."
```

- [ ] **Step 5: Run the test, then the full verifier**

Run: `npx vitest run test/doctrines-content.test.ts` → PASS.
Run: `npm run check` → green.

- [ ] **Step 6: Commit**

```bash
git add spec/requirements.md content/doctrines/gradualism.json content/localization/en.json test/doctrines-content.test.ts
git commit -m "SPEC-DOCT-3: gradualism doctrine (pure content, no engine hook)"
```

---

### Task 5: SPEC-HEAR-2 — hearing ↔ scenario cross-content integrity test

The confirmation hearing's `scenario_weights` already reference all three scenarios, but nothing enforces that: a typo'd scenario id in a weight, or a new scenario unreachable from any answer, would ship silently. Test-only task.

**Files:**
- Modify: `spec/requirements.md` (Confirmation hearing section — insert after the SPEC-HEAR-1 entry)
- Test: `test/hearing-content.test.ts` (new file; if hearing content tests already live elsewhere, append there)

- [ ] **Step 1: Register the requirement**

Insert after the `SPEC-HEAR-1` bullet:

```markdown
- **SPEC-HEAR-2** `[testable]` Hearing/scenario cross-content integrity: every scenario id referenced in any hearing answer's `scenario_weights` corresponds to a shipped file in `content/scenarios/`, and each of the three authored starting scenarios (`scen.1979_stagflation`, `scen.2008_gfc`, `scen.covid_2020`) is reachable — i.e. appears with a positive weight in at least one answer of `content/hearings/confirmation.json`. Enforced by test so a renamed or added scenario cannot silently break hearing resolution.
```

- [ ] **Step 2: Write the test**

Create `test/hearing-content.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// SPEC-HEAR-2: scenario_weights must point at shipped scenarios, and every authored
// starting scenario must be reachable from at least one hearing answer.
describe("SPEC-HEAR-2: hearing/scenario cross-content integrity", () => {
  const hearing = JSON.parse(
    readFileSync("content/hearings/confirmation.json", "utf8"),
  ) as {
    questions: { answers: { id: string; scenario_weights?: Record<string, number> }[] }[];
  };

  const shippedIds = new Set(
    readdirSync("content/scenarios")
      .filter((f) => f.endsWith(".json"))
      .map((f) => (JSON.parse(readFileSync(join("content/scenarios", f), "utf8")) as { id: string }).id),
  );

  const weightedIds = new Set<string>();
  for (const q of hearing.questions) {
    for (const a of q.answers) {
      for (const [scen, w] of Object.entries(a.scenario_weights ?? {})) {
        if (w > 0) weightedIds.add(scen);
      }
    }
  }

  it("every weighted scenario id is a shipped scenario", () => {
    for (const id of weightedIds) {
      expect(shippedIds.has(id), `hearing references unknown scenario: ${id}`).toBe(true);
    }
  });

  it("each authored starting scenario is reachable from some answer", () => {
    for (const id of ["scen.1979_stagflation", "scen.2008_gfc", "scen.covid_2020"]) {
      expect(weightedIds.has(id), `scenario unreachable from hearing: ${id}`).toBe(true);
    }
  });
});
```

(Note: the reachability list is deliberately the three authored scenarios, not "every file in the directory" — `content/scenarios/recovery_test.json` is a test fixture and must not be required to be reachable.)

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/hearing-content.test.ts`
Expected: PASS (current content is already consistent — the test pins the invariant; like Task 2, the test is the deliverable).

- [ ] **Step 4: Run the full verifier**

Run: `npm run check` → green.

- [ ] **Step 5: Commit**

```bash
git add spec/requirements.md test/hearing-content.test.ts
git commit -m "SPEC-HEAR-2: hearing/scenario cross-content integrity test"
```

---

### Task 6: SPEC-SHOCK-2 — distribution-property test for supply shocks

Slice 2 deferred this: `test/shocks.test.ts` proves shocks vary and are deterministic, but never that they're actually distributed N(0, σ). Pin mean, standard deviation, and the 2σ coverage band over a large seeded sample. Test-only task (no `src/` change expected — if the assertions fail, that's a real engine bug to escalate, not a tolerance to widen).

**Files:**
- Modify: `spec/requirements.md` (insert after the SPEC-SHOCK-1 entry)
- Test: `test/shocks.test.ts` (append)

- [ ] **Step 1: Register the requirement**

Insert after the `SPEC-SHOCK-1` bullet:

```markdown
- **SPEC-SHOCK-2** `[testable]` Supply shocks are distributionally correct, not merely non-constant: over a single seeded RNG stream of at least 2,000 `applySupplyShock` draws (with base inflation far above 0 so the floor never binds), the sample mean of the shock is within 3 standard errors of 0, the sample standard deviation is within ±10% of `supply_shock_sigma`, and the fraction of draws within 2σ of 0 lies in [0.93, 0.985] (normal coverage ≈ 0.954).
```

- [ ] **Step 2: Write the test**

Append to `test/shocks.test.ts`, reusing the file's existing state-construction helper (it already builds a minimal `GameState` for the SPEC-SHOCK-1 tests — use the same one):

```typescript
// SPEC-SHOCK-2: the shock is N(0, sigma) in distribution, not just "some noise".
// One seeded stream, many draws; base inflation 0.5 keeps the max(0, ...) clamp inert.
describe("SPEC-SHOCK-2: shock distribution properties", () => {
  it("mean ≈ 0, std ≈ sigma, ~95% of draws within 2σ", () => {
    const sigma = 0.01;
    const N = 2000;
    const base = 0.5;
    const state = makeState({ inflation: base });
    const rng = mulberry32(424242);

    const shocks: number[] = [];
    for (let i = 0; i < N; i++) {
      const next = applySupplyShock(state, rng, { supply_shock_sigma: sigma });
      shocks.push(next.vars.inflation! - base);
    }

    const mean = shocks.reduce((a, b) => a + b, 0) / N;
    const variance = shocks.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
    const std = Math.sqrt(variance);
    const within2Sigma = shocks.filter((s) => Math.abs(s) <= 2 * sigma).length / N;

    // standard error of the mean is sigma/sqrt(N); 3 SEs is a deterministic-seed-safe bound
    expect(Math.abs(mean)).toBeLessThan((3 * sigma) / Math.sqrt(N));
    expect(std).toBeGreaterThan(sigma * 0.9);
    expect(std).toBeLessThan(sigma * 1.1);
    expect(within2Sigma).toBeGreaterThan(0.93);
    expect(within2Sigma).toBeLessThan(0.985);
    // the clamp must never have fired, or the distribution is censored
    expect(Math.min(...shocks)).toBeGreaterThan(-base);
  });
});
```

(`makeState` here stands for whatever helper `test/shocks.test.ts` already uses to build a `GameState` with a given inflation — match its actual name and shape. `mulberry32` and `applySupplyShock` are already imported in that file.)

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/shocks.test.ts`
Expected: PASS with the fixed seed 424242. If an assertion fails, do NOT widen tolerances — first check whether the failure is statistical bad luck (try seeds 7, 1337: if most seeds pass, pick one passing seed and note why in a comment) or a genuine Box-Muller defect (most seeds fail → escalate as a bug).

- [ ] **Step 4: Run the full verifier**

Run: `npm run check` → green.

- [ ] **Step 5: Commit**

```bash
git add spec/requirements.md test/shocks.test.ts
git commit -m "SPEC-SHOCK-2: distribution-property test for supply shocks"
```

---

### Task 7: SPEC-FOG-2 — distribution-property test for fog noise

Same deferred debt as Task 6, for `observe()`. Fog params come from `content/engine/fog.json` (module-level load, not injectable), so the test reads that file and exercises a series with `noise_scale > 0`. Currently `inflation` has `noise_scale 0.002, lag_months 1` — the test derives both values from the file rather than hardcoding, so retuning fog content can't break it.

**Files:**
- Modify: `spec/requirements.md` (insert after the SPEC-FOG-1 entry)
- Test: `test/fog.test.ts` (append)

- [ ] **Step 1: Register the requirement**

Insert after the `SPEC-FOG-1` bullet:

```markdown
- **SPEC-FOG-2** `[testable]` Fog noise is distributionally correct: for a series whose `content/engine/fog.json` entry has `noise_scale > 0`, at least 2,000 `observe()` draws over a single seeded RNG stream (fixed state and history) have a sample mean within 3 standard errors of the lagged truth and a sample standard deviation within ±10% of the configured `noise_scale`. The test reads the configured `noise_scale`/`lag_months` from the content file rather than hardcoding them.
```

- [ ] **Step 2: Write the test**

Append to `test/fog.test.ts`, reusing that file's existing state/history construction helpers and imports:

```typescript
import { readFileSync } from "node:fs";

// SPEC-FOG-2: observe() noise is N(truth, noise_scale) in distribution. Params are read
// from content/engine/fog.json so retuning fog content cannot silently break this test.
describe("SPEC-FOG-2: fog noise distribution properties", () => {
  it("mean ≈ lagged truth, std ≈ noise_scale for the inflation series", () => {
    const fogParams = JSON.parse(readFileSync("content/engine/fog.json", "utf8")) as
      Record<string, { noise_scale: number; lag_months: number }>;
    const { noise_scale, lag_months } = fogParams["inflation"]!;
    expect(noise_scale).toBeGreaterThan(0); // precondition: series must be noisy for this test

    const truth = 0.08;
    // Build a state whose lagged inflation (per lag_months) equals `truth`,
    // using the same state/history construction this file already uses for the
    // SPEC-FOG-1 lag tests: history[lag_months - 1].vars.inflation = truth
    // (or state.vars.inflation = truth when lag_months === 0).
    const state = makeStateWithHistory(truth, lag_months);

    const N = 2000;
    const rng = mulberry32(99001122);
    const draws: number[] = [];
    for (let i = 0; i < N; i++) {
      draws.push(observe(state, "inflation", rng));
    }

    const mean = draws.reduce((a, b) => a + b, 0) / N;
    const variance = draws.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
    const std = Math.sqrt(variance);

    expect(Math.abs(mean - truth)).toBeLessThan((3 * noise_scale) / Math.sqrt(N));
    expect(std).toBeGreaterThan(noise_scale * 0.9);
    expect(std).toBeLessThan(noise_scale * 1.1);
  });
});
```

`makeStateWithHistory(truth, lag_months)` stands for the construction pattern already present in `test/fog.test.ts`'s lag tests — extract or inline it to produce a `GameState` where the value `observe` reads (current var for lag 0, `history[lag_months - 1]` otherwise) equals `truth`. All series the state carries must include whatever `state.vars`/history entries the existing tests provide.

- [ ] **Step 3: Run the test**

Run: `npx vitest run test/fog.test.ts`
Expected: PASS with the fixed seed. Same statistical-failure protocol as Task 6 Step 3: try alternate seeds before suspecting the engine; never widen tolerances silently.

- [ ] **Step 4: Run the full verifier**

Run: `npm run check` → green.

- [ ] **Step 5: Commit**

```bash
git add spec/requirements.md test/fog.test.ts
git commit -m "SPEC-FOG-2: distribution-property test for fog noise"
```

---

## Completion

All seven tasks merged to main with `npm run check` green ⇒ Slice 3 is complete. Post a summary on a tracking issue (list the seven PRs), then stop — per `docs/ralph-runbook.md`, the next slice begins with a fresh interview + plan.
