import { describe, it, expect } from "vitest";
import { Session } from "../src/engine/session.js";

// SPEC-EVENT-1 / SPEC-EVENT-2: the Session surfaces escalations and resolves them.
// The 2008 scenario starts with bank_fragility 0.6 (>= the 0.5 trigger) and
// evt.regional_bank_distress has no MTTH, so it fires on the first advance.

const GFC = "scen.2008_gfc";
const COMM = "comm.fomc_1979";
const DISTRESS = "evt.regional_bank_distress";

describe("Session escalations (SPEC-EVENT-1/2)", () => {
  it("surfaces an eligible no-MTTH event as a pending escalation", () => {
    // SPEC-EVENT-1
    const s = Session.fromScenario(GFC, 42, COMM);
    expect(s.escalations().length).toBe(0);
    s.advance(1);
    const ids = s.escalations().map((e) => e.id);
    expect(ids).toContain(DISTRESS);
  });

  it("is deterministic — same seed surfaces the same escalations", () => {
    // SPEC-EVENT-1
    const a = Session.fromScenario(GFC, 7, COMM);
    const b = Session.fromScenario(GFC, 7, COMM);
    a.advance(6);
    b.advance(6);
    expect(a.escalations().map((e) => e.id)).toEqual(b.escalations().map((e) => e.id));
  });

  it("resolving an escalation applies the chosen option's effects and removes it", () => {
    // SPEC-EVENT-2
    const s = Session.fromScenario(GFC, 42, COMM);
    s.advance(1);
    const fragBefore = s.bankFragility();
    expect(s.escalations().map((e) => e.id)).toContain(DISTRESS);
    // "intervene" shores up the bank — it subtracts bank_fragility.
    s.resolveEscalation(DISTRESS, "intervene");
    expect(s.escalations().map((e) => e.id)).not.toContain(DISTRESS);
    expect(s.bankFragility()).toBeLessThan(fragBefore);
  });

  it("does not re-add an already-pending escalation across months", () => {
    // SPEC-EVENT-1: dedupe by id
    const s = Session.fromScenario(GFC, 42, COMM);
    s.advance(3);
    const count = s.escalations().filter((e) => e.id === DISTRESS).length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it("throws on an unknown escalation or option id", () => {
    // SPEC-EVENT-2
    const s = Session.fromScenario(GFC, 42, COMM);
    s.advance(1);
    expect(() => s.resolveEscalation("evt.nope", "x")).toThrow();
    expect(() => s.resolveEscalation(DISTRESS, "not_an_option")).toThrow();
  });
});
