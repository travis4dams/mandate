import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { Session, NotMeetingMonthError, marketsSurprised } from "../src/engine/session.js";
import type { ForwardGuidanceStance } from "../src/engine/session.js";
import * as mandateModule from "../src/engine/mandate.js";
import * as stanceModule from "../src/engine/stance.js";
import { stanceKey } from "../src/engine/stance.js";
import { computeVoteSpread, loadDotPlotParams } from "../src/engine/dot-plot.js";

// SPEC-SESSION-0

describe("Session.fromScenario", () => {
  // SPEC-SESSION-0: factory returns session with 1 initial trajectory entry at the scenario date.
  it("trajectory.length === 1 and current.date === '1979-08' after fromScenario", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.trajectory.length).toBe(1);
    expect(s.current.date).toBe("1979-08");
  });

  // SPEC-SESSION-0: determinism — two sessions from same scenario + seed produce identical trajectories after 12 advances.
  it("two sessions from same scenario + seed produce deep-equal trajectories after advance(12)", () => {
    const a = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const b = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    a.advance(12);
    b.advance(12);
    expect(a.trajectory).toEqual(b.trajectory);
  });
});

describe("Session getter identity stability", () => {
  // SPEC-SESSION-0: consecutive reads with no mutation return the same === reference.
  it("s.current === s.current with no mutation (referentially stable)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.current).toBe(s.current);
  });

  it("s.trajectory === s.trajectory with no mutation (referentially stable)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.trajectory).toBe(s.trajectory);
  });

  // SPEC-SESSION-0: after advance(1), both current and trajectory references CHANGE.
  it("after advance(1) both current and trajectory references change", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const prevCurrent = s.current;
    const prevTrajectory = s.trajectory;
    s.advance(1);
    expect(s.current).not.toBe(prevCurrent);
    expect(s.trajectory).not.toBe(prevTrajectory);
  });
});

describe("Session.advance integration", () => {
  // SPEC-SESSION-0: 12-month advance produces trajectory of length 13, final date 1980-08.
  it("advance(12) → trajectory.length === 13, current.date === '1980-08'", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(12);
    expect(s.trajectory.length).toBe(13);
    expect(s.current.date).toBe("1980-08");
  });

  // SPEC-SESSION-0: advance with non-positive months throws.
  it("advance(0) throws", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.advance(0)).toThrow();
  });

  it("advance(-1) throws", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.advance(-1)).toThrow();
  });

  // SPEC-SESSION-0: non-integer months must throw, not silently truncate to floor.
  it("advance(1.5) throws", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.advance(1.5)).toThrow();
  });
});

describe("SPEC-COMM-6: stance drift wired into Session.advance()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // SPEC-COMM-6: after advance(1), at least one member's stance var must exist and differ from
  // the cold-start policy_rate — confirming applyIntermeetingDrift is called each month.
  // Removing the applyIntermeetingDrift call from session.ts would leave all stance.* vars absent.
  it("after advance(1) a stance.* var is present and has drifted from the initial policy_rate", () => {
    // SPEC-COMM-6
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const initialRate = s.current.vars.policy_rate as number;
    s.advance(1);
    // At least one member should have a stored stance after one advance
    const stanceVars = Object.keys(s.current.vars).filter((k) => k.startsWith("stance."));
    expect(stanceVars.length).toBeGreaterThan(0);
    // The 1979 scenario starts far from steady state — stances drift from the policy_rate anchor
    const firstStance = s.current.vars[stanceVars[0]] as number;
    expect(Number.isFinite(firstStance)).toBe(true);
    expect(firstStance).not.toBe(initialRate);
  });

  // SPEC-COMM-6: advance() throws when applyIntermeetingDrift returns the same reference (no-op),
  // and rolls back session state so the caller sees no partial mutation.
  it("advance() throws and rolls back when applyIntermeetingDrift returns the same reference", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const stateBefore = s.current;
    const trajectoryLengthBefore = s.trajectory.length;

    // Force applyIntermeetingDrift to return its input unchanged (simulates the missing-vars no-op).
    vi.spyOn(stanceModule, "applyIntermeetingDrift").mockImplementationOnce((state) => state);

    expect(() => s.advance(1)).toThrow(/applyIntermeetingDrift skipped/);
    // State and trajectory must be rolled back to the pre-advance checkpoint.
    // current is a new snapshot object (rebuilt by _rebuildCaches), so use deep equality.
    expect(s.current).toStrictEqual(stateBefore);
    expect(s.trajectory.length).toBe(trajectoryLengthBefore);
  });
});

describe("Session.reset correctness", () => {
  // SPEC-SESSION-0: reset() restores trajectory.length to 1 and current.date to scenario start.
  it("after advance(3); reset() → trajectory.length === 1, current.date === '1979-08'", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(3);
    s.reset();
    expect(s.trajectory.length).toBe(1);
    expect(s.current.date).toBe("1979-08");
  });

  // SPEC-SESSION-1: reset() must also restore meeting-eligibility — after advancing to a
  // non-meeting month and resetting, isMeetingMonth() should be true again because the
  // initial scenario date (1979-08) is a meeting month.
  it("after advance into a non-meeting month then reset(), isMeetingMonth() returns to true", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(2); // 1979-08 -> 1979-10 (non-meeting)
    expect(s.isMeetingMonth()).toBe(false);
    s.reset();
    expect(s.current.date).toBe("1979-08");
    expect(s.isMeetingMonth()).toBe(true);
  });

  // SPEC-COMM-6
  it("stance.* vars are absent from state after reset()", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(3);
    expect(Object.keys(s.current.vars).some((k) => k.startsWith("stance."))).toBe(true);
    s.reset();
    expect(Object.keys(s.current.vars).some((k) => k.startsWith("stance."))).toBe(false);
  });
});

