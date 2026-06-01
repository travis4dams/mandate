import { describe, it, expect, vi } from "vitest";
import { Session } from "../src/engine/session.js";
import type { ForwardGuidanceStance } from "../src/engine/session.js";

// SPEC-SESSION-0

describe("Session.fromScenario", () => {
  // SPEC-SESSION-0: factory returns session with 1 initial trajectory entry at the scenario date.
  it("trajectory.length === 1 and current.date === '1979-08' after fromScenario", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(s.trajectory.length).toBe(1);
    expect(s.current.date).toBe("1979-08");
  });

  // SPEC-SESSION-0: determinism — two sessions from same scenario + seed produce identical trajectories after 12 advances.
  it("two sessions from same scenario + seed produce deep-equal trajectories after advance(12)", () => {
    const a = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const b = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    a.advance(12);
    b.advance(12);
    expect(a.trajectory).toEqual(b.trajectory);
  });
});

describe("Session getter identity stability", () => {
  // SPEC-SESSION-0: consecutive reads with no mutation return the same === reference.
  it("s.current === s.current with no mutation (referentially stable)", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(s.current).toBe(s.current);
  });

  it("s.trajectory === s.trajectory with no mutation (referentially stable)", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(s.trajectory).toBe(s.trajectory);
  });

  // SPEC-SESSION-0: after advance(1), both current and trajectory references CHANGE.
  it("after advance(1) both current and trajectory references change", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
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
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    s.advance(12);
    expect(s.trajectory.length).toBe(13);
    expect(s.current.date).toBe("1980-08");
  });

  // SPEC-SESSION-0: advance with non-positive months throws.
  it("advance(0) throws", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(() => s.advance(0)).toThrow();
  });

  it("advance(-1) throws", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(() => s.advance(-1)).toThrow();
  });
});

describe("Session.proposeRate guards", () => {
  // SPEC-SESSION-0: non-finite rate throws (mirrors vote's existing guard).
  it("proposeRate(NaN) throws", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(() => s.proposeRate(NaN)).toThrow();
  });

  it("proposeRate(Infinity) throws", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    expect(() => s.proposeRate(Infinity)).toThrow();
  });

  // SPEC-SESSION-0: current.vars.policy_rate reflects the decided rate after proposeRate.
  it("current.vars.policy_rate reflects decided rate after proposeRate(0.15)", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    s.proposeRate(0.15);
    expect(s.current.vars.policy_rate).toBe(0.15);
  });
});

describe("Session.subscribe protocol", () => {
  // SPEC-SESSION-0: listener fires on advance, not on getter reads.
  it("listener does not fire on s.current or s.trajectory reads", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    void s.current;
    void s.trajectory;
    expect(listener).not.toHaveBeenCalled();
  });

  // SPEC-SESSION-0: listener fires once on advance(1).
  it("listener fires once on advance(1)", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.advance(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on proposeRate.
  it("listener fires on proposeRate(0.10)", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.proposeRate(0.10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on reset.
  it("listener fires on reset()", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    s.advance(3);
    const listener = vi.fn();
    s.subscribe(listener);
    s.reset();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: listener fires on setForwardGuidanceStance.
  it("listener fires on setForwardGuidanceStance('hawkish')", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const listener = vi.fn();
    s.subscribe(listener);
    s.setForwardGuidanceStance("hawkish");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-SESSION-0: unsubscribe works — subsequent mutations do not fire the removed listener.
  it("unsubscribe: returned function prevents further listener calls", () => {
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
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
    const s = Session.fromReplay("replay.1979_volcker_chair_strategy", 42, "comm.fomc_1979");
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
    const s = Session.fromScenario("scen.1979_volcker", 42, "comm.fomc_1979");
    const stances: ForwardGuidanceStance[] = ["hawkish", "dovish", "neutral"];
    for (const stance of stances) {
      expect(() => s.setForwardGuidanceStance(stance)).not.toThrow();
    }
  });
});
