import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadBriefing,
  BriefingNotFoundError,
  BriefingScenarioOrderError,
} from "../src/content/briefings";
import { loadValidated, _resetValidateFileCache } from "../src/content/loader";

// SPEC-BRIEF-1

afterEach(() => {
  _resetValidateFileCache();
});

describe("loadBriefing — real content", () => {
  it("loads the 1979_q3_stagflation briefing and returns the correct id", () => {
    // SPEC-BRIEF-1
    const b = loadBriefing("brief.1979_q3_stagflation");
    expect(b.id).toBe("brief.1979_q3_stagflation");
  });

  it("exposes exactly three scenario branches in raise/hold/lower order", () => {
    // SPEC-BRIEF-1
    const b = loadBriefing("brief.1979_q3_stagflation");
    expect(b.scenarios).toHaveLength(3);
    expect(b.scenarios[0].scenario_type).toBe("raise");
    expect(b.scenarios[1].scenario_type).toBe("hold");
    expect(b.scenarios[2].scenario_type).toBe("lower");
  });

  it("each scenario carries a forecast with finite inflation_outlook and unemployment_outlook", () => {
    // SPEC-BRIEF-1
    const b = loadBriefing("brief.1979_q3_stagflation");
    for (const s of b.scenarios) {
      expect(Number.isFinite(s.forecast.inflation_outlook)).toBe(true);
      expect(Number.isFinite(s.forecast.unemployment_outlook)).toBe(true);
    }
  });

  it("raise scenario has lower inflation_outlook than lower scenario (tightening reduces inflation)", () => {
    // SPEC-BRIEF-1
    const b = loadBriefing("brief.1979_q3_stagflation");
    const [raise, , lower] = b.scenarios;
    expect(raise.forecast.inflation_outlook).toBeLessThan(lower.forecast.inflation_outlook);
  });
});