describe("Session.proposeRate guards", () => {
  // SPEC-SESSION-0: non-finite rate throws (mirrors vote's existing guard).
  it("proposeRate(NaN) throws", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.proposeRate(NaN)).toThrow();
  });

  it("proposeRate(Infinity) throws", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.proposeRate(Infinity)).toThrow();
  });

  // SPEC-SESSION-0: current.vars.policy_rate reflects the decided rate after proposeRate.
  it("current.vars.policy_rate reflects decided rate after proposeRate(0.15)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.15);
    expect(s.current.vars.policy_rate).toBe(0.15);
  });

  // SPEC-SESSION-0: proposeRate returns a FomcVote with the decided rate and dissent count.
  it("proposeRate(0.15) returns FomcVote with decided === 0.15 and a finite dissent count", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const vote = s.proposeRate(0.15);
    expect(vote.decided).toBe(0.15);
    expect(Number.isInteger(vote.dissents)).toBe(true);
    expect(vote.dissents).toBeGreaterThanOrEqual(0);
  });

  // SPEC-SESSION-1: meeting-month gate runs BEFORE finite-rate check.
  // Calling proposeRate(NaN) from a non-meeting month must surface as NotMeetingMonthError,
  // not the generic finite-rate Error — swapping the two guards would change the observable
  // error type silently.
  it("proposeRate(NaN) from a non-meeting month throws NotMeetingMonthError (not the finite-rate Error)", async () => {
    const { NotMeetingMonthError } = await import("../src/engine/session.js");
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(2); // 1979-08 -> 1979-10, October is NOT a meeting month
    expect(s.isMeetingMonth()).toBe(false);
    expect(() => s.proposeRate(NaN)).toThrow(NotMeetingMonthError);
  });

  // SPEC-SESSION-1: proposeRate works at a meeting month later in the schedule, not only
  // at the initial 1979-08. Without this a regression that only checked the initial state
  // would pass all existing tests.
  it("proposeRate(0.12) succeeds at 1979-11 (later meeting month)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(3); // 1979-08 -> 1979-11
    expect(s.current.date).toBe("1979-11");
    expect(s.isMeetingMonth()).toBe(true);
    const vote = s.proposeRate(0.12);
    expect(vote.decided).toBe(0.12);
  });

  // SPEC-COMM-6
  it("proposeRate() preserves stance.* vars", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(1);
    const stanceKeysBefore = Object.keys(s.current.vars).filter((k) => k.startsWith("stance."));
    expect(stanceKeysBefore.length).toBeGreaterThan(0);
    const stanceBefore = Object.fromEntries(stanceKeysBefore.map((k) => [k, s.current.vars[k]]));
    s.proposeRate(s.current.vars.policy_rate as number);
    for (const k of stanceKeysBefore) {
      expect(s.current.vars[k]).toBe(stanceBefore[k]);
    }
  });
});

