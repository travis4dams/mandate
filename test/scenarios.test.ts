import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadScenario, loadScenarioCatalog, _resetScenarioCatalogCache, MissingVarsError } from "../src/content/scenarios";
import { loadValidated } from "../src/content/loader";
import { Session } from "../src/engine/session";

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

// SPEC-SCEN-2

const ADDITIONAL_SCENARIOS = [
  {
    id: "scen.2008_gfc",
    date: "2008-09",
    inflation: 0.054,
    unemployment: 0.065,
    credibility: 65,
    policy_rate: 0.02,
    expectations_anchor: 0.025,
  },
  {
    id: "scen.covid_2020",
    date: "2020-03",
    inflation: 0.023,
    unemployment: 0.044,
    credibility: 78,
    policy_rate: 0.0025,
    expectations_anchor: 0.02,
  },
];

describe("SPEC-SCEN-2: additional authored starting scenarios", () => {
  it.each(ADDITIONAL_SCENARIOS)(
    "$id boots via Session.fromScenario with trajectory.length===1 and correct date",
    ({ id, date }) => {
      const session = Session.fromScenario(id, 42, "comm.fomc_1979");
      expect(session.current.date).toBe(date);
      expect(session.trajectory).toHaveLength(1);
    }
  );

  it.each(ADDITIONAL_SCENARIOS)(
    "$id initial state matches authored macro vars",
    ({ id, inflation, unemployment, credibility, policy_rate, expectations_anchor }) => {
      const state = loadScenario(id);
      expect(state.vars.inflation).toBeCloseTo(inflation, 6);
      expect(state.vars.unemployment).toBeCloseTo(unemployment, 6);
      expect(state.vars.credibility).toBeCloseTo(credibility, 6);
      expect(state.vars.policy_rate).toBeCloseTo(policy_rate, 6);
      expect(state.vars.expectations_anchor).toBeCloseTo(expectations_anchor, 6);
    }
  );

  it("each additional scenario differs from 1979 on all five macro vars", () => {
    const base = loadScenario("scen.1979_stagflation");
    for (const s of ADDITIONAL_SCENARIOS) {
      const state = loadScenario(s.id);
      expect(state.vars.inflation).not.toBeCloseTo(base.vars.inflation as number, 2);
      expect(state.vars.unemployment).not.toBeCloseTo(base.vars.unemployment as number, 2);
      expect(state.vars.credibility).not.toBeCloseTo(base.vars.credibility as number, 0);
      expect(state.vars.policy_rate).not.toBeCloseTo(base.vars.policy_rate as number, 2);
      expect(state.vars.expectations_anchor).not.toBeCloseTo(
        base.vars.expectations_anchor as number, 2
      );
    }
  });

  it("all additional scenarios have empty history on direct load", () => {
    for (const s of ADDITIONAL_SCENARIOS) {
      const state = loadScenario(s.id);
      expect(state.history).toEqual([]);
    }
  });

  it("all additional scenarios are schema-valid (loadScenario does not throw)", () => {
    for (const s of ADDITIONAL_SCENARIOS) {
      expect(() => loadScenario(s.id)).not.toThrow();
    }
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

// SPEC-WEB-10: scenario catalog + playable filter for the start screen.
describe("loadScenarioCatalog (SPEC-WEB-10)", () => {
  beforeEach(() => {
    _resetScenarioCatalogCache();
  });

  it("returns every scenario on disk, and exactly the authored three are playable", () => {
    // SPEC-WEB-10
    const catalog = loadScenarioCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(4);
    const playable = catalog.filter((s) => s.playable === true);
    expect(playable.map((s) => s.id).sort()).toEqual([
      "scen.1979_stagflation",
      "scen.2008_gfc",
      "scen.covid_2020",
    ]);
  });

  it("recovery_test is a fixture: present in the catalog but not playable", () => {
    // SPEC-WEB-10
    const catalog = loadScenarioCatalog();
    const fixture = catalog.find((s) => s.id === "scen.recovery_test");
    expect(fixture).toBeDefined();
    expect(fixture?.playable).not.toBe(true);
  });

  it("every playable scenario names a briefing with the brief. id shape", () => {
    // SPEC-WEB-10
    const catalog = loadScenarioCatalog();
    for (const s of catalog.filter((x) => x.playable === true)) {
      expect(s.briefing).toMatch(/^brief\.[a-z0-9_]+$/);
    }
  });
});
