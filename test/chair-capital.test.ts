import { describe, it, expect } from "vitest";
import {
  computeChairCapital,
  computeEffectiveBands,
  loadChairCapitalParams,
  _resetChairCapitalParamsCache,
  type ChairCapitalParams,
} from "../src/engine/chair-capital";
import { vote, previewVote, type CommitteeParams } from "../src/engine/fomc";
import { makeState } from "../src/engine/state";
import type { Committee, CommitteeMember } from "../src/content/committees";
import { Session } from "../src/engine/session";

// SPEC-COMM-7

const PARAMS: ChairCapitalParams = {
  base_capital: 3,
  credibility_weight: 0.05,
  band_widen_per_unit: 0.002,
  max_spend_per_member: 3,
};

const COMMITTEE_PARAMS: CommitteeParams = {
  neutral_rate: 0.05,
  target_inflation: 0.02,
  target_unemployment: 0.04,
  conviction_band_factor: 0, // 0 = no conviction narrowing; isolates chair-capital band widening
};

function member(id: string, overrides: Partial<CommitteeMember> = {}): CommitteeMember {
  return {
    id: `member.${id}`,
    name: `member.${id}.name`,
    inflation_coef: 1.7,
    output_coef: 0.4,
    inertia: 0.88,
    competence: 0.8,
    compromise_band: 0.005,
    conviction: 0, // 0 = no conviction narrowing; isolates chair-capital band widening
    ...overrides,
  };
}

function committeeOf(members: CommitteeMember[]): Committee {
  return { id: "comm.test", name: "comm.test.name", desc: "comm.test.desc", members };
}

// State at steady state with given credibility.
function stateWithCredibility(credibility: number) {
  return makeState({
    vars: { inflation: 0.02, unemployment: 0.04, policy_rate: 0.05, credibility },
  });
}

describe("computeChairCapital", () => {
  // SPEC-COMM-7: budget at floor credibility
  it("base_capital at credibility=0", () => {
    expect(computeChairCapital(0, PARAMS)).toBe(3);
  });

  // SPEC-COMM-7: budget grows monotonically with credibility
  it("budget increases with credibility", () => {
    const low = computeChairCapital(20, PARAMS);
    const high = computeChairCapital(80, PARAMS);
    expect(high).toBeGreaterThan(low);
  });

  // SPEC-COMM-7: exact formula: base + floor(weight * credibility)
  it("formula: base_capital + floor(credibility_weight * credibility)", () => {
    // 3 + floor(0.05 * 60) = 3 + floor(3) = 6
    expect(computeChairCapital(60, PARAMS)).toBe(6);
    // 3 + floor(0.05 * 100) = 3 + floor(5) = 8
    expect(computeChairCapital(100, PARAMS)).toBe(8);
  });

  // SPEC-COMM-7: pure — same inputs → same output
  it("is deterministic", () => {
    expect(computeChairCapital(55, PARAMS)).toBe(computeChairCapital(55, PARAMS));
  });
});

