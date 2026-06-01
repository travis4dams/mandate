import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadReplay, ReplayNotFoundError, ReplayActionOrderError } from "../src/content/replays";
import { loadValidated } from "../src/content/loader";
import { runReplay } from "./run-replay";

const REPLAY_SCHEMA = new URL("../schemas/replay.schema.json", import.meta.url).pathname;

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
  it("is same-process idempotent: two consecutive in-memory runs produce identical trajectories (cross-process determinism leans on SPEC-SIM-1)", () => {
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

  it("throws when months <= 0 (zero-length runs are a caller bug, not a silent empty trajectory)", () => {
    expect(() => runReplay("replay.1979_volcker_chair_strategy", 0)).toThrow(/months must be > 0/);
    expect(() => runReplay("replay.1979_volcker_chair_strategy", -3)).toThrow(/months must be > 0/);
  });

  it("ignores pivots beyond the requested months window (truncated run honors months arg)", () => {
    const trajectory = runReplay("replay.1979_volcker_chair_strategy", 3);
    expect(trajectory).toHaveLength(3);
    expect(trajectory[0].date).toBe("1979-08");
    expect(trajectory[2].date).toBe("1979-10");
    expect(trajectory[2].vars.policy_rate).toBe(0.138);
    expect(trajectory.find((s) => s.date === "1980-03")).toBeUndefined();
  });

  it("snapshots survive cross-call independence: mutating a returned trajectory does not leak into a fresh run", () => {
    const first = runReplay("replay.1979_volcker_chair_strategy", 3);
    const baseline = first[0].vars.policy_rate;
    first[0].vars.policy_rate = 99;
    first[0].flags.tampered = true;
    const second = runReplay("replay.1979_volcker_chair_strategy", 3);
    expect(second[0].vars.policy_rate).toBe(baseline);
    expect(second[0].flags.tampered).toBeUndefined();
  });
});

describe("replay schema validation", () => {
  it("rejects a replay whose name is an inline player-facing string", () => {
    const dir = join(tmpdir(), `mandate-test-replay-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const badReplay = {
        id: "replay.test_bad",
        name: "Volcker Tightening",
        desc: "replay.test_bad.desc",
        scenario: "scen.1979_volcker",
        actions: [{ date: "1979-08", policy_rate: 0.1075 }],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
      expect(() => loadValidated(REPLAY_SCHEMA, dir)).toThrow(/name/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a replay action missing policy_rate (schema required: [date, policy_rate])", () => {
    const dir = join(tmpdir(), `mandate-test-replay2-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const badReplay = {
        id: "replay.test_actionless",
        name: "replay.test_actionless.name",
        desc: "replay.test_actionless.desc",
        scenario: "scen.1979_volcker",
        actions: [{ date: "1979-08" }],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
      expect(() => loadValidated(REPLAY_SCHEMA, dir)).toThrow(/policy_rate/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a replay with non-strictly-increasing action dates (loadReplay-level guard)", () => {
    const dir = join(tmpdir(), `mandate-test-replay-order-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const badReplay = {
        id: "replay.test_unsorted",
        name: "replay.test_unsorted.name",
        desc: "replay.test_unsorted.desc",
        scenario: "scen.1979_volcker",
        actions: [
          { date: "1980-03", policy_rate: 0.17 },
          { date: "1979-10", policy_rate: 0.138 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
      expect(() => loadReplay("replay.test_unsorted", dir)).toThrow(ReplayActionOrderError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects equal consecutive dates too (strictly increasing, not just non-decreasing)", () => {
    const dir = join(tmpdir(), `mandate-test-replay-eq-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const badReplay = {
        id: "replay.test_duplicate_date",
        name: "replay.test_duplicate_date.name",
        desc: "replay.test_duplicate_date.desc",
        scenario: "scen.1979_volcker",
        actions: [
          { date: "1979-08", policy_rate: 0.10 },
          { date: "1979-08", policy_rate: 0.11 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(badReplay));
      expect(() => loadReplay("replay.test_duplicate_date", dir)).toThrow(ReplayActionOrderError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