describe("Session.subscribe protocol", () => {
  // SPEC-SESSION-0: listener fires on advance, not on getter reads.
  it("listener does not fire on s.current or s.trajectory reads", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    void s.current;
    void s.trajectory;
    expect(listener).not.toHaveBeenCalled();
  });

  // SPEC-SESSION-0: listener fires once on advance(1).
  it("listener fires once on advance(1)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.advance(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: a 3-month advance fires the listener once, not three times.
  // Guards against the natural mistake of putting _notifyListeners inside the per-month loop.
  it("listener fires exactly once on advance(3) (not per-month)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.advance(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: two independently-subscribed listeners both fire on a mutation.
  it("two listeners both fire on advance(1)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    s.advance(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: a listener that throws must not starve subsequent listeners.
  // The mutator should still re-throw, but every listener must see the notification.
  it("throwing listener does not starve later listeners; error surfaces to caller", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const a = vi.fn(() => { throw new Error("a"); });
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    expect(() => s.advance(1)).toThrow();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on proposeRate.
  it("listener fires on proposeRate(0.10)", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.proposeRate(0.10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on reset.
  it("listener fires on reset()", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(3);
    const listener = vi.fn();
    s.subscribe(listener);
    s.reset();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on setForwardGuidanceStance.
  it("listener fires on setForwardGuidanceStance('hawkish')", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.setForwardGuidanceStance("hawkish");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0 contract: setForwardGuidanceStance does NOT write into state.vars.
  // The numeric encoding belongs to the future forward-guidance spec, not SESSION-0.
  it("setForwardGuidanceStance does not expose stance via state.vars", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("hawkish");
    expect("forward_guidance_stance" in s.current.vars).toBe(false);
    s.setForwardGuidanceStance("dovish");
    expect("forward_guidance_stance" in s.current.vars).toBe(false);
  });

  // SPEC-SESSION-0: unsubscribe works — subsequent mutations do not fire the removed listener.
  it("unsubscribe: returned function prevents further listener calls", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    unsub();
    s.advance(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Session.fromReplay", () => {
  // SPEC-SESSION-0: fromReplay then advance(89) → trajectory.length === 90, policy_rate reflects last action.
  it("advance(89) after fromReplay → 90 entries, final policy_rate reflects replay actions", () => {
    const s = Session.fromReplay("replay.1979_chair_tightening", 42, "comm.fomc_1979");
    s.advance(89);
    expect(s.trajectory.length).toBe(90);
    // The replay's last action before month 89 is "1986-12" → policy_rate 0.0691.
    // The replay scenario starts at 1979-08; 89 months lands at 1987-01 (beyond last action).
    // Final policy_rate in trajectory should reflect the last applied replay action.
    const lastRate = s.trajectory[s.trajectory.length - 1].vars.policy_rate;
    expect(lastRate).toBe(0.0691);
  });
});

describe("ForwardGuidanceStance type", () => {
  // SPEC-SESSION-0: stance type is a string union; setForwardGuidanceStance accepts all three values.
  it("setForwardGuidanceStance accepts hawkish, dovish, and neutral without throwing", () => {
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const stances: ForwardGuidanceStance[] = ["hawkish", "dovish", "neutral"];
    for (const stance of stances) {
      expect(() => s.setForwardGuidanceStance(stance)).not.toThrow();
    }
  });
});

describe("SPEC-GUIDE-1: the stance scales expectations re-anchoring inside Session.advance()", () => {
  // SPEC-GUIDE-1 / SPEC-CRED-4: after advance(1), expectations evolve. The 1979 scenario starts
  // with low credibility (25), so expectations are mostly adaptive and track realized inflation
  // (0.114 > anchor 0.090) — the anchor rises slightly rather than snapping or drifting by a
  // fixed step. The binary spiral is gone.
  it("after advance(1), expectations_anchor moves (adaptive tracking at low credibility)", () => {
    // SPEC-GUIDE-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.current.vars.expectations_anchor).toBe(0.090);
    s.advance(1);
    expect(s.current.vars.expectations_anchor).toBeGreaterThan(0.090);
    expect(s.current.vars.expectations_anchor).toBeLessThan(0.092);
  });

  // SPEC-GUIDE-1: the stance scales the re-anchoring pull, which is active at any credibility
  // (weighted by credibility/100). Hawkish pulls expectations toward target harder than neutral,
  // so even at the low 1979 credibility a hawkish stance leaves the anchor lower than neutral.
  it("hawkish leaves expectations_anchor lower (more re-anchored) than neutral after advance(1)", () => {
    // SPEC-GUIDE-1
    const hawk = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const neutral = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    hawk.setForwardGuidanceStance("hawkish");
    neutral.setForwardGuidanceStance("neutral");
    hawk.advance(1);
    neutral.advance(1);
    expect(hawk.current.vars.expectations_anchor).toBeLessThan(neutral.current.vars.expectations_anchor);
  });

  // SPEC-GUIDE-1: in a high-credibility state (scen.recovery_test, credibility=80) the
  // re-anchoring pull dominates and the stance multiplier scales how fast expectations close
  // on target: hawkish fastest, dovish slowest. All three move the anchor toward target (0.02).
  it("stance multiplier orders the re-anchoring speed: hawkish < neutral < dovish (closer to target)", () => {
    // SPEC-GUIDE-1
    const make = (stance: ForwardGuidanceStance) => {
      const s = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979");
      s.setForwardGuidanceStance(stance);
      s.advance(1);
      return s.current.vars.expectations_anchor;
    };
    const hawk = make("hawkish");
    const neutral = make("neutral");
    const dovish = make("dovish");

    // Anchor starts at 0.05, above target — re-anchoring lowers it; hawkish lowers it most.
    expect(hawk).toBeLessThan(neutral);
    expect(neutral).toBeLessThan(dovish);
    expect(dovish).toBeLessThan(0.05);
    expect(hawk).toBeGreaterThan(0.02);
  });

  // SPEC-GUIDE-1: reset() restores the stance to "neutral" so a fresh game is not contaminated
  // by a prior setForwardGuidanceStance call — a reset-after-hawkish session advances identically
  // to a fresh neutral session.
  it("reset() restores stance to 'neutral'", () => {
    // SPEC-GUIDE-1
    const s = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("hawkish");
    s.reset();
    s.advance(1);
    const neutral = Session.fromScenario("scen.recovery_test", 42, "comm.fomc_1979");
    neutral.advance(1);
    expect(s.current.vars.expectations_anchor).toBe(neutral.current.vars.expectations_anchor);
  });
});

describe("SPEC-GUIDE-2: marketsSurprised pure function", () => {
  const TOL = 0.0025;

  it("hawkish stance is surprised by an easing but not by a hold or a hike", () => {
    // SPEC-GUIDE-2
    expect(marketsSurprised("hawkish", 0.10, 0.08, TOL)).toBe(true); // cut after guiding up
    expect(marketsSurprised("hawkish", 0.10, 0.10, TOL)).toBe(false); // hold
    expect(marketsSurprised("hawkish", 0.10, 0.13, TOL)).toBe(false); // hike
  });

  it("dovish stance is surprised by a tightening but not by a hold or a cut", () => {
    // SPEC-GUIDE-2
    expect(marketsSurprised("dovish", 0.10, 0.13, TOL)).toBe(true); // hike after guiding down
    expect(marketsSurprised("dovish", 0.10, 0.10, TOL)).toBe(false); // hold
    expect(marketsSurprised("dovish", 0.10, 0.08, TOL)).toBe(false); // cut
  });

  it("neutral stance is surprised by any move beyond the tolerance, in either direction", () => {
    // SPEC-GUIDE-2
    expect(marketsSurprised("neutral", 0.10, 0.13, TOL)).toBe(true); // hike
    expect(marketsSurprised("neutral", 0.10, 0.08, TOL)).toBe(true); // cut
    expect(marketsSurprised("neutral", 0.10, 0.10, TOL)).toBe(false); // hold
  });

  it("a move strictly within the tolerance band never surprises", () => {
    // SPEC-GUIDE-2: a sub-tolerance move (here half the band) is consistent with any stance.
    const within = TOL / 2;
    expect(marketsSurprised("neutral", 0.10, 0.10 + within, TOL)).toBe(false);
    expect(marketsSurprised("hawkish", 0.10, 0.10 - within, TOL)).toBe(false);
    expect(marketsSurprised("dovish", 0.10, 0.10 + within, TOL)).toBe(false);
  });

  it("a move of exactly the tolerance does NOT surprise (strict-inequality boundary)", () => {
    // SPEC-GUIDE-2: pins `<`/`>` (not `<=`/`>=`) so a refactor swapping them would fail here.
    // Binary-exact values (0.5/1.0/1.5) so the boundary equality is precise, not float noise.
    const tol = 0.5;
    expect(marketsSurprised("hawkish", 1.0, 0.5, tol)).toBe(false); // delta === -tol
    expect(marketsSurprised("dovish", 1.0, 1.5, tol)).toBe(false); // delta === +tol
    expect(marketsSurprised("neutral", 1.0, 1.5, tol)).toBe(false); // |delta| === tol
    expect(marketsSurprised("neutral", 1.0, 0.5, tol)).toBe(false); // |delta| === tol
  });
});

describe("SPEC-GUIDE-2: surprise lever wired into Session.proposeRate()", () => {
  // 1979-08 is a meeting month; starting policy_rate 0.1075, credibility 25, inflation 0.114
  // (so onTarget is false and the +3 lever never fires — isolating the surprise lever).
  it("a cut after hawkish guidance surprises markets and costs 5 credibility", () => {
    // SPEC-GUIDE-2
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("hawkish");
    expect(s.current.vars.credibility).toBe(25);
    s.proposeRate(0.09); // easing after guiding hawkish → surprise
    expect(s.current.vars.credibility).toBe(20); // 25 - 5
  });

  it("a hike after hawkish guidance is consistent — no surprise, credibility unchanged", () => {
    // SPEC-GUIDE-2
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("hawkish");
    s.proposeRate(0.13); // hiking after guiding hawkish → consistent
    expect(s.current.vars.credibility).toBe(25);
  });

  it("a hike after dovish guidance surprises markets and costs 5 credibility", () => {
    // SPEC-GUIDE-2
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("dovish");
    s.proposeRate(0.13); // tightening after guiding dovish → surprise
    expect(s.current.vars.credibility).toBe(20);
  });

  it("holding the rate under neutral guidance does not surprise markets", () => {
    // SPEC-GUIDE-2
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075); // unchanged, neutral default → no surprise
    expect(s.current.vars.credibility).toBe(25);
  });

  it("reset() restores credibility after a surprise penalty", () => {
    // SPEC-GUIDE-2 / SPEC-SESSION-0: the surprise penalty must not persist into _initialState.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.setForwardGuidanceStance("hawkish");
    s.proposeRate(0.09); // surprise → credibility 25 → 20
    expect(s.current.vars.credibility).toBe(20);
    s.reset();
    expect(s.current.vars.credibility).toBe(25); // restored to scenario start
  });
});

describe("SPEC-GUIDE-3: forward guidance stance is a persisted commitment", () => {
  // 1979-08 is a meeting month, so the scenario starts with proposeRate available.
  // Next meeting month is 1979-09 (meeting_months = [1,3,5,7,8,9,11,12]).

  it("advance() commits the live stance as committedGuidanceStance", () => {
    // SPEC-GUIDE-3
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075); // clear initial meeting (neutral, hold)
    s.setForwardGuidanceStance("hawkish");
    s.advance(1); // → 1979-09, commits committedGuidanceStance = "hawkish"
    expect(s.committedGuidanceStance).toBe("hawkish");
  });

  it("switching stance after advance() but before proposeRate() does not dodge the surprise penalty", () => {
    // SPEC-GUIDE-3: committed stance is "hawkish" from advance(); flipping to "dovish" afterward
    // cannot prevent the surprise when the player proposes a big cut.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075); // clear initial meeting (neutral, hold)
    s.setForwardGuidanceStance("hawkish");
    s.advance(1); // → 1979-09; guidance_stance = "hawkish" committed

    const credBefore = s.current.vars.credibility as number;
    s.setForwardGuidanceStance("dovish"); // attempt to dodge — too late
    s.proposeRate(0.09); // easing contradicts committed hawkish → surprise
    expect(s.current.vars.credibility).toBe(credBefore - 5);
  });

  it("setting stance after advance() (without further advance) leaves committed stance unchanged", () => {
    // SPEC-GUIDE-3: committed stance from advance() is "neutral"; setting hawkish after
    // does not affect the committed value, so a subsequent propose reads committed = "neutral".
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075); // clear initial meeting (neutral, hold; credibility unchanged)
    s.advance(1); // → 1979-09; committed = "neutral"
    s.setForwardGuidanceStance("hawkish"); // set hawkish AFTER advance, NO further advance

    expect(s.committedGuidanceStance).toBe("neutral");

    // A large hike surprises neutral (|0.13 - rate| > 0.0025) but NOT hawkish.
    // If proposeRate() used live "hawkish" instead of committed "neutral", credibility
    // would be unchanged. Using committed "neutral" it must drop by exactly 5.
    const credBefore = s.current.vars.credibility as number;
    s.proposeRate(0.13);
    expect(s.current.vars.credibility).toBe(credBefore - 5);
  });

  it("reset() clears committedGuidanceStance back to the live stance", () => {
    // SPEC-GUIDE-3: reset() returns the session to pre-advance state; committedGuidanceStance
    // must fall through to the live stance ("neutral") not retain the stale committed value.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.proposeRate(0.1075);
    s.setForwardGuidanceStance("hawkish");
    s.advance(1); // committedGuidanceStance = "hawkish"
    s.reset();
    expect(s.committedGuidanceStance).toBe("neutral");
  });
});

describe("SPEC-SIM-5: macro dynamics wired into Session.advance()", () => {
  // SPEC-SIM-5: holding the 1979 starting rate (10.75% nominal) is NOT real-restrictive against
  // ~9-11% expected inflation — the real rate is below neutral, so it does not cause a recession.
  // Over 24 months unemployment eases below its 0.058 start rather than rising. This is the core
  // realism fix: the slice-1 nominal-gap model wrongly drove unemployment up from any rate > 5%.
  it("after advance(24) at a non-restrictive nominal rate, unemployment does NOT rise into a recession", () => {
    // SPEC-SIM-5
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.current.vars.unemployment).toBe(0.058);
    s.advance(24);
    expect(s.current.vars.unemployment).toBeLessThan(0.058);
  });

  // SPEC-SIM-5: with policy not real-restrictive and credibility low, expectations track realized
  // inflation upward and the (negative) unemployment gap pushes inflation higher — a wage-price
  // overheating. Mean inflation over many seeds rises above the 0.114 start. The canary for sign
  // errors: a backwards real-rate channel would instead disinflate here.
  // SPEC-LAG-1: the distributed-lag kernel delays the effect ~6 months, so 36 months gives
  // the stimulus time to fully build up in the output_gap history before inflation accelerates.
  // SPEC-SHOCK-1: supply shocks are stochastic (sigma=0.003/month), so any single seed may
  // produce a final inflation slightly above or below 0.114. The directional canary therefore
  // asserts on the mean across 20 independent seeds rather than a single draw.
  it("after advance(36), mean inflation over 20 seeds accelerates above initial 0.114 (loose policy lets it run)", () => {
    // SPEC-SIM-5 / SPEC-LAG-1
    const INITIAL_INFLATION = 0.114;
    const NUM_SEEDS = 20;
    let total = 0;
    for (let seed = 0; seed < NUM_SEEDS; seed++) {
      const s = Session.fromScenario("scen.1979_stagflation", seed, "comm.fomc_1979");
      expect(s.current.vars.inflation).toBe(INITIAL_INFLATION);
      s.advance(36);
      total += s.current.vars.inflation as number;
    }
    const mean = total / NUM_SEEDS;
    expect(mean).toBeGreaterThan(INITIAL_INFLATION);
  });
});

describe("SPEC-MANDATE-1: onTarget wired into Session.proposeRate()", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // SPEC-MANDATE-1 / SPEC-CRED-1 (issue #33): 1979 inflation=0.114 >> target=0.02 → onTarget=false
  // → no +3 bonus. The 12-member committee dissents heavily at this stress state, but dissents no
  // longer touch credibility, so proposeRate leaves credibility unchanged at 25.
  it("credibility is unchanged when onTarget is false and dissents do not bite", () => {
    // SPEC-MANDATE-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const credBefore = s.current.vars.credibility;
    s.proposeRate(0.1075);
    const credAfter = s.current.vars.credibility;
    expect(credBefore).toBe(25);
    expect(credAfter).toBe(25); // 25 + 0 (onTarget=false), dissents ignored
  });

  // SPEC-MANDATE-1: when onTarget is true, the +3 lever fires — credAfter is exactly 3 higher.
  // Mock mandate params so inflation=0.114 is "on target". Dissents are ignored, so the net is +3.
  it("credibility is exactly 3 higher when onTarget is true (positive path)", () => {
    // SPEC-MANDATE-1
    vi.spyOn(mandateModule, "loadMandateParams").mockReturnValue({
      target_inflation: 0.114,
      tolerance_band: 0.01,
      mandate_type: "single",
      unemployment_target: 0.055,
      unemployment_band: 0.01,
    });
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const credBefore = s.current.vars.credibility;
    s.proposeRate(0.1075);
    const credAfter = s.current.vars.credibility;
    expect(credBefore).toBe(25);
    expect(credAfter).toBe(28); // 25 + 3 (onTarget=true), dissents ignored
  });
});

describe("SPEC-SESSION-1: FOMC meeting schedule", () => {
  // SPEC-SESSION-1: isMeetingMonth() with no arg uses _state.date.
  it("isMeetingMonth() returns true when _state.date is a meeting month (1979-08 = August = 8 ✓)", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    // Scenario starts at 1979-08; August is month 8, which is in the schedule.
    expect(s.current.date).toBe("1979-08");
    expect(s.isMeetingMonth()).toBe(true);
  });

  it("isMeetingMonth() returns false for October (month 10) and true for November (month 11)", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    // advance 2 months from 1979-08 → 1979-10 (October = month 10, not in schedule).
    s.advance(2);
    expect(s.current.date).toBe("1979-10");
    expect(s.isMeetingMonth()).toBe(false);
    // advance 1 month → 1979-11 (November = month 11, in schedule).
    s.advance(1);
    expect(s.current.date).toBe("1979-11");
    expect(s.isMeetingMonth()).toBe(true);
  });

  it("isMeetingMonth() returns false for February (month 2, non-meeting month)", () => {
    // SPEC-SESSION-1
    // advance 6 months from 1979-08 → 1980-02 (February = month 2, not in schedule).
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(6);
    expect(s.current.date).toBe("1980-02");
    expect(s.isMeetingMonth()).toBe(false);
  });

  // SPEC-SESSION-1: isMeetingMonth(date) with explicit date argument.
  it("isMeetingMonth('1979-02') returns false (February = month 2, not in schedule)", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.isMeetingMonth("1979-02")).toBe(false);
  });

  it("isMeetingMonth('1979-03') returns true (March = month 3, in schedule)", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(s.isMeetingMonth("1979-03")).toBe(true);
  });

  // SPEC-SESSION-1: proposeRate throws NotMeetingMonthError outside a meeting month.
  it("proposeRate(0.11) throws NotMeetingMonthError when current date is not a meeting month", () => {
    // SPEC-SESSION-1
    // advance 6 months from 1979-08 → 1980-02 (February = not a meeting month).
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(6);
    expect(s.current.date).toBe("1980-02");
    expect(() => s.proposeRate(0.11)).toThrow(NotMeetingMonthError);
  });

  it("NotMeetingMonthError.date reflects the current YYYY-MM when thrown", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.advance(6);
    expect(s.current.date).toBe("1980-02");
    let caught: NotMeetingMonthError | undefined;
    try {
      s.proposeRate(0.11);
    } catch (e) {
      caught = e as NotMeetingMonthError;
    }
    expect(caught).toBeInstanceOf(NotMeetingMonthError);
    expect(caught?.date).toBe("1980-02");
  });

  // SPEC-SESSION-1: proposeRate does NOT throw when current date is a meeting month.
  it("proposeRate(0.11) does not throw when current date is a meeting month (1979-08 = August ✓)", () => {
    // SPEC-SESSION-1
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    // Scenario starts at 1979-08 which is a meeting month.
    expect(s.current.date).toBe("1979-08");
    expect(() => s.proposeRate(0.11)).not.toThrow();
  });
});