describe("loadBriefing — error paths", () => {
  it("throws BriefingNotFoundError for an unknown id", () => {
    // SPEC-BRIEF-1
    expect(() => loadBriefing("brief.does_not_exist")).toThrow(BriefingNotFoundError);
  });

  it("BriefingNotFoundError carries briefingId and dir fields", () => {
    // SPEC-BRIEF-1
    let caught: unknown;
    try {
      loadBriefing("brief.does_not_exist");
    } catch (e) {
      caught = e;
    } finally {
      expect(caught).toBeInstanceOf(BriefingNotFoundError);
      const err = caught as BriefingNotFoundError;
      expect(err.briefingId).toBe("brief.does_not_exist");
      expect(typeof err.dir).toBe("string");
    }
  });

  it("schema rejects scenarios that are not in raise/hold/lower order", () => {
    // SPEC-BRIEF-1 — schema enforces order via prefixItems; loadBriefing never sees bad order
    const dir = join(tmpdir(), `mandate-test-brief-order-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "brief.order_test",
        name: "brief.order_test.name",
        desc: "brief.order_test.desc",
        scenarios: [
          {
            scenario_type: "hold",
            name: "brief.order_test.hold.name",
            forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.06 },
          },
          {
            scenario_type: "raise",
            name: "brief.order_test.raise.name",
            forecast: { inflation_outlook: 0.08, unemployment_outlook: 0.07 },
          },
          {
            scenario_type: "lower",
            name: "brief.order_test.lower.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.05 },
          },
        ],
      };
      writeFileSync(join(dir, "order_test.json"), JSON.stringify(bad));
      expect(() => loadValidated("schemas/briefing.schema.json", dir)).toThrow(/scenario_type/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("BriefingScenarioOrderError is constructable with briefingId and actual fields", () => {
    // SPEC-BRIEF-1 — defense-in-depth error class for programmatic use
    const actual = ["lower", "hold", "raise"] as const;
    const err = new BriefingScenarioOrderError("brief.test_id", actual);
    expect(err).toBeInstanceOf(BriefingScenarioOrderError);
    expect(err.briefingId).toBe("brief.test_id");
    expect(err.actual).toEqual(["lower", "hold", "raise"]);
    expect(err.message).toContain("brief.test_id");
  });
});

describe("briefing schema validation", () => {
  it("rejects a briefing with an inline player-facing name (not a loc-key)", () => {
    // SPEC-BRIEF-1
    const dir = join(tmpdir(), `mandate-test-brief-name-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "brief.bad_name",
        name: "Q3 1979 Staff Outlook",
        desc: "brief.bad_name.desc",
        scenarios: [
          {
            scenario_type: "raise",
            name: "brief.bad_name.raise.name",
            forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.07 },
          },
          {
            scenario_type: "hold",
            name: "brief.bad_name.hold.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.06 },
          },
          {
            scenario_type: "lower",
            name: "brief.bad_name.lower.name",
            forecast: { inflation_outlook: 0.14, unemployment_outlook: 0.05 },
          },
        ],
      };
      writeFileSync(join(dir, "bad_name.json"), JSON.stringify(bad));
      expect(() => loadValidated("schemas/briefing.schema.json", dir)).toThrow(/pattern/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a briefing with only two scenario branches (missing one)", () => {
    // SPEC-BRIEF-1
    const dir = join(tmpdir(), `mandate-test-brief-missing-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "brief.two_branches",
        name: "brief.two_branches.name",
        desc: "brief.two_branches.desc",
        scenarios: [
          {
            scenario_type: "raise",
            name: "brief.two_branches.raise.name",
            forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.07 },
          },
          {
            scenario_type: "hold",
            name: "brief.two_branches.hold.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.06 },
          },
        ],
      };
      writeFileSync(join(dir, "two_branches.json"), JSON.stringify(bad));
      expect(() => loadValidated("schemas/briefing.schema.json", dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a briefing scenario missing the required forecast field", () => {
    // SPEC-BRIEF-1
    const dir = join(tmpdir(), `mandate-test-brief-forecast-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "brief.no_forecast",
        name: "brief.no_forecast.name",
        desc: "brief.no_forecast.desc",
        scenarios: [
          {
            scenario_type: "raise",
            name: "brief.no_forecast.raise.name",
          },
          {
            scenario_type: "hold",
            name: "brief.no_forecast.hold.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.06 },
          },
          {
            scenario_type: "lower",
            name: "brief.no_forecast.lower.name",
            forecast: { inflation_outlook: 0.14, unemployment_outlook: 0.05 },
          },
        ],
      };
      writeFileSync(join(dir, "no_forecast.json"), JSON.stringify(bad));
      expect(() => loadValidated("schemas/briefing.schema.json", dir)).toThrow(/forecast/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a briefing whose unemployment_outlook exceeds 1", () => {
    // SPEC-BRIEF-1
    const dir = join(tmpdir(), `mandate-test-brief-unemp-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "brief.bad_unemp",
        name: "brief.bad_unemp.name",
        desc: "brief.bad_unemp.desc",
        scenarios: [
          {
            scenario_type: "raise",
            name: "brief.bad_unemp.raise.name",
            forecast: { inflation_outlook: 0.10, unemployment_outlook: 1.5 },
          },
          {
            scenario_type: "hold",
            name: "brief.bad_unemp.hold.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.06 },
          },
          {
            scenario_type: "lower",
            name: "brief.bad_unemp.lower.name",
            forecast: { inflation_outlook: 0.14, unemployment_outlook: 0.05 },
          },
        ],
      };
      writeFileSync(join(dir, "bad_unemp.json"), JSON.stringify(bad));
      expect(() => loadValidated("schemas/briefing.schema.json", dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a well-formed briefing with optional growth_outlook", () => {
    // SPEC-BRIEF-1
    const dir = join(tmpdir(), `mandate-test-brief-growth-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const good = {
        id: "brief.with_growth",
        name: "brief.with_growth.name",
        desc: "brief.with_growth.desc",
        scenarios: [
          {
            scenario_type: "raise",
            name: "brief.with_growth.raise.name",
            forecast: { inflation_outlook: 0.10, unemployment_outlook: 0.07, growth_outlook: -0.01 },
          },
          {
            scenario_type: "hold",
            name: "brief.with_growth.hold.name",
            forecast: { inflation_outlook: 0.12, unemployment_outlook: 0.06, growth_outlook: 0.005 },
          },
          {
            scenario_type: "lower",
            name: "brief.with_growth.lower.name",
            forecast: { inflation_outlook: 0.14, unemployment_outlook: 0.05, growth_outlook: 0.015 },
          },
        ],
      };
      writeFileSync(join(dir, "with_growth.json"), JSON.stringify(good));
      const results = loadValidated("schemas/briefing.schema.json", dir);
      expect(results).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
