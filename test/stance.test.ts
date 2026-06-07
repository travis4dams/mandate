import { describe, it, expect } from "vitest";
import { applyIntermeetingDrift, stanceKey } from "../src/engine/stance";
import { previewVote, vote } from "../src/engine/fomc";
import { makeState } from "../src/engine/state";
import { Session } from "../src/engine/session";
import type { Committee, CommitteeMember } from "../src/content/committees";
import type { CommitteeParams } from "../src/engine/fomc";

// SPEC-COMM-6

const PARAMS: CommitteeParams = {
  neutral_rate: 0.05,
  target_inflation: 0.02,
  target_unemployment: 0.04,
  conviction_band_factor: 0.8,
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
    conviction: 0.5,
    ...overrides,
  };
}

function committeeOf(members: CommitteeMember[]): Committee {
  return { id: "comm.test", name: "comm.test.name", desc: "comm.test.desc", members };
}

function macroState(opts: { inflation: number; unemployment: number; policy_rate?: number; stances?: Record<string, number> }) {
  return makeState({
    vars: {
      inflation: opts.inflation,
      unemployment: opts.unemployment,
      policy_rate: opts.policy_rate ?? 0.05,
      ...(opts.stances ?? {}),
    },
  });
}

describe("applyIntermeetingDrift", () => {
  // SPEC-COMM-6: pure function, no mutation
  it("returns a new state object (pure — input not mutated)", () => {
    const m = member("a");
    const c = committeeOf([m]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04 });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result).not.toBe(state);
    expect(result.vars).not.toBe(state.vars);
  });

  // SPEC-COMM-6: stance key follows stance.<memberId> convention
  it("writes stance to state.vars[stanceKey(memberId)]", () => {
    const m = member("a");
    const c = committeeOf([m]);
    const state = macroState({ inflation: 0.02, unemployment: 0.04, policy_rate: 0.05 });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(typeof result.vars[stanceKey(m.id)]).toBe("number");
    expect(Number.isFinite(result.vars[stanceKey(m.id)])).toBe(true);
  });

  // SPEC-COMM-6: cold-start falls back to policy_rate as lagged anchor
  it("on first call (no stored stance) falls back to policy_rate as lagged anchor", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    const policyRate = 0.07;
    const inflation = 0.02;
    const unemployment = 0.04;
    const state = macroState({ inflation, unemployment, policy_rate: policyRate });
    const result = applyIntermeetingDrift(state, c, PARAMS);

    const gapI = inflation - PARAMS.target_inflation; // 0
    const gapU = unemployment - PARAMS.target_unemployment; // 0
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU; // 0.05
    const expected = m.inertia * policyRate + (1 - m.inertia) * taylor;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(expected, 10);
  });

  // SPEC-COMM-6: uses stored stance as lagged anchor on subsequent calls
  it("uses stored stance as lagged anchor when present", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    const prevStance = 0.09;
    const state = macroState({
      inflation: 0.02,
      unemployment: 0.04,
      policy_rate: 0.07,
      stances: { [stanceKey(m.id)]: prevStance },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);

    const gapI = 0.02 - PARAMS.target_inflation;
    const gapU = 0.04 - PARAMS.target_unemployment;
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU;
    const expected = m.inertia * prevStance + (1 - m.inertia) * taylor;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(expected, 10);
  });

  // SPEC-COMM-6: more inflation-sensitive member drifts more when inflation rises
  it("higher inflation_coef member's stance moves more with rising inflation", () => {
    const mHawk = member("hawk", { inflation_coef: 2.0, output_coef: 0.3, inertia: 0.88 });
    const mDove = member("dove", { inflation_coef: 1.4, output_coef: 0.3, inertia: 0.88 });
    const c = committeeOf([mHawk, mDove]);
    const prevStance = 0.05; // both start at same stance
    const risingInflation = 0.08; // well above target
    const state = macroState({
      inflation: risingInflation,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: {
        [stanceKey(mHawk.id)]: prevStance,
        [stanceKey(mDove.id)]: prevStance,
      },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    const hawkNew = result.vars[stanceKey(mHawk.id)] as number;
    const doveNew = result.vars[stanceKey(mDove.id)] as number;
    // Both move up (inflation above target), hawk more so
    expect(hawkNew).toBeGreaterThan(prevStance);
    expect(doveNew).toBeGreaterThan(prevStance);
    expect(hawkNew).toBeGreaterThan(doveNew);
  });

  // SPEC-COMM-6: near steady state produces negligible drift
  it("near steady state (gaps ~0, stance near Taylor) produces negligible drift", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    // At steady state: inflation=target, unemp=natural → gapI=0, gapU=0 → taylor=neutral_rate
    const steadyStance = PARAMS.neutral_rate;
    const state = macroState({
      inflation: PARAMS.target_inflation,
      unemployment: PARAMS.target_unemployment,
      policy_rate: PARAMS.neutral_rate,
      stances: { [stanceKey(m.id)]: steadyStance },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    const newStance = result.vars[stanceKey(m.id)] as number;
    // Expected: inertia * steadyStance + (1-inertia) * neutral_rate = steadyStance (no drift)
    expect(Math.abs(newStance - steadyStance)).toBeLessThan(1e-10);
  });

  // SPEC-COMM-6: multiple members get independent stances
  it("each member gets their own stance key", () => {
    const mA = member("a", { inflation_coef: 2.0 });
    const mB = member("b", { inflation_coef: 1.4 });
    const c = committeeOf([mA, mB]);
    const state = macroState({ inflation: 0.06, unemployment: 0.04, policy_rate: 0.05 });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result.vars[stanceKey(mA.id)]).toBeDefined();
    expect(result.vars[stanceKey(mB.id)]).toBeDefined();
    expect(result.vars[stanceKey(mA.id)]).not.toBe(result.vars[stanceKey(mB.id)]);
  });

  // SPEC-COMM-6: returns state unchanged when required vars are missing
  it("returns state unchanged when inflation is missing", () => {
    const m = member("a");
    const c = committeeOf([m]);
    const state = makeState({ vars: { unemployment: 0.04, policy_rate: 0.05 } });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result).toBe(state);
  });

  it("returns state unchanged when unemployment is missing", () => {
    const m = member("a");
    const c = committeeOf([m]);
    const state = makeState({ vars: { inflation: 0.02, policy_rate: 0.05 } });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result).toBe(state);
  });

  it("returns state unchanged when policy_rate is missing (cold-start needs it)", () => {
    const m = member("a");
    const c = committeeOf([m]);
    const state = makeState({ vars: { inflation: 0.02, unemployment: 0.04 } });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result).toBe(state);
  });

  // SPEC-COMM-6: NaN stance falls back to policy_rate (guards corrupt state)
  it("NaN stored stance falls back to policy_rate", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    const state = macroState({
      inflation: 0.02,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: NaN },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    // Should behave like cold start (uses policy_rate=0.05)
    const gapI = 0.02 - PARAMS.target_inflation;
    const gapU = 0.04 - PARAMS.target_unemployment;
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU;
    const expected = m.inertia * 0.05 + (1 - m.inertia) * taylor;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(expected, 10);
  });

  // SPEC-COMM-6: +Infinity stored stance falls back to policy_rate (guards corrupt state)
  it("+Infinity stored stance falls back to policy_rate", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    const state = macroState({
      inflation: 0.02,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: Infinity },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    const gapI = 0.02 - PARAMS.target_inflation;
    const gapU = 0.04 - PARAMS.target_unemployment;
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU;
    const expected = m.inertia * 0.05 + (1 - m.inertia) * taylor;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(expected, 10);
  });

  // SPEC-COMM-6: -Infinity stored stance falls back to policy_rate (guards corrupt state)
  it("-Infinity stored stance falls back to policy_rate", () => {
    const m = member("a", { inertia: 0.88 });
    const c = committeeOf([m]);
    const state = macroState({
      inflation: 0.02,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: -Infinity },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    const gapI = 0.02 - PARAMS.target_inflation;
    const gapU = 0.04 - PARAMS.target_unemployment;
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU;
    const expected = m.inertia * 0.05 + (1 - m.inertia) * taylor;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(expected, 10);
  });

  // SPEC-COMM-6: inertia boundary — inertia=0 means full Taylor snap each step
  it("inertia=0 produces full Taylor snap (new stance equals Taylor target)", () => {
    const m = member("a", { inertia: 0, inflation_coef: 1.7, output_coef: 0.4 });
    const c = committeeOf([m]);
    const prevStance = 0.12;
    const state = macroState({
      inflation: 0.06,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: prevStance },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    const gapI = 0.06 - PARAMS.target_inflation;
    const gapU = 0.04 - PARAMS.target_unemployment;
    const taylor = PARAMS.neutral_rate + m.inflation_coef * gapI - m.output_coef * gapU;
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(taylor, 10);
  });

  // SPEC-COMM-6: inertia boundary — inertia=1 means no drift (stance frozen at previous value)
  it("inertia=1 produces no drift (stance frozen at previous value)", () => {
    const m = member("a", { inertia: 1, inflation_coef: 1.7, output_coef: 0.4 });
    const c = committeeOf([m]);
    const prevStance = 0.12;
    const state = macroState({
      inflation: 0.06,
      unemployment: 0.04,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: prevStance },
    });
    const result = applyIntermeetingDrift(state, c, PARAMS);
    expect(result.vars[stanceKey(m.id)]).toBeCloseTo(prevStance, 10);
  });
});