describe("SPEC-WEB-4: Session.committeeBriefing", () => {
  // SPEC-WEB-4: committeeBriefing returns per-member previews and gap fields.
  it("returns previews for all committee members with finite preferred rates", () => {
    // SPEC-WEB-4
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const briefing = s.committeeBriefing(0.1075);
    expect(briefing.previews.length).toBeGreaterThan(0);
    for (const p of briefing.previews) {
      expect(Number.isFinite(p.preferred)).toBe(true);
      expect(typeof p.wouldDissent).toBe("boolean");
    }
  });

  it("returns finite gapInflation, gapUnemployment, inflationTarget, unemploymentTarget", () => {
    // SPEC-WEB-4
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const briefing = s.committeeBriefing(0.1075);
    expect(Number.isFinite(briefing.gapInflation)).toBe(true);
    expect(Number.isFinite(briefing.gapUnemployment)).toBe(true);
    expect(Number.isFinite(briefing.inflationTarget)).toBe(true);
    expect(Number.isFinite(briefing.unemploymentTarget)).toBe(true);
  });

  it("wouldDissent count matches proposeRate dissent count for same inputs", () => {
    // SPEC-WEB-4: previewVote and vote use the same preferred-rate logic.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const rate = 0.1075;
    const briefing = s.committeeBriefing(rate);
    const previewDissents = briefing.previews.filter((p) => p.wouldDissent).length;
    const vote = s.proposeRate(rate);
    expect(previewDissents).toBe(vote.dissents);
  });

  it("throws when proposedRate is not finite", () => {
    // SPEC-WEB-4
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(() => s.committeeBriefing(NaN)).toThrow(/not finite/);
    expect(() => s.committeeBriefing(Infinity)).toThrow(/not finite/);
  });

  it("is pure: does not mutate session state", () => {
    // SPEC-WEB-4: committeeBriefing must not advance or change state.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const dateBefore = s.current.date;
    const credBefore = s.current.vars.credibility;
    s.committeeBriefing(0.1075);
    expect(s.current.date).toBe(dateBefore);
    expect(s.current.vars.credibility).toBe(credBefore);
  });
});

