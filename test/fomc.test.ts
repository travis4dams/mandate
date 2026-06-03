import { describe, it, expect, afterEach } from "vitest";
import {
  vote,
  previewVote,
  loadCommitteeParams,
  _resetCommitteeParamsCache,
  VoteMissingVarError,
  type FomcVote,
  type CommitteeParams,
} from "../src/engine/fomc";
import { applyMeetingOutcome } from "../src/engine/credibility";
import { makeState } from "../src/engine/state";
import type { Committee, CommitteeMember } from "../src/content/committees";

afterEach(() => {
  _resetCommitteeParamsCache();
});

// SPEC-COMM-2 (vote) + SPEC-COMM-3 (per-member Taylor coefficients with inertia).

const PARAMS: CommitteeParams = {
  dissent_tolerance: 0.005,
  neutral_rate: 0.05,
  target_inflation: 0.02,
  target_unemployment: 0.04,
};

// Default per-member coefficient fixture (empirical median).
function member(
  id: string,
  overrides: Partial<CommitteeMember> = {},
): CommitteeMember {
  return {
    id: `member.${id}`,
    name: `member.${id}.name`,
    inflation_coef: 1.7,
    output_coef: 0.4,
    inertia: 0.88,
    competence: 0.8,
    ...overrides,
  };
}

function committeeOf(members: CommitteeMember[]): Committee {
  return { id: "comm.test", name: "comm.test.name", desc: "comm.test.desc", members };
}

// Helper: state with all four required vars set.
function macroState(opts: { inflation: number; unemployment: number; policy_rate?: number }) {
  return makeState({
    vars: {
      inflation: opts.inflation,
      unemployment: opts.unemployment,
      policy_rate: opts.policy_rate ?? 0.05,
    },
  });
}

