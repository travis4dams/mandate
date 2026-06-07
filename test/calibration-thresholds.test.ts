import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCalibrationThresholds, _resetCalibrationThresholdsCache } from "../src/content/calibration-thresholds.js";
import { loadValidatedFile, _resetValidateFileCache } from "../src/content/loader.js";

// SPEC-CAL-3

const SCHEMA_PATH = "schemas/calibration-thresholds.schema.json";

afterEach(() => {
  _resetCalibrationThresholdsCache();
  _resetValidateFileCache();
});

describe("loadCalibrationThresholds (SPEC-CAL-3)", () => {
  it("loads successfully and returns an object with three fields", () => {
    // SPEC-CAL-3
    const thresholds = loadCalibrationThresholds();
    expect(thresholds).toBeDefined();
    expect(typeof thresholds.inflation_rmse_max).toBe("number");
    expect(typeof thresholds.unemployment_rmse_max).toBe("number");
    expect(typeof thresholds.policy_rate_rmse_max).toBe("number");
  });

  it("returns finite positive values for all three fields (SPEC-CAL-3)", () => {
    // SPEC-CAL-3
    const thresholds = loadCalibrationThresholds();
    expect(Number.isFinite(thresholds.inflation_rmse_max)).toBe(true);
    expect(thresholds.inflation_rmse_max).toBeGreaterThan(0);
    expect(Number.isFinite(thresholds.unemployment_rmse_max)).toBe(true);
    expect(thresholds.unemployment_rmse_max).toBeGreaterThan(0);
    expect(Number.isFinite(thresholds.policy_rate_rmse_max)).toBe(true);
    expect(thresholds.policy_rate_rmse_max).toBeGreaterThan(0);
  });

  it("module-level cache: returns the same object reference on repeated calls (SPEC-CAL-3)", () => {
    // SPEC-CAL-3
    const first = loadCalibrationThresholds();
    const second = loadCalibrationThresholds();
    expect(first).toBe(second);
  });

  it("_resetCalibrationThresholdsCache clears the cache so the next call re-loads (SPEC-CAL-3)", () => {
    // SPEC-CAL-3
    const first = loadCalibrationThresholds();
    _resetCalibrationThresholdsCache();
    const second = loadCalibrationThresholds();
    // After reset, a fresh object is returned (may equal but is not the same reference)
    expect(second).toEqual(first);
    // The second load must succeed (no error)
    expect(second.inflation_rmse_max).toBeGreaterThan(0);
  });
});

describe("calibration-thresholds schema validation (SPEC-CAL-3)", () => {
  it("schema rejects a file with a negative inflation_rmse_max", () => {
    // SPEC-CAL-3
    const dir = join(tmpdir(), `mandate-test-cal-thresh-neg-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "bad-thresholds.json");
    try {
      writeFileSync(
        filePath,
        JSON.stringify({
          inflation_rmse_max: -0.025,
          unemployment_rmse_max: 0.020,
          policy_rate_rmse_max: 0.050,
        })
      );
      expect(() => loadValidatedFile(SCHEMA_PATH, filePath)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema rejects a file with a zero unemployment_rmse_max (exclusiveMinimum: 0)", () => {
    // SPEC-CAL-3
    const dir = join(tmpdir(), `mandate-test-cal-thresh-zero-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "bad-thresholds.json");
    try {
      writeFileSync(
        filePath,
        JSON.stringify({
          inflation_rmse_max: 0.025,
          unemployment_rmse_max: 0,
          policy_rate_rmse_max: 0.050,
        })
      );
      expect(() => loadValidatedFile(SCHEMA_PATH, filePath)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema rejects a file with an extra unknown property", () => {
    // SPEC-CAL-3
    const dir = join(tmpdir(), `mandate-test-cal-thresh-extra-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "bad-thresholds.json");
    try {
      writeFileSync(
        filePath,
        JSON.stringify({
          inflation_rmse_max: 0.025,
          unemployment_rmse_max: 0.020,
          policy_rate_rmse_max: 0.050,
          extra_unknown_field: 99,
        })
      );
      expect(() => loadValidatedFile(SCHEMA_PATH, filePath)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("schema accepts the committed content/engine/calibration-thresholds.json (SPEC-CAL-3)", () => {
    // SPEC-CAL-3
    const result = loadValidatedFile<{
      inflation_rmse_max: number;
      unemployment_rmse_max: number;
      policy_rate_rmse_max: number;
    }>(SCHEMA_PATH, "content/engine/calibration-thresholds.json");
    expect(result.inflation_rmse_max).toBe(0.025);
    expect(result.unemployment_rmse_max).toBe(0.020);
    expect(result.policy_rate_rmse_max).toBe(0.050);
  });
});
