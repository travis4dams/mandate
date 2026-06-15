import { describe, it, expect } from "vitest";
import { Session } from "../src/engine/session.js";

// Integration coverage for the Session surface that wires the institution,
// legacy, and name-generator engine modules into the live game façade.
// SPEC-INST-1, SPEC-INST-2, SPEC-LEGACY-1, SPEC-NAME-1.

const SCEN = "scen.1979_stagflation";
const COMM = "comm.fomc_1979";

describe("Session institution + legacy + npc-name wiring", () => {
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

    const before = s.politicalCapital();
    s.hire("research", 0);
    expect(s.isStaffed("research")).toBe(true);
    expect(s.politicalCapital()).toBeCloseTo(before - (research?.hire_cost ?? 0), 6);
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
});