describe("SPEC-DOCT-2: dot-plot meeting effect wired into Session.proposeRate()", () => {
  // SPEC-DOCT-2: when the dot-plot doctrine is adopted, proposeRate must route through
  // applyDotPlotMeetingEffects generically (no hardcoded content ID). Adopted → credibility
  // differs from not-adopted; specifically the anchoring bonus (+1.5) is applied.

  it("proposeRate with dot-plot adopted yields higher credibility than without (anchoring bonus)", () => {
    // SPEC-DOCT-2
    // Baseline: no doctrine — credibility unchanged at 25 (neutral stance, off-target inflation).
    const base = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    base.proposeRate(0.1075);
    const credWithout = base.current.vars.credibility as number;

    // With dot-plot adopted: anchoring bonus applies (+1.5), making credibility higher.
    const withDotPlot = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    withDotPlot.adoptDoctrine("doctrine.dot_plot");
    withDotPlot.proposeRate(0.1075);
    const credWith = withDotPlot.current.vars.credibility as number;

    expect(credWith).toBeGreaterThan(credWithout);
  });

  it("abandoning dot-plot before proposeRate removes the meeting effect", () => {
    // SPEC-DOCT-2: after adoption then abandonment, the meeting hook no longer applies.
    // The flip-flop cost is charged on abandonment (before proposeRate), so we verify
    // that proposeRate does NOT apply the anchoring bonus on top — i.e. the credibility
    // delta from proposeRate alone matches the no-doctrine baseline delta (zero here:
    // neutral stance, off-target inflation → no surprise penalty, no onTarget bonus).
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.adoptDoctrine("doctrine.dot_plot");
    s.abandonDoctrine("doctrine.dot_plot");
    const credBeforePropose = s.current.vars.credibility as number;
    s.proposeRate(0.1075);
    const credAfterPropose = s.current.vars.credibility as number;

    // Without the meeting hook, proposeRate should not change credibility here
    // (neutral stance, inflation far off-target → no surprise, no onTarget bonus).
    expect(credAfterPropose).toBe(credBeforePropose);
  });

  it("proposeRate applies dot-plot meeting hook: credibility delta matches formula (integration)", () => {
    // SPEC-DOCT-2: verify the hook fires via Session.proposeRate and produces the correct delta.
    // applyMeetingOutcome uses content-tuned steps (on_target_gain/surprise_penalty in
    // content/engine/credibility.json, SPEC-CRED-5) independent of current credibility, so the
    // difference between a session with vs without doctrine equals: adoption standing_effect
    // (+3) plus the dot-plot meeting delta — no matter whether spread is above or below threshold.
    const sWith = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const sWithout = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");

    const credBeforeAdopt = sWith.current.vars.credibility as number;
    sWith.adoptDoctrine("doctrine.dot_plot");
    const adoptionBoost = (sWith.current.vars.credibility as number) - credBeforeAdopt;

    // previews are credibility-independent (fomc.ts never reads credibility).
    const { previews } = sWith.committeeBriefing(0.1075);
    const params = loadDotPlotParams();
    const spread = computeVoteSpread(previews);
    const dissents = previews.filter((p) => p.wouldDissent).length;

    let dotPlotDelta = params.anchoring_bonus;
    if (spread > params.spread_threshold) {
      const multiplier = dissents > 0 ? params.dissent_multiplier : 1.0;
      dotPlotDelta -= spread * 100 * params.exposure_per_pp * multiplier;
    }

    sWith.proposeRate(0.1075);
    sWithout.proposeRate(0.1075);

    const credWith = sWith.current.vars.credibility as number;
    const credWithout = sWithout.current.vars.credibility as number;
    expect(credWith - credWithout).toBeCloseTo(adoptionBoost + dotPlotDelta, 5);
  });

  it("proposeRate applies spread-exposure cost when committee is visibly divided (spread > threshold)", () => {
    // SPEC-DOCT-2: exercises the full spread → exposure-cost path via Session.proposeRate.
    // An extreme proposed rate (0.30, far above the 1979 starting rate) maximises disagreement
    // among members — the spread is almost certainly above the 0.005 threshold.
    // With dot-plot adopted, credibility should end up lower than credAfterAdopt + anchoring_bonus.
    const s = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    s.adoptDoctrine("doctrine.dot_plot");
    const credAfterAdopt = s.current.vars.credibility as number;

    const params = loadDotPlotParams();

    s.proposeRate(0.30); // extreme rate → large member spread
    const credAfterPropose = s.current.vars.credibility as number;

    // Net credibility change must be less than anchoring_bonus alone (spread cost bites)
    expect(credAfterPropose - credAfterAdopt).toBeLessThan(params.anchoring_bonus);
  });
});

