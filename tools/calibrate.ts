// Stand-alone calibration harness used by `npm run calibrate`.
// Loads the committed FRED baseline, runs replay.1979_chair_tightening through the engine,
// and emits a CSV comparing engine output to real FRED observations.
// No runtime API calls — all data is committed as content.

import { loadCalibration } from "../src/content/calibration.js";
import { runReplay } from "../src/engine/replay.js";

const cal = loadCalibration("cal.fred_1979_1986");
const trajectory = runReplay("replay.1979_chair_tightening", 89);

if (cal.series.length !== trajectory.length) {
  console.error(
    `Length mismatch: FRED has ${cal.series.length} entries, trajectory has ${trajectory.length}`
  );
  process.exit(1);
}

// Emit CSV header
console.log(
  "date,engine_policy_rate,fred_fed_funds_rate,engine_inflation,fred_inflation_yoy,engine_unemployment,fred_unemployment"
);

// Emit one CSV row per month; accumulate squared error for policy_rate.
// inflation/unemployment RMSE is intentionally deferred — Phillips-curve / forward-guidance
// mechanics arrive in slice 3+, at which point comparing those columns becomes meaningful.
let sumSqErr = 0;
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

  if (!Number.isFinite(policyRate)) {
    console.error(`trajectory[${i}] (${entry.date}): "policy_rate" is not a finite number (got ${policyRate})`);
    process.exit(1);
  }
  if (!Number.isFinite(inflation)) {
    console.error(`trajectory[${i}] (${entry.date}): "inflation" is not a finite number (got ${inflation})`);
    process.exit(1);
  }
  if (!Number.isFinite(unemployment)) {
    console.error(`trajectory[${i}] (${entry.date}): "unemployment" is not a finite number (got ${unemployment})`);
    process.exit(1);
  }

  const diff = policyRate - entry.fed_funds_rate;
  sumSqErr += diff * diff;
  console.log(
    [
      entry.date,
      policyRate.toFixed(4),
      entry.fed_funds_rate.toFixed(4),
      inflation.toFixed(4),
      entry.inflation_yoy.toFixed(4),
      unemployment.toFixed(4),
      entry.unemployment.toFixed(4),
    ].join(",")
  );
}

const rmse = Math.sqrt(sumSqErr / cal.series.length);
if (!Number.isFinite(rmse)) {
  console.error(`policy_rate RMSE is not finite (sumSqErr=${sumSqErr}, n=${cal.series.length}) — aborting`);
  process.exit(1);
}
console.error(`policy_rate RMSE: ${rmse.toFixed(4)} (n=${cal.series.length})`);
console.error(
  `Note: inflation/unemployment divergence is expected in slice 1 — Phillips-curve and forward-guidance mechanics arrive in slice 3+.`
);
