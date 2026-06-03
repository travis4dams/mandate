// SPEC-WEB-3: 4-series chart via @observablehq/plot with fog overlays.
// Exports pure helpers buildChartData and fogHalfWidth for unit testing.

import { useRef, useEffect } from "react";
import * as Plot from "@observablehq/plot";
import { t } from "./loc";
import fogJson from "../../content/engine/fog.json";

export type DataPoint = { date: string; value: number };

export type ChartData = {
  inflation: DataPoint[];
  unemployment: DataPoint[];
  policy_rate: DataPoint[];
  credibility: DataPoint[];
};

type Snapshot = { date: string; vars: Record<string, number | undefined> };

// Maps series name -> noise_scale from fog.json; falls back to 0 for unknown series.
const fogParams = fogJson as Record<string, { noise_scale: number; lag_months: number }>;

// Returns the fog-band half-width (noise_scale) for a given series name.
// Falls back to 0 if the series is not listed in content/engine/fog.json.
export function fogHalfWidth(series: string): number {
  return fogParams[series]?.noise_scale ?? 0;
}

// Pure function: converts a trajectory snapshot array into per-series DataPoint arrays.
// Skips any snapshot where the series value is undefined.
export function buildChartData(
  trajectory: readonly Snapshot[],
): ChartData {
  const series: (keyof ChartData)[] = ["inflation", "unemployment", "policy_rate", "credibility"];
  const result: ChartData = { inflation: [], unemployment: [], policy_rate: [], credibility: [] };
  for (const snap of trajectory) {
    for (const key of series) {
      const v = snap.vars[key];
      if (typeof v === "number") {
        result[key].push({ date: snap.date, value: v });
      }
    }
  }
  return result;
}

const SERIES_CONFIG = [
  { key: "inflation" as const, color: "#c92a2a", labelKey: "ui.dashboard.chart.legend.inflation" },
  { key: "unemployment" as const, color: "#1864ab", labelKey: "ui.dashboard.chart.legend.unemployment" },
  { key: "policy_rate" as const, color: "#2b8a3e", labelKey: "ui.dashboard.chart.legend.policy_rate" },
  { key: "credibility" as const, color: "#7c3aed", labelKey: "ui.charts.legend.credibility" },
];

export function ChartsPanel(props: { trajectory: readonly Snapshot[] }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { trajectory } = props;

  useEffect(() => {
    if (!ref.current) return;
    const data = buildChartData(trajectory);

    const marks: Plot.Markish[] = [];
    for (const cfg of SERIES_CONFIG) {
      const pts = data[cfg.key];
      const hw = fogHalfWidth(cfg.key);
      if (hw > 0) {
        marks.push(
          Plot.areaY(pts, {
            x: "date",
            y1: (d: DataPoint) => d.value - hw,
            y2: (d: DataPoint) => d.value + hw,
            fill: "#888",
            fillOpacity: 0.15,
          }),
        );
      }
      marks.push(
        Plot.line(pts, {
          x: "date",
          y: "value",
          stroke: cfg.color,
          strokeWidth: 1.5,
          tip: true,
        }),
      );
    }

    const plot = Plot.plot({
      marks,
      x: { label: null },
      y: { label: null },
      color: { legend: false },
      width: 880,
      height: 200,
    });

    ref.current.replaceChildren(plot);
    return () => { ref.current?.replaceChildren(); };
  }, [trajectory]);

  return (
    <div>
      <div ref={ref} />
      <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 12 }}>
        {SERIES_CONFIG.map((cfg) => (
          <span key={cfg.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 16, height: 2, background: cfg.color }} />
            {t(cfg.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}
