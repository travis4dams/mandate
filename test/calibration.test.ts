import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCalibration, CalibrationNotFoundError, CalibrationSeriesOrderError } from "../src/content/calibration.js";
import { loadValidated } from "../src/content/loader.js";
import { runReplay } from "./run-replay.js";

// SPEC-CAL-1

const CAL_SCHEMA = new URL("../schemas/calibration.schema.json", import.meta.url).pathname;

describe("loadCalibration", () => {
  it("loads fred_1979_1986 with exactly 89 monthly entries from 1979-08 through 1986-12", () => {
    const cal = loadCalibration("cal.fred_1979_1986");
    expect(cal.id).toBe("cal.fred_1979_1986");
    expect(cal.series).toHaveLength(89);
    expect(cal.series[0].date).toBe("1979-08");
    expect(cal.series[88].date).toBe("1986-12");
  });

  it("each entry has date, inflation_yoy, unemployment, fed_funds_rate all as finite numbers", () => {
    const cal = loadCalibration("cal.fred_1979_1986");
    for (const entry of cal.series) {
      expect(typeof entry.date).toBe("string");
      expect(Number.isFinite(entry.inflation_yoy)).toBe(true);
      expect(Number.isFinite(entry.unemployment)).toBe(true);
      expect(Number.isFinite(entry.fed_funds_rate)).toBe(true);
    }
  });

  it("throws CalibrationNotFoundError for an unknown id", () => {
    expect(() => loadCalibration("cal.does_not_exist")).toThrow(CalibrationNotFoundError);
  });

  it("throws CalibrationSeriesOrderError when series dates are out of order", () => {
    const dir = join(tmpdir(), `mandate-test-cal-order-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_out_of_order",
        name: "cal.test_out_of_order.name",
        desc: "cal.test_out_of_order.desc",
        source: "https://example.com",
        series: [
          { date: "1979-09", inflation_yoy: 0.12, unemployment: 0.06, fed_funds_rate: 0.11 },
          { date: "1979-08", inflation_yoy: 0.11, unemployment: 0.06, fed_funds_rate: 0.10 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      let caught: unknown;
      try {
        loadCalibration("cal.test_out_of_order", dir);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CalibrationSeriesOrderError);
      const err = caught as CalibrationSeriesOrderError;
      expect(err.calibrationId).toBe("cal.test_out_of_order");
      expect(err.badDate).toBe("1979-08");
      expect(err.prevDate).toBe("1979-09");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC-CAL-1: the ordering guard uses `<=`, so duplicate dates must also throw,
  // mirroring the duplicate-date behavior of ReplayActionOrderError in test/replay.test.ts.
  it("throws CalibrationSeriesOrderError when series contains duplicate dates", () => {
    const dir = join(tmpdir(), `mandate-test-cal-dup-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_dup_date",
        name: "cal.test_dup_date.name",
        desc: "cal.test_dup_date.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08", inflation_yoy: 0.11, unemployment: 0.06, fed_funds_rate: 0.10 },
          { date: "1979-08", inflation_yoy: 0.12, unemployment: 0.06, fed_funds_rate: 0.11 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      let caught: unknown;
      try {
        loadCalibration("cal.test_dup_date", dir);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CalibrationSeriesOrderError);
      const err = caught as CalibrationSeriesOrderError;
      expect(err.calibrationId).toBe("cal.test_dup_date");
      expect(err.badDate).toBe("1979-08");
      expect(err.prevDate).toBe("1979-08");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("calibration schema validation", () => {
  it("rejects an entry with fed_funds_rate < 0 (negative rates did not exist in 1979)", () => {
    const dir = join(tmpdir(), `mandate-test-cal-neg-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_negative_rate",
        name: "cal.test_negative_rate.name",
        desc: "cal.test_negative_rate.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08", inflation_yoy: 0.1184, unemployment: 0.06, fed_funds_rate: -0.01 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/fed_funds_rate/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a non-monthly date format (1979-08-15 is wrong — must be YYYY-MM only)", () => {
    const dir = join(tmpdir(), `mandate-test-cal-date-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_bad_date",
        name: "cal.test_bad_date.name",
        desc: "cal.test_bad_date.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08-15", inflation_yoy: 0.1184, unemployment: 0.06, fed_funds_rate: 0.1094 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/date/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC-CAL-1: source must look like a URL. The schema enforces this via pattern
  // (not `format: "uri"`, which AJV 8 strict mode silently ignores when ajv-formats
  // is absent). Without this regression test the schema would silently accept any string.
  it("rejects a source that is not a URL", () => {
    const dir = join(tmpdir(), `mandate-test-cal-src-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_bad_source",
        name: "cal.test_bad_source.name",
        desc: "cal.test_bad_source.desc",
        source: "not-a-uri",
        series: [
          { date: "1979-08", inflation_yoy: 0.1184, unemployment: 0.06, fed_funds_rate: 0.1094 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/source/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("calibration harness smoke test", () => {
  it("comparison table has 89 rows — one per FRED month", () => {
    // SPEC-CAL-1: load FRED baseline, run replay, build comparison table
    const cal = loadCalibration("cal.fred_1979_1986");
    const trajectory = runReplay("replay.1979_chair_tightening", 89);

    expect(cal.series).toHaveLength(89);
    expect(trajectory).toHaveLength(89);

    // Build comparison table (same logic as tools/calibrate.ts)
    const rows = cal.series.map((entry, i) => {
      const snap = trajectory[i];
      return {
        date: entry.date,
        engine_policy_rate: snap.vars.policy_rate,
        fred_fed_funds_rate: entry.fed_funds_rate,
        engine_inflation: snap.vars.inflation,
        fred_inflation_yoy: entry.inflation_yoy,
        engine_unemployment: snap.vars.unemployment,
        fred_unemployment: entry.unemployment,
      };
    });

    expect(rows).toHaveLength(89);
    // Dates must align
    expect(rows[0].date).toBe("1979-08");
    expect(rows[88].date).toBe("1986-12");
    // SPEC-CAL-1: trajectory dates must match FRED baseline dates month-for-month
    for (let i = 0; i < 89; i++) {
      expect(trajectory[i].date).toBe(cal.series[i].date);
    }
    // All engine_policy_rate values must be finite numbers (replay sets them)
    for (const row of rows) {
      expect(Number.isFinite(row.engine_policy_rate)).toBe(true);
    }
    // SPEC-CAL-1: spot-check — 1979-08 engine_policy_rate matches the first replay action
    const aug1979 = trajectory.find((s) => s.date === "1979-08");
    expect(aug1979).toBeDefined();
    expect(aug1979!.vars.policy_rate).toBeCloseTo(0.1075, 4);
  });

  it("is deterministic: two runs produce identical full trajectories (not just policy_rate)", () => {
    const traj1 = runReplay("replay.1979_chair_tightening", 89);
    const traj2 = runReplay("replay.1979_chair_tightening", 89);
    expect(traj1).toEqual(traj2);
  });
});

describe("calibration schema authoring-error guards", () => {
  it("rejects unemployment > 1 (raw-percentage authoring error, e.g. 6.0 instead of 0.06)", () => {
    const dir = join(tmpdir(), `mandate-test-cal-unemp-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_raw_unemp",
        name: "cal.test_raw_unemp.name",
        desc: "cal.test_raw_unemp.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08", inflation_yoy: 0.1184, unemployment: 6.0, fed_funds_rate: 0.1094 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/unemployment/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects fed_funds_rate > 2 (raw-percentage authoring error, e.g. 10.94 instead of 0.1094)", () => {
    const dir = join(tmpdir(), `mandate-test-cal-ffr-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_raw_ffr",
        name: "cal.test_raw_ffr.name",
        desc: "cal.test_raw_ffr.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08", inflation_yoy: 0.1184, unemployment: 0.06, fed_funds_rate: 10.94 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/fed_funds_rate/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects inflation_yoy > 1.0 (raw-percentage authoring error, e.g. 11.84 instead of 0.1184)", () => {
    const dir = join(tmpdir(), `mandate-test-cal-inf-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "cal.test_raw_inflation",
        name: "cal.test_raw_inflation.name",
        desc: "cal.test_raw_inflation.desc",
        source: "https://example.com",
        series: [
          { date: "1979-08", inflation_yoy: 11.84, unemployment: 0.06, fed_funds_rate: 0.1094 }
        ]
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(CAL_SCHEMA, dir)).toThrow(/inflation_yoy/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