describe("computeEffectiveBands", () => {
  // SPEC-COMM-7: spending zero leaves band unchanged
  it("zero spend → no change to band", () => {
    const committee = committeeOf([member("a")]);
    const bands = computeEffectiveBands({ "member.a": 0 }, committee, PARAMS);
    expect(bands["member.a"]).toBeUndefined();
  });

  // SPEC-COMM-7: empty spend map returns empty result (truthy object, no entries)
  it("empty capitalSpend {} returns empty result", () => {
    // SPEC-COMM-7
    const committee = committeeOf([member("a")]);
    const bands = computeEffectiveBands({}, committee, PARAMS);
    expect(Object.keys(bands)).toHaveLength(0);
  });

  // SPEC-COMM-7: spending units widens the band by band_widen_per_unit per unit
  it("1 unit spend widens band by band_widen_per_unit", () => {
    const m = member("a", { compromise_band: 0.005 });
    const committee = committeeOf([m]);
    const bands = computeEffectiveBands({ "member.a": 1 }, committee, PARAMS);
    expect(bands["member.a"]).toBeCloseTo(0.005 + 0.002, 6);
  });

  // SPEC-COMM-7: spending more than max_spend_per_member on a single member throws loudly
  it("throws when single-member spend exceeds max_spend_per_member", () => {
    // SPEC-COMM-7: over-allocation on a single member must fail loudly (hard budget contract).
    // Session._assertWithinBudget enforces this at the Session layer; computeEffectiveBands
    // enforces it as well so direct callers that bypass Session also get a clear error.
    const m = member("a", { compromise_band: 0.005 });
    const committee = committeeOf([m]);
    // try spending 10 but max is 3
    expect(() =>
      computeEffectiveBands({ "member.a": 10 }, committee, PARAMS),
    ).toThrow(/max_spend_per_member/);
  });

  // SPEC-COMM-7: members not in spend map are not affected
  it("unspent members absent from result", () => {
    const committee = committeeOf([member("a"), member("b")]);
    const bands = computeEffectiveBands({ "member.a": 2 }, committee, PARAMS);
    expect(bands["member.a"]).toBeDefined();
    expect(bands["member.b"]).toBeUndefined();
  });

  // SPEC-COMM-7: multiple members can be targeted
  it("multiple members can each receive spend", () => {
    const committee = committeeOf([
      member("a", { compromise_band: 0.005 }),
      member("b", { compromise_band: 0.010 }),
    ]);
    const bands = computeEffectiveBands({ "member.a": 2, "member.b": 1 }, committee, PARAMS);
    expect(bands["member.a"]).toBeCloseTo(0.005 + 2 * 0.002, 6);
    expect(bands["member.b"]).toBeCloseTo(0.010 + 1 * 0.002, 6);
  });

  // SPEC-COMM-7: post-widen band exceeding 0.5 throws
  it("throws when spend would widen a band past 0.5", () => {
    // SPEC-COMM-7
    // 1 unit × band_widen_per_unit (0.002) → 0.499 + 0.002 = 0.501 > 0.5
    const m = member("a", { compromise_band: 0.499 });
    const committee = committeeOf([m]);
    expect(() =>
      computeEffectiveBands({ "member.a": 1 }, committee, PARAMS),
    ).toThrow(/exceeds the maximum allowed value of 0\.5/);
  });

  // SPEC-COMM-7: negative spend value throws (not silently dropped)
  it("throws on negative spend value (Session entry point)", () => {
    // SPEC-COMM-7: negative spend is a caller bug; it must throw, not be silently ignored.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    // _assertWithinBudget catches this before computeEffectiveBands is reached.
    expect(() => s.committeeBriefing(0.1075, { [firstId]: -1 })).toThrow(/non-negative finite/);
  });
});

