import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Calibration content type — mirrors schemas/calibration.schema.json.
// No engine-computed values appear here — only observed economic data.

export interface CalibrationEntry {
  date: string;
  inflation_yoy: number;
  unemployment: number;
  fed_funds_rate: number;
}

export interface Calibration {
  id: string;
  name: string;
  desc: string;
  source: string;
  series: readonly CalibrationEntry[];
}

// Thrown when no calibration with the requested id is found.
export class CalibrationNotFoundError extends Error {
  constructor(id: string) {
    super(`Calibration "${id}" not found in content/calibration/`);
    this.name = "CalibrationNotFoundError";
  }
}

// Thrown when a calibration's series entries are not strictly increasing by date.
// The structural invariant lets callers zip series[i] with trajectory[i] by position
// without silent mis-alignment.
export class CalibrationSeriesOrderError extends Error {
  constructor(
    public readonly calibrationId: string,
    public readonly badDate: string,
    public readonly prevDate: string,
  ) {
    super(
      `Calibration "${calibrationId}": series date ${badDate} is not strictly after ${prevDate}.`,
    );
    this.name = "CalibrationSeriesOrderError";
  }
}

const DEFAULT_CALIBRATION_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/calibration"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/calibration.schema.json"
);

/**
 * Load a calibration baseline by id.
 * @throws {CalibrationNotFoundError} if no calibration with the given id exists in `dir`.
 * @throws {CalibrationSeriesOrderError} if the loaded calibration's `series` entries
 *   are not strictly ascending by `date` (duplicates and reversals both rejected).
 * @throws Validation errors from `loadValidated` if any file in `dir` fails to validate
 *   against `schemas/calibration.schema.json`.
 */
export function loadCalibration(id: string, dir: string = DEFAULT_CALIBRATION_DIR): Calibration {
  const calibrations = loadValidated<Calibration>(SCHEMA_PATH, dir);
  const cal = calibrations.find((c) => c.id === id);
  if (!cal) {
    throw new CalibrationNotFoundError(id);
  }
  for (let i = 1; i < cal.series.length; i++) {
    if (cal.series[i].date <= cal.series[i - 1].date) {
      throw new CalibrationSeriesOrderError(id, cal.series[i].date, cal.series[i - 1].date);
    }
  }
  return cal;
}
