// SPEC-SIM-4
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replay, type PolicyScript } from "./replay.js";

const volckerTightening: PolicyScript = {
  "1979-08": { policy_rate: 0.1075 },
  "1979-10": { policy_rate: 0.1380 },
  "1980-03": { policy_rate: 0.1700 },
  "1980-07": { policy_rate: 0.0900 },
  "1980-12": { policy_rate: 0.1900 },
  "1981-06": { policy_rate: 0.1910 },
  "1981-12": { policy_rate: 0.1200 },
  "1982-12": { policy_rate: 0.0895 },
  "1983-12": { policy_rate: 0.0947 },
  "1984-12": { policy_rate: 0.0838 },
  "1985-12": { policy_rate: 0.0827 },
  "1986-12": { policy_rate: 0.0691 },
};

describe("replay — SPEC-SIM-4", () => {
  it("determinism: two runs with the same seed produce bit-identical trajectories", () => {
    const run1 = replay("scen.1979_volcker", volckerTightening, 42, 89);
    const run2 = replay("scen.1979_volcker", volckerTightening, 42, 89);
    expect(run1).toEqual(run2);
  });

  it("length matches months argument: replay(..., 89) returns 89 entries", () => {
    const result = replay("scen.1979_volcker", volckerTightening, 42, 89);
    expect(result).toHaveLength(89);
  });

  it("snapshot equality: trajectory matches committed golden file", () => {
    const snapPath = join(
      new URL(".", import.meta.url).pathname,
      "golden/1979_volcker_tightening.snap.json"
    );
    const expected = JSON.parse(readFileSync(snapPath, "utf8"));
    const actual = replay("scen.1979_volcker", volckerTightening, 42, 89);
    expect(actual).toEqual(expected);
  });

  it("policy script applies: entry for 1979-09 has the rate set at 1979-08 pivot (held forward)", () => {
    const script: PolicyScript = { "1979-09": { policy_rate: 0.12 } };
    const result = replay("scen.1979_volcker", script, 42, 5);
    const entry = result.find((e) => e.date === "1979-09");
    expect(entry).toBeDefined();
    expect(entry!.policy_rate).toBe(0.12);
  });
});
