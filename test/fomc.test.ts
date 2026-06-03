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

afterEach(() => {
  // Reset module-level cache between tests so loadCommitteeParams() state never leaks.
  _resetCommitteeParamsCache();
});
import { applyMeetingOutcome } from "../src/engine/credibility";
import { makeState } from "../src/engine/state";
import type { Committee } from "../src/content/committees";

// SPEC-COMM-2

const PARAMS: CommitteeParams = {
  dissent_tolerance: 0.0075,
  hawkish_inflation_weight: 1.5,
  dovish_unemployment_weight: 0.8,
  neutral_blend: 0.5,
  neutral_rate: 0.05,
  target_inflation: 0.02,
  target_unemployment: 0.04,
};

function makeCommittee(leans: Array<"hawkish" | "dovish" | "neutral">): Committee {
  return {
    id: "comm.test",
    name: "comm.test.name",
    desc: "comm.test.desc",
    members: leans.map((lean, i) => ({
      id: `member.test_${i}`,
      name: `member.test_${i}.name`,
      lean,
      competence: 0.8,
    })),
  };
}

describe("vote", () => {
  // SPEC-COMM-2: hawkish committee + low-rate proposal → many dissents
  it("hawkish majority + low rate (high inflation) → majority dissent", () => {
    // 5 hawkish, 2 dovish; inflation well above target → hawks prefer higher rate → many dissents
    const committee = makeCommittee(["hawkish", "hawkish", "hawkish", "hawkish", "hawkish", "dovish", "dovish"]);
    const state = makeState({ vars: { inflation: 0.12, unemployment: 0.04 } });
    const proposedRate = 0.05;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);


    expect(result.decided).toBe(proposedRate);
    // gap_inflation = 0.12 - 0.02 = 0.10; hawkish preferred = 0.05 + 1.5 * 0.10 = 0.20 → dissents
    // dovish gap_unemployment = 0.04 - 0.04 = 0; dovish preferred = 0.05 - 0 = 0.05 → no dissent
    expect(result.dissents).toBe(5);
  });

  // SPEC-COMM-2: dovish committee + high-rate proposal → universal dissent
  it("dovish majority + high rate at target inflation → all 7 dissent (hawks want lower too)", () => {
    // 5 dovish, 2 hawkish; unemp well above natural, inflation at target.
    // With preferred = neutral_rate + adjustment (state-only, NOT proposal-relative),
    // a 15% rate is far above the hawks' preferred 5% AND far above the doves' preferred 0.2%.
    const committee = makeCommittee(["dovish", "dovish", "dovish", "dovish", "dovish", "hawkish", "hawkish"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.10 } });
    const proposedRate = 0.15;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);

    expect(result.decided).toBe(proposedRate);
    // gap_unemp = 0.06; dove preferred = 0.05 - 0.8 * 0.06 = 0.002 → |0.002 - 0.15| = 0.148 > tol → dissent
    // gap_inf = 0; hawk preferred = 0.05 → |0.05 - 0.15| = 0.10 > tol → dissent
    expect(result.dissents).toBe(7);
  });

  // SPEC-COMM-2: pure-neutral committee + proposal at neutral_rate with zero gaps → zero dissents
  it("neutral committee + rate at neutral with zero gaps → zero dissents", () => {
    // All neutral; gap_inflation = gap_unemployment = 0 → each neutral preferred = neutral_rate.
    // Chair proposes neutral_rate → |preferred - proposed| = 0 → no dissents.
    const committee = makeCommittee(["neutral", "neutral", "neutral", "neutral", "neutral"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    const proposedRate = 0.05;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);

    expect(result.decided).toBe(proposedRate);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-2: single-member hawkish + low rate → 1 dissent
  it("single hawkish member + low rate (high inflation) → 1 dissent", () => {
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { inflation: 0.12, unemployment: 0.04 } });
    const proposedRate = 0.05;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);

    expect(result.decided).toBe(proposedRate);
    expect(result.dissents).toBe(1);
  });

  // SPEC-COMM-2: integration smoke — dissents feed applyMeetingOutcome and reduce credibility
  it("dissents from vote reduce credibility when passed to applyMeetingOutcome", () => {
    const committee = makeCommittee(["hawkish", "hawkish", "hawkish"]);
    const state = makeState({ vars: { inflation: 0.12, unemployment: 0.04 } });
    const result: FomcVote = vote(committee, 0.05, state, PARAMS);

    const initialCredibility = 70;
    const nextCredibility = applyMeetingOutcome(initialCredibility, {
      dissents: result.dissents,
      surprisedMarkets: false,
      onTarget: false,
    });

    expect(result.dissents).toBeGreaterThan(0);
    expect(nextCredibility).toBeLessThan(initialCredibility);
  });

  // SPEC-COMM-2: vote is a pure function — state object not mutated
  it("vote does not mutate the input state", () => {
    const committee = makeCommittee(["hawkish", "dovish", "neutral"]);
    const state = makeState({ vars: { inflation: 0.08, unemployment: 0.06 } });
    const inflationBefore = state.vars.inflation;
    const unemploymentBefore = state.vars.unemployment;

    vote(committee, 0.08, state, PARAMS);

    expect(state.vars.inflation).toBe(inflationBefore);
    expect(state.vars.unemployment).toBe(unemploymentBefore);
  });

  // SPEC-COMM-2: dissent boundary is strict > (not >=); |delta| === tolerance must NOT dissent.
  it("boundary: |preferred - proposed| === dissent_tolerance does NOT count as a dissent", () => {
    // Tune so a hawkish member's |preferred - proposed| === dissent_tolerance exactly.
    // preferred = neutral_rate + hawkish_inflation_weight × gap_inflation
    // For |preferred - neutral_rate| = dissent_tolerance: gap_inflation = 0.0075 / 1.5 = 0.005
    // → inflation = target_inflation + 0.005 = 0.025. Chair proposes neutral_rate (0.05).
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { inflation: 0.025, unemployment: 0.04 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-2: missing required vars throws (no silent default-to-zero).
  it("throws VoteMissingVarError when state.vars.inflation is missing", () => {
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { unemployment: 0.04 } });
    expect(() => vote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when state.vars.unemployment is missing", () => {
    const committee = makeCommittee(["dovish"]);
    const state = makeState({ vars: { inflation: 0.02 } });
    expect(() => vote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-2: production callers resolve params via loadCommitteeParams() at the call site.
  it("vote with params from loadCommitteeParams() works end-to-end against committed content", () => {
    const committee = makeCommittee(["neutral", "neutral"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    const result = vote(committee, 0.05, state, loadCommitteeParams());
    expect(result.dissents).toBe(0);
    expect(result.decided).toBe(0.05);
  });

  // SPEC-COMM-2: neutral formula with non-zero gaps actually exercises neutral_blend and (1 - neutral_blend).
  it("neutral member with non-zero gaps applies neutral_blend on inflation and (1 - neutral_blend) on unemployment", () => {
    // gap_inflation = 0.08 - 0.02 = 0.06; gap_unemployment = 0.07 - 0.04 = 0.03
    // neutral preferred = neutral_rate + 0.5 * 0.06 - 0.5 * 0.03 = 0.05 + 0.030 - 0.015 = 0.065
    // Chair proposes neutral_rate (0.05); |0.065 - 0.05| = 0.015 > 0.0075 → dissent.
    const committee = makeCommittee(["neutral"]);
    const state = makeState({ vars: { inflation: 0.08, unemployment: 0.07 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(1);
  });

  // SPEC-COMM-2: dovish formula with NEGATIVE unemployment gap (tight labor market)
  // → dovish preferred rate goes ABOVE neutral_rate (rare but the sign must be right).
  it("dovish member with unemployment BELOW natural rate prefers a HIGHER rate (sign check)", () => {
    // gap_unemployment = 0.02 - 0.04 = -0.02 (tight market)
    // dovish preferred = neutral_rate - 0.8 * (-0.02) = 0.05 + 0.016 = 0.066
    // Chair proposes 0.05; |0.066 - 0.05| = 0.016 > 0.0075 → dissent.
    const committee = makeCommittee(["dovish"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.02 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(1);
  });

  // SPEC-COMM-2: mixed committee — verify all three lean branches fire independently in one vote().
  it("mixed committee with partial dissent counts per-lean members correctly", () => {
    // Chair proposes neutral_rate (0.05).
    // gap_inflation = 0.08 - 0.02 = 0.06; gap_unemployment = 0.07 - 0.04 = 0.03
    // hawkish preferred = 0.05 + 1.5 * 0.06 = 0.140 → |0.090| > tolerance → dissent
    // dovish preferred  = 0.05 - 0.8 * 0.03 = 0.026 → |0.024| > tolerance → dissent
    // neutral preferred = 0.05 + 0.5*0.06 - 0.5*0.03 = 0.065 → |0.015| > tolerance → dissent
    // All three dissent.
    const committee = makeCommittee(["hawkish", "dovish", "neutral"]);
    const state = makeState({ vars: { inflation: 0.08, unemployment: 0.07 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(3);

    // Now tune so only dovish + neutral dissent at proposed=neutral_rate:
    // gap_inflation = 0.0225 - 0.02 = 0.0025; gap_unemployment = 0.07 - 0.04 = 0.03
    // hawkish preferred = 0.05 + 1.5 * 0.0025 = 0.05375 → |0.00375| < tolerance → no
    // dovish preferred  = 0.05 - 0.8 * 0.03 = 0.026     → |0.024| > tolerance → yes
    // neutral preferred = 0.05 + 0.5*0.0025 - 0.5*0.03 = 0.03625 → |0.01375| > tolerance → yes
    // Expected: 2 dissents (dovish, neutral). Hawk does not dissent.
    const state2 = makeState({ vars: { inflation: 0.0225, unemployment: 0.07 } });
    const result2 = vote(committee, 0.05, state2, PARAMS);
    expect(result2.dissents).toBe(2);
  });

  // SPEC-COMM-2: Chair can MEET hawks halfway. Increasing the proposed rate toward
  // the hawks' preferred (which depends on state only, NOT on proposed) brings the
  // dissent gap down — the user-facing behavior that motivated state-only preferred.
  it("moving proposed toward hawkish-preferred reduces hawk dissent (negotiation mechanic)", () => {
    // Inflation 0.10, target 0.02 → gap 0.08. Hawk preferred = 0.05 + 1.5 * 0.08 = 0.17.
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { inflation: 0.10, unemployment: 0.04 } });
    // At proposed 0.05, gap is 0.12 — dissent.
    expect(vote(committee, 0.05, state, PARAMS).dissents).toBe(1);
    // At proposed 0.17 (the hawk's preferred), gap is 0 — no dissent.
    expect(vote(committee, 0.17, state, PARAMS).dissents).toBe(0);
  });

  // SPEC-COMM-2: NaN/Infinity guard — silent corruption attack surface closed.
  it("throws VoteMissingVarError when inflation is NaN", () => {
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { inflation: NaN, unemployment: 0.04 } });
    expect(() => vote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when unemployment is Infinity", () => {
    const committee = makeCommittee(["dovish"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: Infinity } });
    expect(() => vote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-COMM-2: NaN/Infinity proposedRate must throw (silent dissents=0 / decided=NaN is the same attack surface).
  it("throws when proposedRate is NaN", () => {
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { inflation: 0.05, unemployment: 0.04 } });
    expect(() => vote(committee, NaN, state, PARAMS)).toThrow(/proposedRate .* not finite/);
  });

  it("throws when proposedRate is Infinity", () => {
    const committee = makeCommittee(["dovish"]);
    const state = makeState({ vars: { inflation: 0.05, unemployment: 0.04 } });
    expect(() => vote(committee, Infinity, state, PARAMS)).toThrow(/proposedRate .* not finite/);
  });

  // SPEC-COMM-2: hawks must NOT respond to unemployment. Pass a large unemployment gap; hawkish member with zero inflation gap should still not dissent.
  it("hawkish formula ignores the unemployment gap (lean isolation)", () => {
    const committee = makeCommittee(["hawkish"]);
    // gap_inflation = 0; gap_unemployment = 0.20 (huge); a hawk should still NOT dissent
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.24 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(0);
  });

  // SPEC-COMM-2: doves must NOT respond to inflation. Pass a large inflation gap; dovish member with zero unemployment gap should still not dissent.
  it("dovish formula ignores the inflation gap (lean isolation)", () => {
    const committee = makeCommittee(["dovish"]);
    // gap_inflation = 0.20 (huge); gap_unemployment = 0; a dove should still NOT dissent
    const state = makeState({ vars: { inflation: 0.22, unemployment: 0.04 } });
    const result = vote(committee, 0.05, state, PARAMS);
    expect(result.dissents).toBe(0);
  });
});

describe("previewVote", () => {
  // SPEC-WEB-4: per-member preferred rates and wouldDissent match the vote() computation
  it("returns correct preferred rate and wouldDissent for each member", () => {
    // gap_inflation = 0.10; hawkish preferred = 0.05 + 1.5 * 0.10 = 0.20 → dissent
    // dovish: gap_unemp = 0; preferred = 0.05; |0.05 - 0.05| = 0 → no dissent
    const committee = makeCommittee(["hawkish", "dovish"]);
    const state = makeState({ vars: { inflation: 0.12, unemployment: 0.04 } });
    const result = previewVote(committee, 0.05, state, PARAMS);

    expect(result.previews).toHaveLength(2);
    expect(result.previews[0].lean).toBe("hawkish");
    expect(result.previews[0].preferred).toBeCloseTo(0.20, 10);
    expect(result.previews[0].wouldDissent).toBe(true);
    expect(result.previews[1].lean).toBe("dovish");
    expect(result.previews[1].preferred).toBeCloseTo(0.05, 10);
    expect(result.previews[1].wouldDissent).toBe(false);
  });

  // SPEC-WEB-4: gapInflation and gapUnemployment are relative to params targets
  it("exposes correct gap values relative to params targets", () => {
    const committee = makeCommittee(["neutral"]);
    const state = makeState({ vars: { inflation: 0.07, unemployment: 0.06 } });
    const result = previewVote(committee, 0.05, state, PARAMS);

    expect(result.gapInflation).toBeCloseTo(0.07 - PARAMS.target_inflation, 10);
    expect(result.gapUnemployment).toBeCloseTo(0.06 - PARAMS.target_unemployment, 10);
  });

  // SPEC-WEB-4: wouldDissent count matches the dissents from vote()
  it("wouldDissent count in previews matches vote() dissents", () => {
    const committee = makeCommittee(["hawkish", "hawkish", "dovish", "neutral"]);
    const state = makeState({ vars: { inflation: 0.12, unemployment: 0.04 } });
    const proposed = 0.05;

    const voteResult = vote(committee, proposed, state, PARAMS);
    const previewResult = previewVote(committee, proposed, state, PARAMS);

    const previewDissents = previewResult.previews.filter((p) => p.wouldDissent).length;
    expect(previewDissents).toBe(voteResult.dissents);
  });

  // SPEC-WEB-4: throws VoteMissingVarError for missing/non-finite state vars
  it("throws VoteMissingVarError when inflation is missing", () => {
    const committee = makeCommittee(["hawkish"]);
    const state = makeState({ vars: { unemployment: 0.04 } });
    expect(() => previewVote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when unemployment is missing", () => {
    const committee = makeCommittee(["dovish"]);
    const state = makeState({ vars: { inflation: 0.02 } });
    expect(() => previewVote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  it("throws VoteMissingVarError when inflation is NaN", () => {
    const committee = makeCommittee(["neutral"]);
    const state = makeState({ vars: { inflation: NaN, unemployment: 0.04 } });
    expect(() => previewVote(committee, 0.05, state, PARAMS)).toThrow(VoteMissingVarError);
  });

  // SPEC-WEB-4: throws for non-finite proposedRate
  it("throws when proposedRate is NaN", () => {
    const committee = makeCommittee(["neutral"]);
    const state = makeState({ vars: { inflation: 0.05, unemployment: 0.04 } });
    expect(() => previewVote(committee, NaN, state, PARAMS)).toThrow(/not finite/);
  });

  // SPEC-WEB-4: pure function — does not mutate input state
  it("does not mutate the input state", () => {
    const committee = makeCommittee(["hawkish", "dovish"]);
    const state = makeState({ vars: { inflation: 0.08, unemployment: 0.06 } });
    const inflationBefore = state.vars.inflation;
    previewVote(committee, 0.08, state, PARAMS);
    expect(state.vars.inflation).toBe(inflationBefore);
  });
});

describe("loadCommitteeParams", () => {
  // SPEC-COMM-2: loader returns content/engine/params.json#committee, lazy-cached.
  it("returns committee params with the 6 required fields populated", () => {
    _resetCommitteeParamsCache();
    const params = loadCommitteeParams();
    expect(typeof params.dissent_tolerance).toBe("number");
    expect(typeof params.hawkish_inflation_weight).toBe("number");
    expect(typeof params.dovish_unemployment_weight).toBe("number");
    expect(typeof params.neutral_blend).toBe("number");
    expect(typeof params.target_inflation).toBe("number");
    expect(typeof params.target_unemployment).toBe("number");
    expect(params.neutral_blend).toBeGreaterThanOrEqual(0);
    expect(params.neutral_blend).toBeLessThanOrEqual(1);
  });

  it("returns the same cached object on subsequent calls (lazy + cached)", () => {
    _resetCommitteeParamsCache();
    const a = loadCommitteeParams();
    const b = loadCommitteeParams();
    expect(b).toBe(a);
  });
});