// SPEC-WEB-9: fogged observation accessor + mandate status on Session.
describe("Session.observed and mandateOnTarget (SPEC-WEB-9)", () => {
  const makeSession = (): Session =>
    Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
  const fogParams = (): Record<string, { noise_scale: number; lag_months: number }> =>
    JSON.parse(readFileSync("content/engine/fog.json", "utf8"));

  it("is deterministic: same seed, date, and series give identical observations", () => {
    // SPEC-WEB-9
    const a = makeSession();
    const b = makeSession();
    expect(a.observed("inflation")).toBe(b.observed("inflation"));
    expect(a.observed("inflation")).toBe(a.observed("inflation"));
  });

  it("a zero-noise, zero-lag series passes the true var through exactly", () => {
    // SPEC-WEB-9 — content-driven: policy_rate is configured noiseless/unlagged.
    const fog = fogParams();
    expect(fog.policy_rate?.noise_scale).toBe(0);
    expect(fog.policy_rate?.lag_months).toBe(0);
    const s = makeSession();
    expect(s.observed("policy_rate")).toBe(s.current.vars.policy_rate);
  });

  it("a noisy series differs from the lagged truth, within a 6-sigma bound", () => {
    // SPEC-WEB-9 — content-driven: inflation has noise_scale > 0.
    const fog = fogParams();
    const noiseScale = fog.inflation?.noise_scale ?? 0;
    const lag = fog.inflation?.lag_months ?? 0;
    expect(noiseScale).toBeGreaterThan(0);
    const s = makeSession();
    s.advance(6);
    const traj = s.trajectory;
    const laggedTruth = traj[traj.length - 1 - lag]?.vars.inflation;
    expect(laggedTruth).toBeDefined();
    const observed = s.observed("inflation");
    expect(observed).not.toBe(laggedTruth);
    expect(Math.abs(observed - (laggedTruth ?? NaN))).toBeLessThan(6 * noiseScale);
  });

  it("distinct series draw distinct noise (decorrelated derived streams)", () => {
    // SPEC-WEB-9 — z-scores must differ across series at the same date.
    const fog = fogParams();
    const s = makeSession();
    s.advance(6);
    const traj = s.trajectory;
    const z = (series: "inflation" | "unemployment"): number => {
      const p = fog[series];
      if (p === undefined) throw new Error(`fog params missing ${series}`);
      const truth = traj[traj.length - 1 - p.lag_months]?.vars[series];
      if (truth === undefined) throw new Error(`truth missing for ${series}`);
      return (s.observed(series) - truth) / p.noise_scale;
    };
    expect(z("inflation")).not.toBe(z("unemployment"));
  });

  it("historical observations are stable after further play", () => {
    // SPEC-WEB-9
    const s = makeSession();
    s.advance(3);
    const at3 = s.observed("inflation", 3);
    s.advance(9);
    expect(s.observed("inflation", 3)).toBe(at3);
  });

  it("reading observations never perturbs the trajectory (twin sessions)", () => {
    // SPEC-WEB-9
    const a = makeSession();
    const b = makeSession();
    for (let i = 0; i < 5; i++) {
      a.observed("inflation");
      a.observed("unemployment");
      a.mandateOnTarget();
    }
    a.advance(12);
    b.advance(12);
    expect(a.trajectory).toEqual(b.trajectory);
  });

  it("mandateOnTarget matches the SPEC-MANDATE-1 evaluator on the current state", () => {
    // SPEC-WEB-9
    const s = makeSession();
    const params = mandateModule.loadMandateParams();
    const direct = mandateModule.onTarget(
      { date: s.current.date, vars: { ...s.current.vars }, flags: { ...s.current.flags }, history: [] },
      params,
    );
    expect(s.mandateOnTarget()).toBe(direct);
    // 1979 stagflation starts far off target — pin the meaningful direction.
    expect(s.mandateOnTarget()).toBe(false);
  });

  it("throws on an out-of-range index and an unknown series", () => {
    // SPEC-WEB-9
    const s = makeSession();
    expect(() => s.observed("inflation", 99)).toThrow(/out of range/);
    expect(() => s.observed("inflation", -1)).toThrow(/out of range/);
    expect(() => s.observed("not_a_series")).toThrow();
  });
});