describe("vote", () => {
  // SPEC-COMM-3: each member's preferred rate is a Taylor-rule reaction anchored at
  // neutral_rate, smoothed against the lagged policy rate via per-member inertia.
  // Hawks (high inflation_coef) want higher rates when inflation > target; doves
  // (high output_coef) want lower rates when unemployment > natural.

  // SPEC-COMM-2: at steady state (gaps zero, lagged rate at neutral) → zero dissents.
  it("steady state → zero dissents", () => {
    const c = committeeOf([member("a"), member("b"), member("c")]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const result: FomcVote = vote(c, 0.05, state, PARAMS);
    expect(result.decided).toBe(0.05);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-3: with high inertia, even a large gap produces a modest preferred-rate
  // shift — empirical FOMC dots cluster within ~150bp at the 1-2y horizon.
  it("high inertia compresses the preferred-rate spread (empirical anchor: ~150bp at 1979 stress)", () => {
    // 1979 starting state stress: inflation 11.4%, unemp 5.8%, lagged rate 10.75%.
    const c = committeeOf([
      member("hawk", { inflation_coef: 2.0, output_coef: 0.3 }),
      member("dove", { inflation_coef: 1.4, output_coef: 0.6 }),
    ]);
    const state = macroState({ inflation: 0.114, unemployment: 0.058, policy_rate: 0.1075 });
    const { previews } = previewVote(c, 0.1075, state, PARAMS);
    const [hawkPref, dovePref] = [previews[0]!.preferred, previews[1]!.preferred];
    const spread = hawkPref - dovePref;
    // Empirical FOMC spread at the 1-2y horizon is ~150bp; tolerate up to 250bp for
    // a regime-change moment like 1979. The old trichotomy produced ~15pp here.
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThan(0.025);
  });

  // SPEC-COMM-2: members within dissent_tolerance of the proposed rate vote yes.
  it("proposing the median-member-preferred rate produces zero dissents in a balanced committee", () => {
    const c = committeeOf([member("a"), member("b"), member("c")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.05, policy_rate: 0.06 });
    // Member preferred = 0.88 * 0.06 + 0.12 * (0.05 + 1.7 * 0.03 - 0.4 * 0.01)
    //                  = 0.0528 + 0.12 * 0.097 = 0.0528 + 0.01164 = 0.06444
    const result = vote(c, 0.0645, state, PARAMS);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-2: proposing the lagged rate at a moment when state demands a meaningful
  // change → most members dissent because their preferred has moved.
  it("proposing the lagged rate in a high-inflation moment produces some dissents", () => {
    const c = committeeOf([member("a"), member("b"), member("c"), member("d")]);
    // Inflation 6pp above target, output gap near zero, lagged 5%.
    // Each member's preferred ≈ 0.88 * 0.05 + 0.12 * (0.05 + 1.7 * 0.06 - 0.4 * 0) = 0.044 + 0.018 = 0.062
    // |0.062 - 0.05| = 0.012 > tol(0.005) → all dissent.
    const state = macroState({ inflation: 0.08, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, PARAMS);
    expect(result.dissents).toBe(4);
  });

  // SPEC-COMM-2: integration smoke — dissents feed applyMeetingOutcome and reduce credibility.
  it("dissents from vote reduce credibility when passed to applyMeetingOutcome", () => {
    const c = committeeOf([member("a"), member("b"), member("c")]);
    const state = macroState({ inflation: 0.10, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, PARAMS);
    const next = applyMeetingOutcome(70, { dissents: result.dissents, surprisedMarkets: false, onTarget: false });
    expect(result.dissents).toBeGreaterThan(0);
    expect(next).toBeLessThan(70);
  });

  // SPEC-COMM-2: vote is pure — input state not mutated.
  it("vote does not mutate the input state", () => {
    const c = committeeOf([member("a"), member("b")]);
    const state = macroState({ inflation: 0.08, unemployment: 0.06, policy_rate: 0.05 });
    const before = { ...state.vars };
    vote(c, 0.08, state, PARAMS);
    expect(state.vars).toEqual(before);
  });

  // SPEC-COMM-2: dissent boundary is strict > (not ≥). We probe both sides with
  // values comfortably inside vs outside tolerance to avoid float-equality fragility.
  it("boundary: member just inside tolerance does NOT dissent; just outside DOES", () => {
    // proposed = 0.05; lagged_rate = 0.05; gap_inflation = 0.01; gap_unemployment = 0.
    // preferred - proposed = (1 - inertia) * (inflation_coef * gap_inflation)
    //                      = 0.12 * inflation_coef * 0.01
    // tolerance = 0.005 → critical inflation_coef ≈ 4.17.
    // Use 3.5 (clearly inside) and 5.0 (clearly outside).
    const inside = committeeOf([member("a", { inflation_coef: 3.5 })]);
    const outside = committeeOf([member("a", { inflation_coef: 5.0 })]);
    const state = macroState({ inflation: 0.03, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(inside, 0.05, state, PARAMS).dissents).toBe(0);
    expect(vote(outside, 0.05, state, PARAMS).dissents).toBe(1);
  });

  // SPEC-COMM-2: missing required vars throws (no silent default-to-zero).
  it("throws VoteMissingVarError when state.vars.inflation is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { unemployment: 0.04, policy_rate: 0.05 } });
    expect(() => vote(c, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when state.vars.unemployment is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { inflation: 0.02, policy_rate: 0.05 } });
    expect(() => vote(c, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-3: lagged rate is now a required input (inertia term reads it).
  it("throws VoteMissingVarError when state.vars.policy_rate is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    expect(() => vote(c, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-2: production callers resolve params via loadCommitteeParams() against committed content.
  it("vote with params from loadCommitteeParams() works end-to-end against committed content", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, loadCommitteeParams());
    expect(result.decided).toBe(0.05);
  });

  // SPEC-COMM-2: NaN / Infinity guards.
  it("throws VoteMissingVarError when inflation is NaN", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: NaN, unemployment: 0.04 });
    expect(() => vote(c, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when unemployment is Infinity", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: Infinity });
    expect(() => vote(c, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws when proposedRate is NaN", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.04 });
    expect(() => vote(c, NaN, state, PARAMS)).toThrow(/proposedRate .* not finite/);
  });

  it("previewVote throws when proposedRate is Infinity", () => {
    // SPEC-COMM-3: symmetric guard with NaN — both are non-finite.
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.04 });
    expect(() => previewVote(c, Infinity, state, PARAMS)).toThrow(/proposedRate .* not finite/);
  });

  // SPEC-COMM-3 / negotiation: moving proposed toward a member's preferred reduces their dissent gap linearly.
  // This is the player-facing behaviour: the Chair can negotiate.
  it("moving proposed toward a member's preferred makes them stop dissenting", () => {
    // Pick a state with a sizable inflation gap so a hawk's preferred is well above lagged.
    const c = committeeOf([member("hawk", { inflation_coef: 2.0, output_coef: 0.3 })]);
    const state = macroState({ inflation: 0.10, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS);
    const hawkPref = previews[0]!.preferred;
    // At proposed = lagged, hawk dissents.
    expect(vote(c, 0.05, state, PARAMS).dissents).toBe(1);
    // At proposed = hawk preferred, no dissent.
    expect(vote(c, hawkPref, state, PARAMS).dissents).toBe(0);
  });

  // SPEC-COMM-3: previewVote surfaces per-member detail for UIs.
  it("previewVote returns one entry per committee member with the same preferred values vote() uses internally", () => {
    const c = committeeOf([
      member("hawk", { inflation_coef: 2.0, output_coef: 0.3 }),
      member("dove", { inflation_coef: 1.4, output_coef: 0.6 }),
    ]);
    const state = macroState({ inflation: 0.06, unemployment: 0.05, policy_rate: 0.05 });
    const { previews, gapInflation, gapUnemployment } = previewVote(c, 0.05, state, PARAMS);
    expect(previews).toHaveLength(2);
    expect(gapInflation).toBeCloseTo(0.04, 10);
    expect(gapUnemployment).toBeCloseTo(0.01, 10);
    // Hawk preferred > Dove preferred when inflation is above target.
    expect(previews[0]!.preferred).toBeGreaterThan(previews[1]!.preferred);
  });

  // SPEC-PARAMS-1: loaded committee params include all required CommitteeParams fields.
  it("loadCommitteeParams() returns a CommitteeParams object with all required fields finite", () => {
    const params = loadCommitteeParams();
    expect(Number.isFinite(params.dissent_tolerance)).toBe(true);
    expect(Number.isFinite(params.neutral_rate)).toBe(true);
    expect(Number.isFinite(params.target_inflation)).toBe(true);
    expect(Number.isFinite(params.target_unemployment)).toBe(true);
  });
});
