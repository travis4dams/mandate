// SPEC-CAL-2: the realistic macro dynamics, driven through the historical Volcker
// rate path, must reproduce the 1979-1986 FRED disinflation within a loose tolerance.
// This is the headline acceptance test for the real-rate transmission model
// (SPEC-SIM-5), continuous adaptive expectations (SPEC-CRED-4), and mission-tied
// credibility (SPEC-CRED-6).
import { describe, it, expect } from "vitest";
import { Session } from "../src/engine/session.js";
import { loadCalibration } from "../src/content/calibration.js";

// 1979-08 + 88 months = 1986-12. fromReplay seeds trajectory[0] at 1979-08, so
// advance(88) yields a 89-entry trajectory aligned month-for-month with FRED.
const MONTHS = 88;
const COUNT = MONTHS + 1; // trajectory length / FRED row count

function runVolcker(): Session {
  const session = Session.fromReplay("replay.1979_chair_tightening", 0, "comm.fomc_1979");
  session.advance(MONTHS);
  return session;
}

function rmse(pairs: readonly [number, number][]): number {
  const sumSq = pairs.reduce((acc, [a, b]) => acc + (a - b) ** 2, 0);
  return Math.sqrt(sumSq / pairs.length);
}

describe("SPEC-CAL-2: Volcker disinflation calibration", () => {
  it("reproduces FRED inflation and unemployment within RMSE tolerance", () => {
    // SPEC-CAL-2
    const cal = loadCalibration("cal.fred_1979_1986");
    const traj = runVolcker().trajectory;
    expect(traj).toHaveLength(COUNT);
    expect(cal.series).toHaveLength(COUNT);

    const inflPairs: [number, number][] = [];
    const unempPairs: [number, number][] = [];
    for (let i = 0; i < COUNT; i++) {
      // Trajectory must align month-for-month with the FRED baseline.
      expect(traj[i].date).toBe(cal.series[i].date);
      inflPairs.push([traj[i].vars.inflation, cal.series[i].inflation_yoy]);
      unempPairs.push([traj[i].vars.unemployment, cal.series[i].unemployment]);
    }

    expect(rmse(inflPairs)).toBeLessThan(0.025); // < 2.5pp
    expect(rmse(unempPairs)).toBeLessThan(0.02); // < 2.0pp
  });

  it("traces the disinflation arc: inflation collapses, recession then recovery, credibility earned", () => {
    // SPEC-CAL-2
    const traj = runVolcker().trajectory;
    const first = traj[0].vars;
    const last = traj[MONTHS].vars;

    // Inflation falls dramatically from its 1979 starting level.
    expect(last.inflation).toBeLessThan(first.inflation - 0.05);
    // The tightening drives a genuine recession (unemployment well into double digits of percent).
    const peakUnemployment = Math.max(...traj.map((s) => s.vars.unemployment));
    expect(peakUnemployment).toBeGreaterThan(0.085);
    // ...which then partly recovers once policy eases (peak is not the final value).
    expect(last.unemployment).toBeLessThan(peakUnemployment);
    // Credibility is earned by following the mission, not lost — it ends above its start.
    expect(last.credibility).toBeGreaterThan(first.credibility);
  });

  it("is deterministic: two identical runs produce identical trajectories", () => {
    // SPEC-CAL-2
    expect(runVolcker().trajectory).toEqual(runVolcker().trajectory);
  });
});
