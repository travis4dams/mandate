import { describe, it, expect } from "vitest";
import { Session } from "../src/engine/session.js";

// Integration coverage for the PR-A institution-depth wiring in the Session façade:
// SPEC-FRAG-1, SPEC-CRISIS-1, SPEC-FED-1, SPEC-CONGRESS-1, SPEC-DIV-1, SPEC-CULTURE-1.

const SCEN = "scen.1979_stagflation";
const COMM = "comm.fomc_1979";

describe("Session institution-depth wiring", () => {
  it("exposes in-range stability/finance/independence getters after advancing", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    s.advance(12);
    const frag = s.bankFragility();
    expect(frag).toBeGreaterThanOrEqual(0);
    expect(frag).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s.balanceSheet())).toBe(true);
    expect(Number.isFinite(s.netIncome())).toBe(true);
    expect(s.deferredAsset()).toBeGreaterThanOrEqual(0);
    const indep = s.independence();
    expect(indep).toBeGreaterThanOrEqual(0);
    expect(indep).toBeLessThanOrEqual(100);
    // Identity division effects when nothing is staffed.
    expect(s.divisionEffects().fogFactor).toBeCloseTo(1);
    expect(s.divisionEffects().fragilityMitigation).toBe(0);
    expect(typeof s.culture().supervisoryRigor).toBe("number");
  });

  it("staffing Supervision produces real fragility mitigation (management matters)", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    expect(s.isStaffed("supervision")).toBe(false);
    // Hire the candidate whose supervision skill is highest (a good fit).
    const slate = s.candidatesFor("supervision");
    let bestIdx = 0;
    let bestSkill = -1;
    slate.forEach((c, i) => {
      if (c.skills.supervision > bestSkill) {
        bestSkill = c.skills.supervision;
        bestIdx = i;
      }
    });
    s.hire("supervision", bestIdx);
    expect(s.isStaffed("supervision")).toBe(true);
    expect(s.divisionEffects().fragilityMitigation).toBeGreaterThan(0);
  });

  it("the 1979 tightening keeps the banking system stable (no runaway fragility)", () => {
    // Under sustained tight policy, fragility should not climb into the crisis zone.
    const s = Session.fromReplay("replay.1979_chair_tightening", 42, COMM);
    s.advance(60);
    expect(s.bankFragility()).toBeLessThan(0.65); // below crisis_threshold
    expect(Number.isFinite(s.deferredAsset())).toBe(true);
  });

  it("is deterministic across identical runs (crisis stream included)", () => {
    const a = Session.fromScenario(SCEN, 99, COMM);
    const b = Session.fromScenario(SCEN, 99, COMM);
    a.advance(24);
    b.advance(24);
    expect(a.trajectory).toEqual(b.trajectory);
    expect(a.bankFragility()).toBe(b.bankFragility());
  });
});
