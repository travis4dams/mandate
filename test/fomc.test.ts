import { describe, it, expect, afterEach } from "vitest";
import {
  vote,
  previewVote,
  loadCommitteeParams,
  _resetCommitteeParamsCache,
  VoteMissingVarError,
  TraitNotFoundError,
  type FomcVote,
  type CommitteeParams,
} from "../src/engine/fomc";
import { applyMeetingOutcome } from "../src/engine/credibility";
import { makeState } from "../src/engine/state";
import type { Committee, CommitteeMember } from "../src/content/committees";
import type { TraitEntry } from "../src/content/traits";

afterEach(() => {
  _resetCommitteeParamsCache();
});

// SPEC-COMM-2 (vote) + SPEC-COMM-3 (per-member Taylor coefficients with inertia).

const PARAMS: CommitteeParams = {
  neutral_rate: 0.05,
  target_inflation: 0.02,
  target_unemployment: 0.04,
  conviction_band_factor: 0.8,
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
    compromise_band: 0.005,
    conviction: 0,   // 0 = no conviction narrowing; preserves pre-SPEC-COMM-5 band behaviour
    traits: [],
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
    const result: FomcVote = vote(c, 0.05, state, PARAMS, []);
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
    const { previews } = previewVote(c, 0.1075, state, PARAMS, []);
    const [hawkPref, dovePref] = [previews[0]!.preferred, previews[1]!.preferred];
    const spread = hawkPref - dovePref;
    // Empirical FOMC spread at the 1-2y horizon is ~150bp; tolerate up to 250bp for
    // a regime-change moment like 1979. The old trichotomy produced ~15pp here.
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThan(0.025);
  });

  // SPEC-COMM-2: members whose preferred is within their own compromise_band vote yes.
  it("proposing a rate near each member's preferred produces zero dissents in a balanced committee", () => {
    const c = committeeOf([member("a"), member("b"), member("c")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.05, policy_rate: 0.06 });
    // Member preferred = 0.88 * 0.06 + 0.12 * (0.05 + 1.7 * 0.03 - 0.4 * 0.01)
    //                  = 0.0528 + 0.12 * 0.097 = 0.0528 + 0.01164 = 0.06444
    // Proposing 0.0645 → |0.06444 - 0.0645| ≈ 0.00006 < compromise_band(0.005) → no dissent.
    const result = vote(c, 0.0645, state, PARAMS, []);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-2: proposing the lagged rate at a moment when state demands a meaningful
  // change → most members dissent because their preferred has moved.
  it("proposing the lagged rate in a high-inflation moment produces some dissents", () => {
    const c = committeeOf([member("a"), member("b"), member("c"), member("d")]);
    // Inflation 6pp above target, output gap near zero, lagged 5%.
    // Each member's preferred ≈ 0.88 * 0.05 + 0.12 * (0.05 + 1.7 * 0.06 - 0.4 * 0) = 0.044 + 0.018 = 0.062
    // |0.062 - 0.05| = 0.012 > compromise_band(0.005) → all dissent.
    const state = macroState({ inflation: 0.08, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, PARAMS, []);
    expect(result.dissents).toBe(4);
  });

  // SPEC-COMM-2 / SPEC-CRED-1 (issue #33): the vote surfaces a dissent count for the briefing,
  // but dissents are NOT published in a way that damages the Chair — applyMeetingOutcome no
  // longer takes a dissent count, so a split vote leaves credibility unchanged.
  it("dissents are surfaced by the vote but do not reduce credibility", () => {
    const c = committeeOf([member("a"), member("b"), member("c")]);
    const state = macroState({ inflation: 0.10, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, PARAMS, []);
    const next = applyMeetingOutcome(70, { surprisedMarkets: false, onTarget: false });
    expect(result.dissents).toBeGreaterThan(0);
    expect(next).toBe(70);
  });

  // SPEC-COMM-2: vote is pure — input state not mutated.
  it("vote does not mutate the input state", () => {
    const c = committeeOf([member("a"), member("b")]);
    const state = macroState({ inflation: 0.08, unemployment: 0.06, policy_rate: 0.05 });
    const before = { ...state.vars };
    vote(c, 0.08, state, PARAMS, []);
    expect(state.vars).toEqual(before);
  });

  // SPEC-COMM-2: dissent boundary is strict > (not ≥). We probe both sides with
  // values comfortably inside vs outside tolerance to avoid float-equality fragility.
  it("boundary: member just inside tolerance does NOT dissent; just outside DOES", () => {
    // proposed = 0.05; lagged_rate = 0.05; gap_inflation = 0.01; gap_unemployment = 0.
    // preferred - proposed = (1 - inertia) * (inflation_coef * gap_inflation)
    //                      = 0.12 * inflation_coef * 0.01
    // member's compromise_band = 0.005 → critical inflation_coef ≈ 4.17.
    // Use 3.5 (clearly inside) and 5.0 (clearly outside).
    const inside = committeeOf([member("a", { inflation_coef: 3.5 })]);
    const outside = committeeOf([member("a", { inflation_coef: 5.0 })]);
    const state = macroState({ inflation: 0.03, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(inside, 0.05, state, PARAMS, []).dissents).toBe(0);
    expect(vote(outside, 0.05, state, PARAMS, []).dissents).toBe(1);
  });

  // SPEC-COMM-2: missing required vars throws (no silent default-to-zero).
  it("throws VoteMissingVarError when state.vars.inflation is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { unemployment: 0.04, policy_rate: 0.05 } });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when state.vars.unemployment is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { inflation: 0.02, policy_rate: 0.05 } });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-3: lagged rate is now a required input (inertia term reads it).
  it("throws VoteMissingVarError when state.vars.policy_rate is missing", () => {
    const c = committeeOf([member("a")]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-2: production callers resolve params via loadCommitteeParams() against committed content.
  it("vote with params from loadCommitteeParams() works end-to-end against committed content", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const result = vote(c, 0.05, state, loadCommitteeParams(), []);
    expect(result.decided).toBe(0.05);
  });

  // SPEC-COMM-2: NaN / Infinity guards.
  it("throws VoteMissingVarError when inflation is NaN", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: NaN, unemployment: 0.04 });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when unemployment is Infinity", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: Infinity });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(VoteMissingVarError);
  });

  it("throws when proposedRate is NaN", () => {
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.04 });
    expect(() => vote(c, NaN, state, PARAMS, [])).toThrow(/proposedRate .* not finite/);
  });

  it("previewVote throws when proposedRate is Infinity", () => {
    // SPEC-COMM-2: symmetric guard with NaN — both non-finite proposedRates throw.
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.05, unemployment: 0.04 });
    expect(() => previewVote(c, Infinity, state, PARAMS, [])).toThrow(/proposedRate .* not finite/);
  });

  // SPEC-COMM-3 / negotiation: moving proposed toward a member's preferred reduces their dissent gap linearly.
  // This is the player-facing behaviour: the Chair can negotiate.
  it("moving proposed toward a member's preferred makes them stop dissenting", () => {
    // Pick a state with a sizable inflation gap so a hawk's preferred is well above lagged.
    const c = committeeOf([member("hawk", { inflation_coef: 2.0, output_coef: 0.3 })]);
    const state = macroState({ inflation: 0.10, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS, []);
    const hawkPref = previews[0]!.preferred;
    // At proposed = lagged, hawk dissents.
    expect(vote(c, 0.05, state, PARAMS, []).dissents).toBe(1);
    // At proposed = hawk preferred, no dissent.
    expect(vote(c, hawkPref, state, PARAMS, []).dissents).toBe(0);
  });

  // SPEC-COMM-3: previewVote surfaces per-member detail for UIs.
  it("previewVote returns one entry per committee member with the same preferred values vote() uses internally", () => {
    const c = committeeOf([
      member("hawk", { inflation_coef: 2.0, output_coef: 0.3 }),
      member("dove", { inflation_coef: 1.4, output_coef: 0.6 }),
    ]);
    const state = macroState({ inflation: 0.06, unemployment: 0.05, policy_rate: 0.05 });
    const { previews, gapInflation, gapUnemployment } = previewVote(c, 0.05, state, PARAMS, []);
    expect(previews).toHaveLength(2);
    expect(gapInflation).toBeCloseTo(0.04, 10);
    expect(gapUnemployment).toBeCloseTo(0.01, 10);
    // Hawk preferred > Dove preferred when inflation is above target.
    expect(previews[0]!.preferred).toBeGreaterThan(previews[1]!.preferred);
  });

  // SPEC-PARAMS-1: loaded committee params include all required CommitteeParams fields.
  it("loadCommitteeParams() returns a CommitteeParams object with all required fields finite", () => {
    const params = loadCommitteeParams();
    expect(Number.isFinite(params.neutral_rate)).toBe(true);
    expect(Number.isFinite(params.target_inflation)).toBe(true);
    expect(Number.isFinite(params.target_unemployment)).toBe(true);
  });

  // SPEC-COMM-4: per-member compromise band — narrow band dissents where wide band accepts.
  it("SPEC-COMM-4: narrow-band member dissents at a distance that wide-band member accepts", () => {
    // At steady state (inflation=target, unemp=natural, lagged=neutral):
    // preferred = neutral_rate = 0.05 for all members.
    // Proposed 0.057 → |0.05 - 0.057| = 0.007
    // narrow (0.003): 0.007 > 0.003 → dissent
    // wide (0.010):   0.007 < 0.010 → no dissent
    const c = committeeOf([
      member("narrow", { compromise_band: 0.003 }),
      member("wide", { compromise_band: 0.010 }),
    ]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.057, state, PARAMS, []);
    expect(previews[0]!.wouldDissent).toBe(true);   // narrow band
    expect(previews[1]!.wouldDissent).toBe(false);  // wide band
    const result = vote(c, 0.057, state, PARAMS, []);
    expect(result.dissents).toBe(1);
  });

  // SPEC-COMM-4: heterogeneous committee — mixed bands produce the correct aggregate count.
  it("SPEC-COMM-4: heterogeneous band committee produces correct aggregate dissent count", () => {
    // 4 members: narrow (0.003), narrow (0.003), medium (0.010), wide (0.020)
    // At steady state, all preferred = 0.05. Proposed = 0.057 → |diff| = 0.007.
    // narrow×2: 0.007 > 0.003 → dissent; medium: 0.007 < 0.010 → assent; wide: assent.
    const c = committeeOf([
      member("n1", { compromise_band: 0.003 }),
      member("n2", { compromise_band: 0.003 }),
      member("m1", { compromise_band: 0.010 }),
      member("w1", { compromise_band: 0.020 }),
    ]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(c, 0.057, state, PARAMS, []).dissents).toBe(2);
  });

  // SPEC-COMM-4: invalid compromise_band throws rather than silently making member always assent/dissent.
  it("SPEC-COMM-4: previewVote throws when a member has NaN compromise_band", () => {
    const c = committeeOf([member("a", { compromise_band: NaN })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(/invalid compromise_band/);
  });

  it("SPEC-COMM-4: vote() throws when a member has NaN compromise_band", () => {
    const c = committeeOf([member("a", { compromise_band: NaN })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => vote(c, 0.05, state, PARAMS, [])).toThrow(/invalid compromise_band/);
  });

  it("SPEC-COMM-4: previewVote throws when a member has negative compromise_band", () => {
    const c = committeeOf([member("a", { compromise_band: -0.001 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(/invalid compromise_band/);
  });

  it("SPEC-COMM-4: previewVote throws when compromise_band exceeds maximum (0.5)", () => {
    const c = committeeOf([member("a", { compromise_band: 5.0 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(/invalid compromise_band/);
  });

  // SPEC-COMM-4: backward-compatibility — uniform bands equal to old global default reproduce prior behavior.
  it("SPEC-COMM-4: uniform 0.005 bands reproduce prior dissent count (backward-compat regression)", () => {
    // All members use the old global default (0.005 = 50bp). Behavior must match the pre-SPEC-COMM-4 world.
    // Inflation 6pp above target; each member's preferred ≈ 0.062; |0.062 - 0.05| = 0.012 > 0.005 → all dissent.
    const c = committeeOf([member("a"), member("b"), member("c"), member("d")]);
    const state = macroState({ inflation: 0.08, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(c, 0.05, state, PARAMS, []).dissents).toBe(4);
  });

  // SPEC-COMM-5: conviction narrows the effective band — high conviction dissents at a distance
  // that low conviction accepts.
  it("SPEC-COMM-5: high-conviction member dissents at distance that low-conviction member accepts", () => {
    // Both members: compromise_band = 0.010, conviction_band_factor = 0.8.
    // high conviction 0.9: effective = 0.010 * (1 - 0.9 * 0.8) = 0.010 * 0.28 = 0.0028
    // low conviction 0.1:  effective = 0.010 * (1 - 0.1 * 0.8) = 0.010 * 0.92 = 0.0092
    // At steady state preferred = 0.05; proposed = 0.057 → diff = 0.007.
    // high: 0.007 > 0.0028 → dissent; low: 0.007 < 0.0092 → assent.
    const c = committeeOf([
      member("high_conv", { compromise_band: 0.010, conviction: 0.9 }),
      member("low_conv",  { compromise_band: 0.010, conviction: 0.1 }),
    ]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.057, state, PARAMS, []);
    expect(previews[0]!.wouldDissent).toBe(true);   // high conviction
    expect(previews[1]!.wouldDissent).toBe(false);  // low conviction
    expect(vote(c, 0.057, state, PARAMS, []).dissents).toBe(1);
  });

  // SPEC-COMM-5: zero conviction leaves the band unmodified (backward-compat with pre-SPEC-COMM-5).
  it("SPEC-COMM-5: conviction=0 leaves effective band equal to compromise_band", () => {
    const c = committeeOf([member("a", { compromise_band: 0.010, conviction: 0 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    // diff = 0.007 < 0.010 → no dissent (same as if conviction didn't exist).
    expect(vote(c, 0.057, state, PARAMS, []).dissents).toBe(0);
  });

  // SPEC-COMM-5: hawkish-lean trait shifts preferred rate up by the declared amount.
  it("SPEC-COMM-5: hawkish-lean trait shifts preferred rate up by the trait's declared amount", () => {
    // SPEC-COMM-5
    const hawkishLean: TraitEntry = {
      id: "trait.hawkish_lean",
      name: "trait.hawkish_lean.name",
      desc: "trait.hawkish_lean.desc",
      effects: { preferred_rate_shift: 0.005 },
    };
    const withTrait = member("tagged", { traits: ["trait.hawkish_lean"] });
    const plain    = member("plain");
    const c = committeeOf([withTrait, plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS, [hawkishLean]);
    // tagged preferred = base + 0.005; plain preferred = base.
    expect(previews[0]!.preferred - previews[1]!.preferred).toBeCloseTo(0.005, 10);
  });

  // SPEC-COMM-5: dovish-lean trait shifts preferred rate down.
  it("SPEC-COMM-5: dovish-lean trait shifts preferred rate down by the trait's declared amount", () => {
    // SPEC-COMM-5
    const dovishLean: TraitEntry = {
      id: "trait.dovish_lean",
      name: "trait.dovish_lean.name",
      desc: "trait.dovish_lean.desc",
      effects: { preferred_rate_shift: -0.005 },
    };
    const withTrait = member("tagged", { traits: ["trait.dovish_lean"] });
    const plain    = member("plain");
    const c = committeeOf([withTrait, plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS, [dovishLean]);
    expect(previews[1]!.preferred - previews[0]!.preferred).toBeCloseTo(0.005, 10);
  });

  // SPEC-COMM-5: trait with band_modifier narrows the effective band.
  it("SPEC-COMM-5: principled-dissenter trait narrows effective band via band_modifier", () => {
    // SPEC-COMM-5
    const dissenterTrait: TraitEntry = {
      id: "trait.principled_dissenter",
      name: "trait.principled_dissenter.name",
      desc: "trait.principled_dissenter.desc",
      effects: { band_modifier: -0.3 },
    };
    // compromise_band = 0.010, conviction = 0 (no conviction narrowing).
    // Without trait: effective = 0.010. With trait: effective = 0.010 * (1 + (-0.3)) = 0.007.
    // diff = 0.008 → no dissent without trait; dissent with trait.
    const withTrait = member("tagged", { compromise_band: 0.010, conviction: 0, traits: ["trait.principled_dissenter"] });
    const plain    = member("plain",  { compromise_band: 0.010, conviction: 0 });
    const cWith  = committeeOf([withTrait]);
    const cPlain = committeeOf([plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(cWith,  0.058, state, PARAMS, [dissenterTrait]).dissents).toBe(1);
    expect(vote(cPlain, 0.058, state, PARAMS, []).dissents).toBe(0);
  });

  // SPEC-COMM-5: previewVote throws TraitNotFoundError when a member references an unknown trait.
  it("SPEC-COMM-5: previewVote throws TraitNotFoundError for unknown trait id", () => {
    const c = committeeOf([member("a", { traits: ["trait.nonexistent"] })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(TraitNotFoundError);
  });

  // SPEC-COMM-5: previewVote throws for invalid conviction value.
  it("SPEC-COMM-5: previewVote throws when a member has NaN conviction", () => {
    const c = committeeOf([member("a", { conviction: NaN })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(/invalid conviction/);
  });

  it("SPEC-COMM-5: previewVote throws when a member has conviction > 1", () => {
    const c = committeeOf([member("a", { conviction: 1.5 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [])).toThrow(/invalid conviction/);
  });

  // SPEC-COMM-5: Math.max(0,...) floor — conviction=1 + conviction_band_factor=1.0 drives
  // effectiveBand to exactly 0, meaning any non-zero distance produces a dissent.
  it("SPEC-COMM-5: effectiveBand floors at 0 when conviction=1 and conviction_band_factor=1", () => {
    // SPEC-COMM-5
    // effectiveBand = Math.max(0, compromise_band * (1 - 1.0 * 1.0) * (1 + 0)) = Math.max(0, 0) = 0.
    // Any non-zero |preferred - proposed| > 0 → dissent.
    const params: CommitteeParams = { ...PARAMS, conviction_band_factor: 1.0 };
    const c = committeeOf([member("max_conv", { compromise_band: 0.010, conviction: 1.0 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    // At steady state preferred = 0.05. Propose 0.0501 → tiny diff but > 0 → dissents.
    expect(vote(c, 0.0501, state, params, []).dissents).toBe(1);
    // Proposing exactly the preferred rate (0.05) → diff = 0 → no dissent.
    expect(vote(c, 0.05, state, params, []).dissents).toBe(0);
  });

  // SPEC-COMM-5: combined conviction + lean — both effects apply simultaneously.
  it("SPEC-COMM-5: conviction narrows band AND lean shifts preferred when both present", () => {
    // SPEC-COMM-5
    const hawkishLean: TraitEntry = {
      id: "trait.hawkish_lean",
      name: "trait.hawkish_lean.name",
      desc: "trait.hawkish_lean.desc",
      effects: { preferred_rate_shift: 0.010 },
    };
    // conviction=0.9: effectiveBand = 0.010 * (1 - 0.9 * 0.8) = 0.010 * 0.28 = 0.0028.
    // preferred shifts up by 0.010 from lean.
    // At steady state base preferred = 0.05; shifted = 0.060.
    // Proposed = 0.05; diff = 0.010 > effectiveBand (0.0028) → dissent.
    const m = member("hawk_conv", { compromise_band: 0.010, conviction: 0.9, traits: ["trait.hawkish_lean"] });
    const plain = member("plain", { compromise_band: 0.010, conviction: 0.9 });
    const c = committeeOf([m]);
    const cPlain = committeeOf([plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS, [hawkishLean]);
    const { previews: plainPreviews } = previewVote(cPlain, 0.05, state, PARAMS, []);
    // Lean shifts preferred up by ~0.010 relative to plain member with same conviction.
    expect(previews[0]!.preferred - plainPreviews[0]!.preferred).toBeCloseTo(0.010, 10);
    // Band is also narrowed by conviction — so the shifted member dissents.
    expect(previews[0]!.wouldDissent).toBe(true);
  });

  // SPEC-COMM-5: multiple traits on one member — leanShift accumulates via += across both.
  it("SPEC-COMM-5: two lean traits on one member accumulate leanShift additively", () => {
    // SPEC-COMM-5
    const leanA: TraitEntry = {
      id: "trait.lean_a",
      name: "trait.lean_a.name",
      desc: "trait.lean_a.desc",
      effects: { preferred_rate_shift: 0.005 },
    };
    const leanB: TraitEntry = {
      id: "trait.lean_b",
      name: "trait.lean_b.name",
      desc: "trait.lean_b.desc",
      effects: { preferred_rate_shift: 0.003 },
    };
    // Total lean shift = 0.005 + 0.003 = 0.008.
    const m = member("multi_lean", { traits: ["trait.lean_a", "trait.lean_b"] });
    const plain = member("plain");
    const c = committeeOf([m, plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.05, state, PARAMS, [leanA, leanB]);
    expect(previews[0]!.preferred - previews[1]!.preferred).toBeCloseTo(0.008, 10);
  });

  // SPEC-COMM-5: vote() with lean catalog — dissent count reflects lean-shifted preferred rates.
  it("SPEC-COMM-5: vote() dissent count reflects lean-shifted preferred rates", () => {
    // SPEC-COMM-5
    const dovishLean: TraitEntry = {
      id: "trait.dovish_lean",
      name: "trait.dovish_lean.name",
      desc: "trait.dovish_lean.desc",
      effects: { preferred_rate_shift: -0.020 },
    };
    // At steady state base preferred = 0.05. With dovish lean, preferred ≈ 0.030.
    // Proposed = 0.05; |0.030 - 0.05| = 0.020 > compromise_band (0.005) → dissent.
    // Without trait, |0.05 - 0.05| = 0 → no dissent.
    const withTrait = member("dove_lean", { traits: ["trait.dovish_lean"] });
    const cWith = committeeOf([withTrait]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(vote(cWith, 0.05, state, PARAMS, [dovishLean]).dissents).toBe(1);
    // Get the actual shifted preferred rate and confirm proposing it clears the dissent.
    const { previews } = previewVote(cWith, 0.05, state, PARAMS, [dovishLean]);
    const shiftedPref = previews[0]!.preferred;
    expect(vote(cWith, shiftedPref, state, PARAMS, [dovishLean]).dissents).toBe(0);
  });

  // SPEC-COMM-5: conviction_band_factor guard — NaN and out-of-range values throw.
  it("SPEC-COMM-5: previewVote throws for NaN conviction_band_factor", () => {
    // SPEC-COMM-5
    const params: CommitteeParams = { ...PARAMS, conviction_band_factor: NaN };
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, params, [])).toThrow(/invalid conviction_band_factor/);
  });

  it("SPEC-COMM-5: previewVote throws for conviction_band_factor greater than 1", () => {
    // SPEC-COMM-5
    const params: CommitteeParams = { ...PARAMS, conviction_band_factor: 1.5 };
    const c = committeeOf([member("a")]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, params, [])).toThrow(/invalid conviction_band_factor/);
  });

  // SPEC-COMM-5: stacked band_modifiers ≤ -1 throw to protect effectiveBand from sign flip.
  it("SPEC-COMM-5: previewVote throws when stacked band_modifiers sum to ≤ -1", () => {
    // SPEC-COMM-5
    // Combined bandMod = -0.6 + (-0.6) = -1.2; 1 + bandMod = -0.2 ≤ 0 → should throw.
    const traitA: TraitEntry = {
      id: "trait.extreme_narrower_a",
      name: "trait.extreme_narrower_a.name",
      desc: "trait.extreme_narrower_a.desc",
      effects: { band_modifier: -0.6 },
    };
    const traitB: TraitEntry = {
      id: "trait.extreme_narrower_b",
      name: "trait.extreme_narrower_b.name",
      desc: "trait.extreme_narrower_b.desc",
      effects: { band_modifier: -0.6 },
    };
    const c = committeeOf([member("a", { traits: ["trait.extreme_narrower_a", "trait.extreme_narrower_b"] })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    expect(() => previewVote(c, 0.05, state, PARAMS, [traitA, traitB])).toThrow(/band_modifier sum/);
  });

  // SPEC-COMM-5 item 6a: effect-free trait (effects: {}) behaves like no trait —
  // preferred and wouldDissent are unchanged vs an untagged member.
  it("SPEC-COMM-5: effect-free trait leaves preferred rate and wouldDissent unchanged", () => {
    // SPEC-COMM-5
    const noopTrait: TraitEntry = {
      id: "trait.noop",
      name: "trait.noop.name",
      desc: "trait.noop.desc",
      effects: {},
    };
    const tagged = member("tagged", { traits: ["trait.noop"] });
    const plain  = member("plain");
    const c = committeeOf([tagged, plain]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const { previews } = previewVote(c, 0.057, state, PARAMS, [noopTrait]);
    // preferred rates must be identical (zero lean shift).
    expect(previews[0]!.preferred).toBeCloseTo(previews[1]!.preferred, 10);
    // dissent decision must be identical (zero band modification).
    expect(previews[0]!.wouldDissent).toBe(previews[1]!.wouldDissent);
  });

  // SPEC-COMM-5 item 6b: conviction_band_factor = 0 disables conviction narrowing —
  // member behaves as if conviction = 0 regardless of actual conviction value.
  it("SPEC-COMM-5: conviction_band_factor=0 disables conviction narrowing (behaves like conviction=0)", () => {
    // SPEC-COMM-5
    // effectiveBand = compromise_band * (1 - conviction * 0) * (1 + 0) = compromise_band.
    // With factor=0 even conviction=1 leaves the band at its full width (0.010).
    // diff = |0.05 - 0.057| = 0.007 < 0.010 → no dissent.
    const params: CommitteeParams = { ...PARAMS, conviction_band_factor: 0 };
    const c = committeeOf([member("max_conv", { compromise_band: 0.010, conviction: 1.0 })]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    // No dissent — band fully open despite conviction=1.
    expect(vote(c, 0.057, state, params, []).dissents).toBe(0);
    // Same result as the conviction=0 baseline (band unmodified).
    const paramsConv0: CommitteeParams = { ...PARAMS, conviction_band_factor: 0 };
    const cConv0 = committeeOf([member("zero_conv", { compromise_band: 0.010, conviction: 0 })]);
    expect(vote(cConv0, 0.057, state, paramsConv0, []).dissents).toBe(0);
  });
});
