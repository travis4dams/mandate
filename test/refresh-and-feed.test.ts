import { describe, it, expect } from "vitest";
import { Session } from "../src/engine/session.js";
import { generateCandidates, loadInstitutionParams } from "../src/engine/institution.js";
import { loadNamePools } from "../src/engine/names.js";

// SPEC-INST-5 (candidate refresh) + SPEC-FEED-1 (activity ledger).

const SCEN = "scen.1979_stagflation";
const GFC = "scen.2008_gfc";
const COMM = "comm.fomc_1979";

describe("SPEC-INST-5: candidate slate refresh", () => {
  it("generateCandidates is deterministic per refreshIndex and varies across indices", () => {
    const pools = loadNamePools();
    const params = loadInstitutionParams();
    const a0 = generateCandidates("research", 42, pools, params, 0).map((c) => c.name);
    const a0again = generateCandidates("research", 42, pools, params, 0).map((c) => c.name);
    const a1 = generateCandidates("research", 42, pools, params, 1).map((c) => c.name);
    expect(a0).toEqual(a0again); // deterministic for a fixed index
    expect(a0).not.toEqual(a1); // a refresh turns over the slate
  });

  it("Session.candidatesFor returns a fresh slate after a dismissal", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    const before = s.candidatesFor("research").map((c) => c.name);
    s.hire("research", 0);
    s.fire("research");
    const after = s.candidatesFor("research").map((c) => c.name);
    expect(after).not.toEqual(before);
  });
});

describe("SPEC-FEED-1: activity ledger", () => {
  it("is empty at game start and cleared by reset", () => {
    const s = Session.fromScenario(SCEN, 42, COMM);
    expect(s.activityLog().length).toBe(0);
    s.advance(3);
    s.reset();
    expect(s.activityLog().length).toBe(0);
  });

  it("logs a resolved escalation with the var deltas it caused", () => {
    // 2008 starts with bank_fragility 0.6 → evt.regional_bank_distress fires on advance.
    const s = Session.fromScenario(GFC, 42, COMM);
    s.advance(1);
    expect(s.escalations().map((e) => e.id)).toContain("evt.regional_bank_distress");
    s.resolveEscalation("evt.regional_bank_distress", "intervene"); // subtracts bank_fragility
    const log = s.activityLog();
    expect(log.length).toBeGreaterThan(0);
    // The entry's titleKey is the event's title localization key.
    const entry = log.find((e) => e.titleKey === "evt.regional_bank_distress.title");
    expect(entry).toBeDefined();
    const frag = entry?.deltas.find((d) => d.var === "bank_fragility");
    expect(frag).toBeDefined();
    expect(frag?.delta).toBeLessThan(0); // intervening lowered fragility
  });
});