// SPEC-COMM-6
describe("Session.advance accumulates intermeeting stance (SPEC-COMM-6)", () => {
  it("stance.* vars are set on state after advance(1)", () => {
    // SPEC-COMM-6
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(1);
    const state = session.current;
    // At least one member should have a stance var set
    const stanceVars = Object.keys(state.vars).filter(k => k.startsWith("stance."));
    expect(stanceVars.length).toBeGreaterThan(0);
    // All stance vars should be finite numbers
    for (const key of stanceVars) {
      expect(Number.isFinite(state.vars[key] as number)).toBe(true);
    }
  });
});

describe("stanceKey format (SPEC-COMM-6)", () => {
  // SPEC-COMM-6: pin the key format — content and UI may construct it manually.
  it('stanceKey("member.chair") === "stance.member.chair"', () => {
    expect(stanceKey("member.chair")).toBe("stance.member.chair");
  });
});

describe("vote() dissent with stored stances (SPEC-COMM-6)", () => {
  // SPEC-COMM-6: vote() delegates to previewVote() which uses stored stance as anchor.
  it("vote() dissent count differs with stored stance vs. cold-start", () => {
    const m = member("x", { inertia: 0.88, compromise_band: 0.005 });
    const c = committeeOf([m]);
    const stateWithStance = macroState({
      inflation: PARAMS.target_inflation, unemployment: PARAMS.target_unemployment,
      policy_rate: 0.05, stances: { [stanceKey(m.id)]: 0.10 },
    });
    const stateWithoutStance = macroState({
      inflation: PARAMS.target_inflation, unemployment: PARAMS.target_unemployment, policy_rate: 0.05,
    });
    expect(vote(c, 0.05, stateWithoutStance, PARAMS, []).dissents).toBe(0);
    expect(vote(c, 0.05, stateWithStance, PARAMS, []).dissents).toBe(1);
  });
});