describe("chair capital integration with previewVote / vote", () => {
  // SPEC-COMM-7: spending capital on member M makes M assent to a proposal they would otherwise dissent on
  it("spending capital converts a dissent to assent", () => {
    // narrow band: any proposal more than 0.001 from preferred causes dissent
    const m = member("a", { compromise_band: 0.001, inertia: 0, inflation_coef: 1.7, output_coef: 0.4 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    // Without capital, member dissents at a proposal 0.003 above preferred.
    const noBands = previewVote(committee, 0.053, state, COMMITTEE_PARAMS, []);
    expect(noBands.previews[0].wouldDissent).toBe(true);

    // With enough capital spend (2 units → +0.004 band → effective 0.005 > 0.003), member assents.
    const effectiveBands = computeEffectiveBands({ "member.a": 2 }, committee, PARAMS);
    const withBands = previewVote(committee, 0.053, state, COMMITTEE_PARAMS, [], effectiveBands);
    expect(withBands.previews[0].wouldDissent).toBe(false);
  });

  // SPEC-COMM-7: widening does not persist — next call without effectiveBands reverts to original band
  it("widening does not persist across calls", () => {
    const m = member("a", { compromise_band: 0.001 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    const effectiveBands = computeEffectiveBands({ "member.a": 3 }, committee, PARAMS);
    previewVote(committee, 0.053, state, COMMITTEE_PARAMS, [], effectiveBands);

    // Subsequent call without bands uses original compromise_band
    const fresh = previewVote(committee, 0.053, state, COMMITTEE_PARAMS, []);
    expect(fresh.previews[0].wouldDissent).toBe(true);
  });

  // SPEC-COMM-7: vote() also respects effectiveBands
  it("vote() uses effectiveBands to compute dissents", () => {
    const m = member("a", { compromise_band: 0.001 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    const withoutSpend = vote(committee, 0.053, state, COMMITTEE_PARAMS, []);
    expect(withoutSpend.dissents).toBe(1);

    const effectiveBands = computeEffectiveBands({ "member.a": 3 }, committee, PARAMS);
    const withSpend = vote(committee, 0.053, state, COMMITTEE_PARAMS, [], effectiveBands);
    expect(withSpend.dissents).toBe(0);
  });
});

describe("loadChairCapitalParams", () => {
  // SPEC-COMM-7: loader reads content/engine/chair-capital.json
  it("loads without throwing", () => {
    _resetChairCapitalParamsCache();
    expect(() => loadChairCapitalParams()).not.toThrow();
  });

  it("returns valid params", () => {
    _resetChairCapitalParamsCache();
    const p = loadChairCapitalParams();
    expect(p.base_capital).toBeGreaterThanOrEqual(0);
    expect(p.credibility_weight).toBeGreaterThanOrEqual(0);
    expect(p.band_widen_per_unit).toBeGreaterThanOrEqual(0);
    expect(p.max_spend_per_member).toBeGreaterThanOrEqual(0);
  });
});

describe("computeEffectiveBands: unknown capitalSpend key throws", () => {
  // SPEC-COMM-7: a capitalSpend key that matches no committee member must throw, not silently discard.
  it("throws a descriptive error when a capitalSpend key is not a known member id", () => {
    // SPEC-COMM-7
    const committee = committeeOf([member("a")]);
    expect(() =>
      computeEffectiveBands({ "member.a": 1, "member.ghost": 2 }, committee, PARAMS),
    ).toThrow(/member\.ghost/);
  });

  it("does not throw when all capitalSpend keys are valid member ids", () => {
    // SPEC-COMM-7
    const committee = committeeOf([member("a"), member("b")]);
    expect(() =>
      computeEffectiveBands({ "member.a": 1, "member.b": 2 }, committee, PARAMS),
    ).not.toThrow();
  });
});

describe("previewVote: effectiveBands entry validation (SPEC-COMM-7)", () => {
  // SPEC-COMM-7: fomc.ts validates each effectiveBands entry at vote time.
  // Callers can construct effectiveBands manually without going through computeEffectiveBands.
  it("previewVote throws on NaN effectiveBands entry", () => {
    // SPEC-COMM-7
    const m = member("a");
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);
    expect(() =>
      previewVote(committee, 0.05, state, COMMITTEE_PARAMS, [], { "member.a": NaN }),
    ).toThrow(/invalid/);
  });

  it("previewVote throws on out-of-range effectiveBands entry (> 0.5)", () => {
    // SPEC-COMM-7
    const m = member("a");
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);
    expect(() =>
      previewVote(committee, 0.05, state, COMMITTEE_PARAMS, [], { "member.a": 0.6 }),
    ).toThrow(/invalid/);
  });

  it("previewVote throws on negative effectiveBands entry", () => {
    // SPEC-COMM-7: negative effectiveBands values are invalid; fomc.ts:184 checks capitalBand < 0.
    // This path is only reachable by callers who construct effectiveBands manually.
    const m = member("a");
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);
    expect(() =>
      previewVote(committee, 0.05, state, COMMITTEE_PARAMS, [], { "member.a": -0.001 }),
    ).toThrow(/invalid/);
  });

  it("previewVote throws on unknown effectiveBands key", () => {
    // SPEC-COMM-7: a key that doesn't match any committee member must throw, not be silently ignored.
    // previewVote validates this directly so callers who bypass computeEffectiveBands are caught.
    const m = member("a");
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);
    expect(() =>
      previewVote(committee, 0.05, state, COMMITTEE_PARAMS, [], { "member.typo": 0.003 }),
    ).toThrow(/member\.typo/);
  });
});

describe("Session.chairCapital()", () => {
  // SPEC-COMM-7: chairCapital() wires getCredibility → computeChairCapital correctly.
  it("returns a non-negative integer for the 1979 scenario (credibility=25)", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const capital = s.chairCapital();
    expect(Number.isInteger(capital)).toBe(true);
    expect(capital).toBeGreaterThanOrEqual(0);
  });

  it("matches computeChairCapital(credibility, loadChairCapitalParams()) directly", () => {
    // SPEC-COMM-7: Session.chairCapital() is just the composed pipeline; verify the output
    // matches the manual composition so a refactor cannot silently swap the formula.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const credibility = s.current.vars.credibility as number; // 25 from scenario
    const expected = computeChairCapital(credibility, loadChairCapitalParams());
    expect(s.chairCapital()).toBe(expected);
  });

  it("chairCapital() reflects updated credibility after proposeRate", () => {
    // SPEC-COMM-7: proposeRate calls applyMeetingOutcome which updates credibility in _state.vars.
    // chairCapital() must read the current (post-meeting) credibility, not the stale initial value.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075);
    const credAfter = s.current.vars.credibility as number;
    const expected = computeChairCapital(credAfter, loadChairCapitalParams());
    expect(s.chairCapital()).toBe(expected);
  });
});

describe("Session.committeeBriefing with capitalSpend", () => {
  // SPEC-COMM-7: committeeBriefing forwards capitalSpend to previewVote via computeEffectiveBands.
  // Use a self-calibrating rate: pick the first member's preferred rate from a no-spend briefing,
  // then propose at preferred + band + tiny epsilon so the member just barely dissents, and
  // confirm spending 1 unit of capital (which widens the band by band_widen_per_unit) is enough
  // to flip them to assent.
  it("spending capital on a member can convert their dissent to assent in the briefing", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    // band_widen_per_unit = 0.002, max_spend_per_member = 3 (from content/engine/chair-capital.json)

    // Probe with a neutral rate to get preferred values.
    const probe = s.committeeBriefing(0.1075);
    const target = probe.previews[0]; // pick the first member

    // Craft a rate just outside their compromise_band (0.005): preferred + 0.006
    // This gap (0.006) exceeds the base band (0.005) but fits within the widened band
    // (0.005 + 1 * 0.002 = 0.007).
    const baseBand = 0.005; // all real members use this
    const epsilon = 0.001;  // gap = baseBand + epsilon (just outside)
    const rate = target.preferred + baseBand + epsilon;

    // Confirm dissent without spend.
    const without = s.committeeBriefing(rate);
    const memberWithout = without.previews.find((p) => p.memberId === target.memberId)!;
    expect(memberWithout.wouldDissent).toBe(true);

    // Spend 1 unit → new band = 0.005 + 0.002 = 0.007 > gap 0.006 → should assent.
    const with1 = s.committeeBriefing(rate, { [target.memberId]: 1 });
    const memberWith = with1.previews.find((p) => p.memberId === target.memberId)!;
    expect(memberWith.wouldDissent).toBe(false);
  });

  it("is pure: committeeBriefing with capitalSpend does not mutate session state", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const credBefore = s.current.vars.credibility;
    const dateBefore = s.current.date;
    // Spend on the first member (arbitrary; just verifying no state mutation).
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    s.committeeBriefing(0.1075, { [firstId]: 1 });
    expect(s.current.vars.credibility).toBe(credBefore);
    expect(s.current.date).toBe(dateBefore);
  });
});

