import { describe, it, expect } from "vitest";
import {
  computeChairCapital,
  computeEffectiveBands,
  loadChairCapitalParams,
  _resetChairCapitalCache,
  type ChairCapitalParams,
} from "../src/engine/chair-capital";
import { vote, previewVote, type CommitteeParams } from "../src/engine/fomc";
import { makeState } from "../src/engine/state";
import type { Committee, CommitteeMember } from "../src/content/committees";

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

  // SPEC-COMM-7: spending units widens the band by band_widen_per_unit per unit
  it("1 unit spend widens band by band_widen_per_unit", () => {
    const m = member("a", { compromise_band: 0.005 });
    const committee = committeeOf([m]);
    const bands = computeEffectiveBands({ "member.a": 1 }, committee, PARAMS);
    expect(bands["member.a"]).toBeCloseTo(0.005 + 0.002, 6);
  });

  // SPEC-COMM-7: max_spend_per_member is enforced
  it("spend capped at max_spend_per_member", () => {
    const m = member("a", { compromise_band: 0.005 });
    const committee = committeeOf([m]);
    // try spending 10 but max is 3
    const bands = computeEffectiveBands({ "member.a": 10 }, committee, PARAMS);
    expect(bands["member.a"]).toBeCloseTo(0.005 + 3 * 0.002, 6);
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
});

describe("chair capital integration with previewVote / vote", () => {
  // SPEC-COMM-7: spending capital on member M makes M assent to a proposal they would otherwise dissent on
  it("spending capital converts a dissent to assent", () => {
    // narrow band: any proposal more than 0.001 from preferred causes dissent
    const m = member("a", { compromise_band: 0.001, inertia: 0, inflation_coef: 1.7, output_coef: 0.4 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    // Without capital, member dissents at a proposal 0.003 above preferred.
    const noBands = previewVote(committee, 0.053, state, COMMITTEE_PARAMS);
    expect(noBands.previews[0].wouldDissent).toBe(true);

    // With enough capital spend (2 units → +0.004 band → effective 0.005 > 0.003), member assents.
    const effectiveBands = computeEffectiveBands({ "member.a": 2 }, committee, PARAMS);
    const withBands = previewVote(committee, 0.053, state, COMMITTEE_PARAMS, effectiveBands);
    expect(withBands.previews[0].wouldDissent).toBe(false);
  });

  // SPEC-COMM-7: widening does not persist — next call without effectiveBands reverts to original band
  it("widening does not persist across calls", () => {
    const m = member("a", { compromise_band: 0.001 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    const effectiveBands = computeEffectiveBands({ "member.a": 3 }, committee, PARAMS);
    previewVote(committee, 0.053, state, COMMITTEE_PARAMS, effectiveBands);

    // Subsequent call without bands uses original compromise_band
    const fresh = previewVote(committee, 0.053, state, COMMITTEE_PARAMS);
    expect(fresh.previews[0].wouldDissent).toBe(true);
  });

  // SPEC-COMM-7: vote() also respects effectiveBands
  it("vote() uses effectiveBands to compute dissents", () => {
    const m = member("a", { compromise_band: 0.001 });
    const committee = committeeOf([m]);
    const state = stateWithCredibility(50);

    const withoutSpend = vote(committee, 0.053, state, COMMITTEE_PARAMS);
    expect(withoutSpend.dissents).toBe(1);

    const effectiveBands = computeEffectiveBands({ "member.a": 3 }, committee, PARAMS);
    const withSpend = vote(committee, 0.053, state, COMMITTEE_PARAMS, effectiveBands);
    expect(withSpend.dissents).toBe(0);
  });
});

describe("loadChairCapitalParams", () => {
  // SPEC-COMM-7: loader reads content/engine/chair-capital.json
  it("loads without throwing", () => {
    _resetChairCapitalCache();
    expect(() => loadChairCapitalParams()).not.toThrow();
  });

  it("returns valid params", () => {
    _resetChairCapitalCache();
    const p = loadChairCapitalParams();
    expect(p.base_capital).toBeGreaterThanOrEqual(0);
    expect(p.credibility_weight).toBeGreaterThanOrEqual(0);
    expect(p.band_widen_per_unit).toBeGreaterThanOrEqual(0);
    expect(p.max_spend_per_member).toBeGreaterThanOrEqual(0);
  });
});
