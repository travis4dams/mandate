import { describe, it, expect } from "vitest";
import { vote, type FomcVote, type CommitteeParams } from "../src/engine/fomc";
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
    // gap_inflation = 0.12 - 0.02 = 0.10; hawkish preferred = 0.05 + 1.5 * 0.10 = 0.20
    // |0.20 - 0.05| = 0.15 > 0.0075 → each hawk dissents; at least 5 dissents
    expect(result.dissents).toBeGreaterThanOrEqual(5);
  });

  // SPEC-COMM-2: dovish committee + high-rate proposal → many dissents
  it("dovish majority + high rate (high unemployment) → majority dissent", () => {
    // 5 dovish, 2 hawkish; unemployment well above natural → doves prefer lower rate → many dissents
    const committee = makeCommittee(["dovish", "dovish", "dovish", "dovish", "dovish", "hawkish", "hawkish"]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.10 } });
    const proposedRate = 0.15;

    const result: FomcVote = vote(committee, proposedRate, state, PARAMS);

    expect(result.decided).toBe(proposedRate);
    // gap_unemployment = 0.10 - 0.04 = 0.06; dovish preferred = 0.15 - 0.8 * 0.06 = 0.102
    // |0.102 - 0.15| = 0.048 > 0.0075 → each dove dissents; at least 5 dissents
    expect(result.dissents).toBeGreaterThanOrEqual(5);
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
});
