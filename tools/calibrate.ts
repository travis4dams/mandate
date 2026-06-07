// Stand-alone calibration harness used by `npm run calibrate`.
// Loads the committed FRED baseline, drives replay.1979_chair_tightening through the FULL engine
// (Session.advance runs the real-rate dynamics, expectations, and mission-tied credibility), and
// emits a CSV comparing engine output to real FRED observations.
// No runtime API calls — all data is committed as content. SPEC-CAL-2 pins the RMSE tolerances
// asserted here as a test. SPEC-CAL-3: thresholds are content-governed; a PASS/FAIL verdict is
// emitted per metric. The harness exits 0 even on FAIL (soft gate — warns without blocking CI).

import { loadCalibration } from "../src/content/calibration.js";
import { loadCalibrationThresholds } from "../src/content/calibration-thresholds.js";
import { Session } from "../src/engine/session.js";

// 1979-08 + 88 months = 1986-12; fromReplay seeds trajectory[0] at 1979-08 → 89 aligned entries.
const MONTHS = 88;

let cal, trajectory;
try {
  cal = loadCalibration("cal.fred_1979_1986");
} catch (e) {
  console.error(`calibrate: loadCalibration("cal.fred_1979_1986") failed: ${(e as Error).message}`);
  process.exit(1);
}
try {
  const session = Session.fromReplay("replay.1979_chair_tightening", 0, "comm.fomc_1979");
  session.advance(MONTHS);
  trajectory = session.trajectory;
} catch (e) {
  console.error(`calibrate: driving replay.1979_chair_tightening failed: ${(e as Error).message}`);
  process.exit(1);
}

if (cal.series.length !== trajectory.length) {
  console.error(
    `Length mismatch: FRED has ${cal.series.length} entries, trajectory has ${trajectory.length}`
  );
  process.exit(1);
}

// Emit CSV header
console.log(
  "date,engine_policy_rate,fred_fed_funds_rate,engine_inflation,fred_inflation_yoy,engine_unemployment,fred_unemployment,engine_credibility"
);

let sumSqRate = 0;
let sumSqInfl = 0;
let sumSqUnemp = 0;
for (let i = 0; i < cal.series.length; i++) {
  const entry = cal.series[i];
  const snap = trajectory[i];

  if (entry.date !== snap.date) {
    console.error(`calibrate: misaligned at i=${i}: cal=${entry.date} engine=${snap.date}`);
    process.exit(1);
  }

  const policyRate = snap.vars.policy_rate;
  const inflation = snap.vars.inflation;
  const unemployment = snap.vars.unemployment;
  const credibility = snap.vars.credibility;

  for (const [name, v] of [
    ["policy_rate", policyRate],
    ["inflation", inflation],
    ["unemployment", unemployment],
    ["credibility", credibility],
  ] as const) {
    if (!Number.isFinite(v)) {
      console.error(`trajectory[${i}] (${entry.date}): "${name}" is not a finite number (got ${v})`);
      process.exit(1);
    }
  }

  sumSqRate += (policyRate - entry.fed_funds_rate) ** 2;
  sumSqInfl += (inflation - entry.inflation_yoy) ** 2;
  sumSqUnemp += (unemployment - entry.unemployment) ** 2;
  console.log(
    [
      entry.date,
      policyRate.toFixed(4),
      entry.fed_funds_rate.toFixed(4),
      inflation.toFixed(4),
      entry.inflation_yoy.toFixed(4),
      unemployment.toFixed(4),
      entry.unemployment.toFixed(4),
      credibility.toFixed(1),
    ].join(",")
  );
}

const n = cal.series.length;
const rmseVal = (sumSq: number): number => Math.sqrt(sumSq / n);

// SPEC-CAL-3: load content-governed thresholds and emit a PASS/FAIL verdict per metric.
// The process exits 0 regardless of verdict — this is a soft gate (warns without blocking CI).
let thresholds;
try {
  thresholds = loadCalibrationThresholds();
} catch (e) {
  console.error(`calibrate: loadCalibrationThresholds() failed: ${(e as Error).message}`);
  process.exit(1);
}

function verdict(label: string, val: number, max: number): void {
  const valStr = val.toFixed(4);
  const maxStr = max.toFixed(4);
  const pass = val < max;
  const status = pass ? "PASS" : "FAIL";
  const suffix = pass ? `(< ${maxStr})` : `(< ${maxStr}) ← threshold exceeded`;
  console.error(`${label} RMSE: ${valStr} ${status} ${suffix}`);
}

const inflRmse = rmseVal(sumSqInfl);
const unempRmse = rmseVal(sumSqUnemp);
const rateRmse = rmseVal(sumSqRate);

verdict("inflation   ", inflRmse, thresholds.inflation_rmse_max);
verdict("unemployment", unempRmse, thresholds.unemployment_rmse_max);
verdict("policy_rate ", rateRmse, thresholds.policy_rate_rmse_max);
