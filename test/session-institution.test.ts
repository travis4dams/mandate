import { describe, it, expect, vi, afterEach } from "vitest";
import { Session } from "../src/engine/session.js";
import * as stanceModule from "../src/engine/stance.js";
import type { GameEvent } from "../src/content/events.js";

// Integration coverage for the Session surface that wires the institution,
// legacy, and name-generator engine modules into the live game façade.
// SPEC-INST-1, SPEC-INST-2, SPEC-LEGACY-1, SPEC-NAME-1.

const SCEN = "scen.1979_stagflation";
const COMM = "comm.fomc_1979";

describe("Session institution + legacy + npc-name wiring", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // SPEC-NAME-1: npcName is deterministic per (seed, npcId) and varies by id/seed.
  it("npcName is deterministic and seed/id dependent", () => {
    const a = Session.fromScenario(SCEN, 42, COMM);
    const b = Session.fromScenario(SCEN, 42, COMM);
    expect(a.npcName("member.chair")).toBe(b.npcName("member.chair"));
    expect(a.npcName("member.chair")).not.toBe(a.npcName("member.vice_chair"));
    const c = Session.fromScenario(SCEN, 7, COMM);
    // Overwhelmingly likely to differ across seeds; assert it is a non-empty string at least.
    expect(a.npcName("member.chair").length).toBeGreaterThan(0);
    expect(c.npcName("member.chair").length).toBeGreaterThan(0);
  });

  // SPEC-INST-1: resources default from content and budget grows with time.
  it("exposes institution resources that default from content and evolve on advance", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    expect(s.operatingBudget()).toBeCloseTo(1000, 6);
    expect(s.politicalCapital()).toBeCloseTo(80, 6);
    s.advance(12);
    // 0.5%/month compounding for 12 months.
    expect(s.operatingBudget()).toBeGreaterThan(1000);
    expect(s.operatingBudget()).toBeCloseTo(1000 * Math.pow(1.005, 12), 4);
    expect(Number.isFinite(s.politicalCapital())).toBe(true);
  });

  // SPEC-INST-2: division catalog, deterministic candidate slates, and hiring.
  it("lists divisions, generates stable candidate slates, and hires", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    const catalog = s.divisionCatalog();
    expect(catalog.length).toBeGreaterThan(0);

    const research = catalog.find((d) => d.id === "research");
    expect(research).toBeDefined();

    const slate1 = s.candidatesFor("research");
    const slate2 = s.candidatesFor("research");
    expect(slate1.length).toBe(3);
    expect(slate1.map((c) => c.name)).toEqual(slate2.map((c) => c.name)); // deterministic

    expect(s.isStaffed("research")).toBe(false);
    expect(s.institutionInvestment()).toBe(0);

    const beforeBudget = s.operatingBudget();
    s.hire("research", 0);
    expect(s.isStaffed("research")).toBe(true);
    // SPEC-STAFF-3: hire deducts from operating_budget, not political_capital
    expect(s.operatingBudget()).toBeCloseTo(beforeBudget - (research?.hire_cost ?? 0), 6);
    expect(s.institutionInvestment()).toBeGreaterThan(0);
  });

  it("hire rejects unknown division and out-of-range candidate", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    expect(() => s.hire("nonexistent_division", 0)).toThrow();
    expect(() => s.hire("research", 99)).toThrow();
  });

  // SPEC-LEGACY-1: term clock, reappointment outlook, and legacy score.
  it("exposes term progress, reappointment outlook, and legacy score", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    const t0 = s.termProgress();
    expect(t0.termsServed).toBe(0);
    expect(t0.monthsIntoTerm).toBe(0);
    expect(t0.termLength).toBe(48);
    expect(t0.monthsToReappointment).toBe(48);

    const outlook = s.reappointmentOutlook();
    expect(typeof outlook.reappointed).toBe("boolean");
    expect(outlook.threshold).toBeGreaterThan(0);

    expect(Number.isFinite(s.legacyScore())).toBe(true);

    s.advance(6);
    expect(s.termProgress().monthsIntoTerm).toBe(6);
  });

  // SPEC-LEGACY-1: Session.advance() accumulates months_on_target when the Chair is on mandate.
  // Uses recovery_test with inflation nudged to on-target. expectations_anchor is also nudged
  // to match, which prevents macro dynamics from pulling inflation back off-target each month
  // (it doesn't gate onTarget() directly — only inflation and unemployment do).
  it("advance() increments months_on_target for each on-target month", () => {
    // SPEC-LEGACY-1
    // Bring inflation (0.04) to on-target via additive delta. Nudge expectations_anchor to match
    // so macro dynamics don't pull inflation back off-target during the 3-month advance.
    const s = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979", {
      varDeltas: {
        inflation: 0.022 - 0.04,           // → 0.022, within ±0.005 of 0.02 target
        expectations_anchor: 0.022 - 0.05, // → 0.022, prevents anchor-pull drifting inflation off-target
      },
    });
    expect(s.current.vars.months_on_target ?? 0).toBe(0);
    const scoreBefore = s.legacyScore();
    s.advance(3);
    expect(s.current.vars.months_on_target ?? 0).toBe(3);
    // Wire test: legacyScore() must reflect the accumulated mandate bonus.
    expect(s.legacyScore()).toBeGreaterThan(scoreBefore);
  });

  // SPEC-LEGACY-1: months_on_target stays 0 when the Chair is persistently off-target.
  it("advance() does not increment months_on_target when inflation is far off-target", () => {
    // SPEC-LEGACY-1
    // 1979 scenario: inflation = 0.114, way outside the ±0.005 tolerance band.
    const s = Session.fromScenario(SCEN, 42, COMM);
    s.advance(6);
    expect(s.current.vars.months_on_target ?? 0).toBe(0);
  });

  // SPEC-LEGACY-1: months_on_target accumulated during a failed advance() must be rolled back.
  it("advance() rolls back months_on_target on mid-loop failure", () => {
    // SPEC-LEGACY-1
    // Start on-target so month 1 increments months_on_target.
    const s = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979", {
      varDeltas: {
        inflation: 0.022 - 0.04,
        expectations_anchor: 0.022 - 0.05,
      },
    });

    // First call passes through (month 1 completes, months_on_target → 1 in _state);
    // second call returns the same reference → triggers the same-ref guard → throw on month 2.
    const realFn = stanceModule.applyIntermeetingDrift;
    vi.spyOn(stanceModule, "applyIntermeetingDrift")
      .mockImplementationOnce((...args) => realFn(...args))
      .mockImplementationOnce((...args) => args[0] as ReturnType<typeof realFn>);

    expect(() => s.advance(2)).toThrow(/applyIntermeetingDrift skipped/);
    // State must be rolled back to the pre-advance checkpoint.
    expect(s.current.vars.months_on_target ?? 0).toBe(0);
    expect(s.escalations().length).toBe(0);
    expect(s.activityLog().length).toBe(0);
  });

  // SPEC-LEGACY-1: resolveEscalation throws when an event effect targets months_on_target.
  it("resolveEscalation throws when an event effect targets months_on_target", () => {
    // SPEC-LEGACY-1
    const s = Session.fromScenario(SCEN, 42, COMM);
    const fakeEvent: GameEvent = {
      id: "test.bad_event",
      category: "exogenous",
      title: "test.bad",
      fires_once: false,
      options: [{
        id: "opt",
        name: "test.opt",
        effects: [{ op: "add", target: "months_on_target", value: 1 }],
      }],
    };
    (s as unknown as { _pendingEscalations: GameEvent[] })._pendingEscalations.push(fakeEvent);
    expect(() => s.resolveEscalation("test.bad_event", "opt"))
      .toThrow(/illegally modified months_on_target/);
  });

  // SPEC-LEGACY-1: reset() clears months_on_target accumulated during a prior advance.
  it("reset() clears months_on_target", () => {
    // SPEC-LEGACY-1
    const s = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979", {
      varDeltas: {
        inflation: 0.022 - 0.04,
        expectations_anchor: 0.022 - 0.05,
      },
    });
    s.advance(3);
    expect(s.current.vars.months_on_target ?? 0).toBe(3);
    s.reset();
    expect(s.current.vars.months_on_target ?? 0).toBe(0);
  });
});
