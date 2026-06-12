import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SPEC-META-3

import {
  plan,
  type StateJson,
  type ManualJson,
  type LiveSnapshot,
} from "../tools/routine-dryrun.js";

// Helper: load a fixture set from test/fixtures/routine/<name>/
function loadFixture(name: string): {
  state: StateJson;
  manual: ManualJson;
  live: LiveSnapshot;
} {
  const base = join("test", "fixtures", "routine", name);
  const live = JSON.parse(readFileSync(join(base, "live.json"), "utf8")) as LiveSnapshot;

  let manual: ManualJson = { activeSlice: "slice-4", gates: [], parked: [], notes: "" };
  try {
    manual = JSON.parse(readFileSync(join(base, "manual.json"), "utf8")) as ManualJson;
  } catch {
    // use default empty-gates manual
  }

  const state: StateJson = {};
  return { state, manual, live };
}

// ---- fixture: queue-with-issues ---------------------------------------------

describe("queue-with-issues fixture", () => {
  it("picks the oldest issue (lower number wins tiebreak) and returns drain_issue", () => {
    // SPEC-META-3: drain_issue for oldest by createdAt; tiebreak lowest number
    const { state, manual, live } = loadFixture("queue-with-issues");
    const result = plan(state, manual, live);

    // Two issues: #10 created 2026-05-01, #7 created 2026-04-15
    // Issue #7 is oldest by createdAt — it should be selected.
    expect(result.actions).toEqual([
      {
        kind: "drain_issue",
        ref: 7,
        detail:
          "implement issue #7 per docs/agent-task-workflow.md, one unit of work per fire",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  it("trace mentions both issues and explains skip of the newer one", () => {
    // SPEC-META-3: trace must explain every decision including skipped items
    const { state, manual, live } = loadFixture("queue-with-issues");
    const result = plan(state, manual, live);
    const traceText = result.trace.join("\n");
    expect(traceText).toMatch(/#7/);
    expect(traceText).toMatch(/#10/);
  });
});

// ---- fixture: pr-approved ---------------------------------------------------

describe("pr-approved fixture", () => {
  it("returns merge_pr for a green+APPROVE PR", () => {
    // SPEC-META-3: checksGreen && reviewVerdict APPROVE → merge_pr
    const { state, manual, live } = loadFixture("pr-approved");
    const result = plan(state, manual, live);

    expect(result.actions).toEqual([
      {
        kind: "merge_pr",
        ref: 42,
        detail: "merge PR #42 — checks green and reviewer approved",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ---- fixture: pr-request-changes-r1 -----------------------------------------

describe("pr-request-changes-r1 fixture", () => {
  it("returns fix_pr round 1 of 3 when fixRounds === 0", () => {
    // SPEC-META-3: REQUEST_CHANGES + fixRounds 0 → fix_pr round 1 of 3
    const { state, manual, live } = loadFixture("pr-request-changes-r1");
    const result = plan(state, manual, live);

    expect(result.actions).toEqual([
      {
        kind: "fix_pr",
        ref: 55,
        detail: "fix PR #55 per reviewer feedback (round 1 of 3)",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ---- round-3 boundary: both sides pinned ------------------------------------

describe("round-3 boundary", () => {
  it("fixRounds === 2 → fix_pr round 3 of 3 (boundary: still fixable)", () => {
    // SPEC-META-3: fixRounds 2 → fix_pr round 3 of 3 (last fix attempt before STUCK)
    const state: StateJson = {};
    const manual: ManualJson = { activeSlice: "slice-4", gates: [], parked: [], notes: "" };
    const live: LiveSnapshot = {
      agentTaskIssues: [],
      openPRs: [
        {
          number: 99,
          title: "SPEC-TEST-1: boundary test",
          headRef: "spec/boundary",
          checksGreen: true,
          reviewVerdict: "REQUEST_CHANGES",
          fixRounds: 2,
        },
      ],
    };
    const result = plan(state, manual, live);
    expect(result.actions).toEqual([
      {
        kind: "fix_pr",
        ref: 99,
        detail: "fix PR #99 per reviewer feedback (round 3 of 3)",
      },
    ]);
  });

  it("fixRounds === 3 → stuck_pr (boundary: exhausted, park)", () => {
    // SPEC-META-3: fixRounds 3 → stuck_pr — 3-round budget exhausted
    const state: StateJson = {};
    const manual: ManualJson = { activeSlice: "slice-4", gates: [], parked: [], notes: "" };
    const live: LiveSnapshot = {
      agentTaskIssues: [],
      openPRs: [
        {
          number: 99,
          title: "SPEC-TEST-1: boundary test",
          headRef: "spec/boundary",
          checksGreen: false,
          reviewVerdict: "REQUEST_CHANGES",
          fixRounds: 3,
        },
      ],
    };
    const result = plan(state, manual, live);
    expect(result.actions).toEqual([
      {
        kind: "stuck_pr",
        ref: 99,
        detail: "post STUCK comment on PR #99 and park — 3-round fix budget exhausted",
      },
    ]);
  });
});

// ---- fixture: pr-request-changes-r3 ----------------------------------------

describe("pr-request-changes-r3 fixture", () => {
  it("returns stuck_pr for fixRounds===3, fix_pr round 3 for fixRounds===2", () => {
    // SPEC-META-3: fixture has two PRs — #60 (fixRounds=3 → stuck), #61 (fixRounds=2 → fix r3)
    const { state, manual, live } = loadFixture("pr-request-changes-r3");
    const result = plan(state, manual, live);

    // PRs sorted by number: #60 first, #61 second
    expect(result.actions).toEqual([
      {
        kind: "stuck_pr",
        ref: 60,
        detail: "post STUCK comment on PR #60 and park — 3-round fix budget exhausted",
      },
      {
        kind: "fix_pr",
        ref: 61,
        detail: "fix PR #61 per reviewer feedback (round 3 of 3)",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ---- fixture: idle ----------------------------------------------------------

describe("idle fixture", () => {
  it("returns single idle action when no issues and no PRs", () => {
    // SPEC-META-3: no issues + no PRs → idle with zero-trace message
    const { state, manual, live } = loadFixture("idle");
    const result = plan(state, manual, live);

    expect(result.actions).toEqual([
      {
        kind: "idle",
        detail: "no actionable work; exit with zero trace",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
    const traceText = result.trace.join("\n");
    expect(traceText).toMatch(/zero.trace/i);
  });
});

// ---- fixture: gates-parked --------------------------------------------------

describe("gates-parked fixture", () => {
  it("gates take precedence over queued issues — single idle action", () => {
    // SPEC-META-3: manual.gates non-empty → idle regardless of issues
    const { state, manual, live } = loadFixture("gates-parked");
    const result = plan(state, manual, live);

    // Has a queued issue (#5) but a gate should win
    expect(manual.gates).toContain("AC-8 eyeball");
    expect(live.agentTaskIssues.length).toBeGreaterThan(0);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe("idle");
    expect(result.actions[0].detail).toContain("AC-8 eyeball");
  });

  it("trace names the blocking gate", () => {
    // SPEC-META-3: trace must explain gate-parking decision
    const { state, manual, live } = loadFixture("gates-parked");
    const result = plan(state, manual, live);
    expect(result.trace.join("\n")).toMatch(/AC-8 eyeball/);
  });
});

// ---- all-wait-pr collapses to idle ------------------------------------------

describe("all-wait PRs collapses to idle", () => {
  it("returns idle when all open PRs are still waiting (PENDING verdict)", () => {
    // SPEC-META-3: if everything resolves to wait_pr, append idle instead
    const state: StateJson = {};
    const manual: ManualJson = { activeSlice: "slice-4", gates: [], parked: [], notes: "" };
    const live: LiveSnapshot = {
      agentTaskIssues: [],
      openPRs: [
        {
          number: 20,
          title: "SPEC-FOO-1: pending review",
          headRef: "spec/foo-1",
          checksGreen: false,
          reviewVerdict: "PENDING",
          fixRounds: 0,
        },
        {
          number: 21,
          title: "SPEC-FOO-2: pending review",
          headRef: "spec/foo-2",
          checksGreen: true,
          reviewVerdict: null,
          fixRounds: 0,
        },
      ],
    };
    const result = plan(state, manual, live);

    // All wait → single idle
    expect(result.actions).toEqual([
      {
        kind: "idle",
        detail: "no actionable work; exit with zero trace",
      },
    ]);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});