describe("Session.proposeRate with capitalSpend (SPEC-COMM-7 AC)", () => {
  // SPEC-COMM-7 AC: given capital spent on member M, M assents when they would otherwise dissent.
  // This is the state-mutating path — proposeRate commits the meeting outcome.
  // Use the same self-calibrating rate approach: probe preferred from briefing, craft a rate
  // that just barely causes dissent, then spend 1 unit to flip it.
  it("SPEC-COMM-7 AC: capital spend converts a dissenting member to assent in proposeRate", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");

    // Probe preferred rates via a pure briefing.
    const probe = s.committeeBriefing(0.1075);
    const target = probe.previews[0];

    // Craft a rate just outside the member's base band: gap = baseBand + 0.001
    const baseBand = 0.005;
    const rate = target.preferred + baseBand + 0.001; // gap = 0.006

    // Without spend: member dissents, contributing 1+ to the dissent count.
    const voteWithout = s.proposeRate(rate);
    const dissentsWithout = voteWithout.dissents;
    expect(dissentsWithout).toBeGreaterThan(0);

    // Reset to restore state, then propose same rate WITH 1 unit spend on the target.
    s.reset();
    const voteWith = s.proposeRate(rate, { [target.memberId]: 1 });
    // That member assents → fewer dissents than without spend.
    expect(voteWith.dissents).toBeLessThan(dissentsWithout);
  });

  // SPEC-COMM-7: the capital spend is ephemeral — it must not persist to member state.
  // After proposeRate with capitalSpend, a fresh committeeBriefing (without spend) at the
  // same rate should show the member dissenting again.
  it("capital spend is ephemeral: does not persist to member state after proposeRate", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");

    // Probe to find the first member's preferred rate.
    const probe = s.committeeBriefing(0.1075);
    const target = probe.previews[0];

    // Craft rate just outside base band.
    const baseBand = 0.005;
    const rate = target.preferred + baseBand + 0.001; // gap = 0.006

    // Propose with spend — target member assents this time.
    s.proposeRate(rate, { [target.memberId]: 1 });

    // Advance to the next meeting month (1979-08 + 3 = 1979-11, a scheduled meeting month).
    s.advance(3);

    // Re-check: same rate, NO spend — member should dissent again (band reverted).
    const briefingAfter = s.committeeBriefing(rate);
    const memberAfter = briefingAfter.previews.find((p) => p.memberId === target.memberId)!;
    expect(memberAfter.wouldDissent).toBe(true);
  });
});