// SPEC-WEB-10: fromScenario varDeltas — hearing modifiers applied to the start state.
describe("Session.fromScenario varDeltas (SPEC-WEB-10)", () => {
  it("applies additive deltas to the scenario's starting vars", () => {
    // SPEC-WEB-10
    const base = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const adjusted = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979", {
      varDeltas: { credibility: 5, policy_rate: -0.0025 },
    });
    const baseCred = base.current.vars.credibility;
    const baseRate = base.current.vars.policy_rate;
    expect(baseCred).toBeDefined();
    expect(baseRate).toBeDefined();
    expect(adjusted.current.vars.credibility).toBe((baseCred ?? 0) + 5);
    expect(adjusted.current.vars.policy_rate).toBeCloseTo((baseRate ?? 0) - 0.0025, 10);
  });

  it("omitting opts leaves the starting state untouched", () => {
    // SPEC-WEB-10
    const a = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const b = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979", {});
    expect(a.current).toEqual(b.current);
  });

  it("throws on an unknown var and on a non-finite delta", () => {
    // SPEC-WEB-10
    expect(() =>
      Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979", {
        varDeltas: { not_a_var: 1 },
      }),
    ).toThrow(/not a var/);
    expect(() =>
      Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979", {
        varDeltas: { credibility: Number.NaN },
      }),
    ).toThrow(/not finite/);
  });
});
