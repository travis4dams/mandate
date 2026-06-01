import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadReplay, ReplayNotFoundError } from "../src/content/replays";
import { loadValidated } from "../src/content/loader";
import { runReplay } from "./run-replay";

// SPEC-SIM-4

describe("loadReplay", () => {
  it("returns the 1979 Volcker chair strategy with 12 actions and the right scenario", () => {
    const replay = loadReplay("replay.1979_volcker_chair_strategy");
    expect(replay.id).toBe("replay.1979_volcker_chair_strategy");
    expect(replay.scenario).toBe("scen.1979_volcker");
    expect(replay.actions).toHaveLength(12);
    expect(replay.actions[0]).toEqual({ date: "1979-08", policy_rate: 0.1075 });
    expect(replay.actions[11]).toEqual({ date: "1986-12", policy_rate: 0.0691 });
  });

  it("throws ReplayNotFoundError for an unknown id", () => {
    expect(() => loadReplay("replay.does_not_exist")).toThrow(ReplayNotFoundError);
  });
});

describe("runReplay", () => {
  it("is deterministic: two consecutive in-memory runs produce identical trajectories", () => {
    const a = runReplay("replay.1979_volcker_chair_strategy", 89);
    const b = runReplay("replay.1979_volcker_chair_strategy", 89);
    expect(a).toEqual(b);
  });

  it("spans 1979-08 through 1986-12 across 89 monthly snapshots", () => {
    const trajectory = runReplay("replay.1979_volcker_chair_strategy", 89);
    expect(trajectory).toHaveLength(89);
    expect(trajectory[0].date).toBe("1979-08");
    expect(trajectory[88].date).toBe("1986-12");
  });

  it("applies the 1980-03 pivot so that month's snapshot has policy_rate = 0.17", () => {
    const trajectory = runReplay("replay.1979_volcker_chair_strategy", 89);
    const march1980 = trajectory.find((s) => s.date === "1980-03");
    expect(march1980).toBeDefined();
    expect(march1980!.vars.policy_rate).toBe(0.17);
  });

  it("holds policy_rate forward between pivots (1979-09 still has the 1979-08 rate)", () => {
    const trajectory = runReplay("replay.1979_volcker_chair_strategy", 89);
    const sept1979 = trajectory.find((s) => s.date === "1979-09");
    expect(sept1979).toBeDefined();
    expect(sept1979!.vars.policy_rate).toBe(0.1075);
  });
});

describe("replay schema validation", () => {
  it("rejects a replay whose name is an inline player-facing string", () => {
    // The schema enforces loc-key shape ^[a-z][a-z0-9_.]+$ on name/desc.
    // A plain English title fails validation.
    const dir = join(tmpdir(), `mandate-test-replay-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const badReplay = {
      id: "replay.test_bad",
      name: "Volcker Tightening", // inline player-facing string — must fail
      desc: "replay.test_bad.desc",
      scenario: "scen.1979_volcker",
      actions: [{ date: "1979-08", policy_rate: 0.1075 }],
    };
    writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
    let threw = false;
    try {
      loadValidated("schemas/replay.schema.json", dir);
    } catch {
      threw = true;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(threw).toBe(true);
  });

  it("rejects a replay action with no payload (just a date is not a valid action)", () => {
    const dir = join(tmpdir(), `mandate-test-replay2-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const badReplay = {
      id: "replay.test_actionless",
      name: "replay.test_actionless.name",
      desc: "replay.test_actionless.desc",
      scenario: "scen.1979_volcker",
      actions: [{ date: "1979-08" }], // no policy_rate — schema requires at least one player input
    };
    writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
    let threw = false;
    try {
      loadValidated("schemas/replay.schema.json", dir);
    } catch {
      threw = true;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(threw).toBe(true);
  });
});