describe("Session: total capitalSpend budget guard (SPEC-COMM-7)", () => {
  // Helper: build a spend map that totals targetTotal without any single member exceeding
  // max_spend_per_member (3), by spreading across the first N members in the briefing.
  function spreadSpend(
    previews: readonly { memberId: string }[],
    totalUnits: number,
    maxPerMember = 3,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    let remaining = totalUnits;
    for (const p of previews) {
      if (remaining <= 0) break;
      const chunk = Math.min(remaining, maxPerMember);
      result[p.memberId] = chunk;
      remaining -= chunk;
    }
    return result;
  }

  // SPEC-COMM-7: spending more than chairCapital() total must throw in both spend paths.
  // Spread budget+1 across members so no single member exceeds max_spend_per_member,
  // isolating the total-budget check from the per-member cap check.
  it("committeeBriefing throws when total spend exceeds chairCapital() budget", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const budget = s.chairCapital();
    const probe = s.committeeBriefing(0.1075);
    const overBudgetSpend = spreadSpend(probe.previews, budget + 1);
    expect(() => s.committeeBriefing(0.1075, overBudgetSpend)).toThrow(/chairCapital\(\) budget/);
  });

  it("proposeRate throws when total spend exceeds chairCapital() budget", () => {
    // SPEC-COMM-7
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const budget = s.chairCapital();
    const probe = s.committeeBriefing(0.1075);
    const overBudgetSpend = spreadSpend(probe.previews, budget + 1);
    expect(() => s.proposeRate(0.1075, overBudgetSpend)).toThrow(/chairCapital\(\) budget/);
  });

  // SPEC-COMM-7: exact-budget spend (total === budget) is allowed in both paths.
  it("committeeBriefing does not throw when total spend equals chairCapital() budget", () => {
    // SPEC-COMM-7: spend exactly at budget is allowed
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const budget = s.chairCapital();
    const probe = s.committeeBriefing(0.1075);
    // Spread exactly budget units across members (each ≤ max_spend_per_member).
    const exactSpend = spreadSpend(probe.previews, budget);
    expect(() => s.committeeBriefing(0.1075, exactSpend)).not.toThrow();
  });

  it("proposeRate does not throw when total spend equals chairCapital() budget", () => {
    // SPEC-COMM-7: spend exactly at budget is allowed (_assertWithinBudget uses strict >).
    // If a future refactor changes > to >=, this test catches the regression in proposeRate.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const budget = s.chairCapital();
    const probe = s.committeeBriefing(0.1075);
    const exactSpend = spreadSpend(probe.previews, budget);
    expect(() => s.proposeRate(0.1075, exactSpend)).not.toThrow();
  });

  // SPEC-COMM-7: over-allocating a single member beyond max_spend_per_member fails loudly.
  it("committeeBriefing throws when a single member's spend exceeds max_spend_per_member", () => {
    // SPEC-COMM-7: over-allocation wastes budget silently; fail loudly instead.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    // max_spend_per_member = 3; spend 4 on one member.
    expect(() => s.committeeBriefing(0.1075, { [firstId]: 4 })).toThrow(/max_spend_per_member/);
  });

  it("proposeRate throws when a single member's spend exceeds max_spend_per_member", () => {
    // SPEC-COMM-7: symmetric enforcement — proposeRate uses the same _assertWithinBudget path.
    // A refactor that accidentally drops the per-member check from proposeRate would go
    // undetected without this test.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    // max_spend_per_member = 3; spend 4 on one member.
    expect(() => s.proposeRate(0.1075, { [firstId]: 4 })).toThrow(/max_spend_per_member/);
  });

  it("committeeBriefing throws on NaN capitalSpend entry (SPEC-COMM-7)", () => {
    // SPEC-COMM-7: NaN > budget evaluates to false, so without per-entry validation
    // a NaN spend would silently pass the budget guard and corrupt computeEffectiveBands.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    expect(() => s.committeeBriefing(0.1075, { [firstId]: NaN })).toThrow(/non-negative finite/);
  });

  it("proposeRate throws on NaN capitalSpend entry (SPEC-COMM-7)", () => {
    // SPEC-COMM-7: NaN > budget evaluates to false, so without per-entry validation
    // a NaN spend would silently pass the budget guard and corrupt computeEffectiveBands.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    expect(() => s.proposeRate(0.1075, { [firstId]: NaN })).toThrow(/non-negative finite/);
  });

  it("committeeBriefing throws on negative capitalSpend entry (SPEC-COMM-7)", () => {
    // SPEC-COMM-7: a negative entry is a caller bug; per-entry validation catches it early.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const probe = s.committeeBriefing(0.1075);
    const firstId = probe.previews[0].memberId;
    expect(() => s.committeeBriefing(0.1075, { [firstId]: -1 })).toThrow(/non-negative finite/);
  });
});
