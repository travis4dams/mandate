import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadScenario, MissingVarsError } from "../src/content/scenarios";
import { loadValidated } from "../src/content/loader";

// SPEC-SCEN-1

const SLICE1_REQUIRED_VARS = [
  "inflation",
  "unemployment",
  "credibility",
  "expectations_anchor",
  "policy_rate",
  "months_below_anchor",
];

describe("loadScenario", () => {
  it("loads 1979_stagflation and returns a valid GameState", () => {
    const state = loadScenario("scen.1979_stagflation");
    expect(state.date).toBe("1979-08");
    expect(state.history).toEqual([]);
    for (const key of SLICE1_REQUIRED_VARS) {
      expect(state.vars).toHaveProperty(key);
      expect(Number.isFinite(state.vars[key])).toBe(true);
    }
  });

  it("accepts requiredVars when all are present", () => {
    expect(() =>
      loadScenario("scen.1979_stagflation", ["inflation", "credibility"])
    ).not.toThrow();
  });

  it("throws MissingVarsError with .missing when a required var is absent", () => {
    let caught: unknown;
    try {
      loadScenario("scen.1979_stagflation", ["nonexistent_var"]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MissingVarsError);
    expect((caught as MissingVarsError).missing).toEqual(["nonexistent_var"]);
  });

  it("throws a clear error for an unknown scenario id", () => {
    expect(() => loadScenario("scen.unknown_id")).toThrow(/scen\.unknown_id/);
  });
});

describe("scenario schema validation", () => {
  it("rejects a scenario whose name is an inline player-facing string", () => {
    // The schema enforces loc-key shape ^[a-z][a-z0-9_.]+$ on name/desc.
    // A plain English title like "Volcker Disinflation 1979" contains spaces and
    // uppercase — it must fail npm run validate. We verify by attempting to load
    // a synthetic file written with the bad name.
    const dir = join(tmpdir(), `mandate-test-scen-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const badScenario = {
      id: "scen.test_bad",
      date: "1979-08",
      name: "Volcker Disinflation 1979", // inline player-facing string — must fail
      desc: "scen.test_bad.desc",
      vars: { inflation: 0.114 },
      flags: {},
    };
    writeFileSync(join(dir, "bad.json"), JSON.stringify(badScenario));
    let threw = false;
    try {
      loadValidated("schemas/scenario.schema.json", dir);
    } catch {
      threw = true;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(threw).toBe(true);
  });
});