describe("previewVote — SPEC-COMM-6 stored-stance integration", () => {
  // SPEC-COMM-6: previewVote uses stored per-member stance as the lagged-rate anchor.
  it("member preferred rate shifts when stored stance differs from policy_rate", () => {
    // Stored stance 0.10 (hawkish drift) vs policy_rate 0.05 (cold anchor).
    // At target macro (gaps = 0), Taylor = neutral_rate = 0.05.
    // With stored stance: preferred = inertia*0.10 + (1-inertia)*0.05 > 0.05.
    // Without stored stance (cold): preferred = inertia*0.05 + (1-inertia)*0.05 = 0.05.
    const m = member("x", { inertia: 0.88, compromise_band: 0.005 });
    const c = committeeOf([m]);

    const stateWithStance = macroState({
      inflation: PARAMS.target_inflation,
      unemployment: PARAMS.target_unemployment,
      policy_rate: 0.05,
      stances: { [stanceKey(m.id)]: 0.10 },
    });
    const stateWithoutStance = macroState({
      inflation: PARAMS.target_inflation,
      unemployment: PARAMS.target_unemployment,
      policy_rate: 0.05,
    });

    const { previews: withStance } = previewVote(c, 0.05, stateWithStance, PARAMS, []);
    const { previews: withoutStance } = previewVote(c, 0.05, stateWithoutStance, PARAMS, []);

    // Cold-start: preferred should equal neutral_rate (0.05) since gaps are 0.
    expect(withoutStance[0].preferred).toBeCloseTo(0.05, 10);
    // Stored stance 0.10 pulls preferred above 0.05.
    expect(withStance[0].preferred).toBeGreaterThan(0.05);
    // With preferred > 0.05 and proposed = 0.05, member dissents.
    expect(withStance[0].wouldDissent).toBe(true);
    // Without stored stance, preferred == 0.05 == proposed, no dissent.
    expect(withoutStance[0].wouldDissent).toBe(false);
  });
});
