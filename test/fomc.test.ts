import { describe, it, expect } from "vitest";
import {
  vote,
  loadCommitteeParams,
  _resetCommitteeParamsCache,
  VoteMissingVarError,
  type FomcVote,
  type CommitteeParams,
} from "../src/engine/fomc";
import { applyMeetingOutcome } from "../src/engine/credibility";
import { makeState } from "../src/engine/state";
import type { Committee } from "../src/content/committees";

// SPEC-COMM-2

const PARAMS: CommitteeParams = {
  dissent_tolerance: 0.0075,
  hawkish_inflation_weight: 1.5,
  dovish_unemployment_weight: 0.8,
  neutral_blend: 0.5,
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

  // SPEC-COMM-2: dovish committee + high-rate proposal → many dissents
  it("dovish majority + high rate (high unemployment) → majority dissent", () => {
    // 5 dovish, 2 hawkish; unemployment well above natural → doves prefer lower rate → many dissents
    const committee = makeCommittee(["dovish", "dovish", "dovish", "dovish", "dovish", "hawkish", "hawkish"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.10 } });
    const proposedRate = 0.15;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);


    expect(result.decided).toBe(proposedRate);
    // gap_unemployment = 0.10 - 0.04 = 0.06; dovish preferred = 0.15 - 0.8 * 0.06 = 0.102 → dissents
    // hawkish gap_inflation = 0.02 - 0.02 = 0; hawkish preferred = 0.15 → no dissent
    expect(result.dissents).toBe(5);
  });

  // SPEC-COMM-2: pure-neutral committee + proposal at implied Taylor target → zero dissents
  it("neutral committee + rate matching implied target → zero dissents", () => {
    // All neutral; state tuned so gap_inflation = 0 and gap_unemployment = 0
    // → each neutral preferred = proposedRate + 0 - 0 = proposedRate → 0 dissents
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
    // preferred - proposed = hawkish_inflation_weight * gap_inflation
    // Setting gap_inflation = dissent_tolerance / hawkish_inflation_weight = 0.0075 / 1.5 = 0.005
    // → inflation = target_inflation + 0.005 = 0.025
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

  // SPEC-COMM-2: optional params default to loadCommitteeParams() — production callers can omit.
  it("vote with no params argument resolves them from content via loadCommitteeParams()", () => {
    _resetCommitteeParamsCache();
    const committee = makeCommittee(["neutral", "neutral"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    // Should not throw; gaps are zero so neutrals don't dissent regardless of content values
    const result = vote(committee, 0.05, state);
    expect(result.dissents).toBe(0);
    expect(result.decided).toBe(0.05);
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
