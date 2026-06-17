// SPEC-WEB-3: 4-series chart via @observablehq/plot with fog overlays.
// Exports pure helpers buildChartData and fogHalfWidth for unit testing.

import { useRef, useEffect } from "react";
import * as Plot from "@observablehq/plot";
import { t } from "./loc";
import fogJson from "../../content/engine/fog.json";
import type { FogParams } from "../../src/engine/fog";
import { color, font, space } from "./theme";

export type DataPoint = { date: string; value: number };

export type ChartData = {
  inflation: DataPoint[];
  unemployment: DataPoint[];
  policy_rate: DataPoint[];
  credibility: DataPoint[];
};

type Snapshot = { date: string; vars: Record<string, number | undefined> };

// Maps series name -> FogParams from fog.json; not every series is present (e.g. credibility is absent).
const fogParams: Partial<Record<string, FogParams>> = fogJson as Partial<Record<string, FogParams>>;

// Returns the fog-band half-width (noise_scale) for a given series name.
// Falls back to 0 if the series is not listed in content/engine/fog.json.
export function fogHalfWidth(series: string): number {
  return fogParams[series]?.noise_scale ?? 0;
}

// Pure function: converts a trajectory snapshot array into per-series DataPoint arrays.
// Keeps only finite numeric values — rejects undefined, null, NaN, Infinity, and -Infinity.
export function buildChartData(
  trajectory: readonly Snapshot[],
): ChartData {
  const series: (keyof ChartData)[] = ["inflation", "unemployment", "policy_rate", "credibility"];
  const result: ChartData = { inflation: [], unemployment: [], policy_rate: [], credibility: [] };
  for (const snap of trajectory) {
    for (const key of series) {
      const v = snap.vars[key];
      if (Number.isFinite(v)) {
        result[key].push({ date: snap.date, value: v as number });
      }
    }
  }
  return result;
}

// Series colors drawn from the institutional palette.
const SERIES_CONFIG = [
  { key: "inflation" as const, color: color.negative, labelKey: "ui.dashboard.chart.legend.inflation" },
  { key: "unemployment" as const, color: color.navy, labelKey: "ui.dashboard.chart.legend.unemployment" },
  { key: "policy_rate" as const, color: color.positive, labelKey: "ui.dashboard.chart.legend.policy_rate" },
  { key: "credibility" as const, color: color.brass, labelKey: "ui.dashboard.chart.legend.credibility" },
];

export function ChartsPanel(props: { trajectory: readonly Snapshot[] }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const { trajectory } = props;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
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
              fill: color.inkSoft,
              fillOpacity: 0.10,
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
        width: el.offsetWidth || 880,
        height: 200,
        style: {
          background: "transparent",
          fontFamily: font.mono,
          fontSize: "11px",
          color: color.inkSoft,
        },
      });

      el.replaceChildren(plot);
    } catch (err) {
      console.error("[ChartsPanel] Plot.plot() failed:", err);
      const msg = document.createElement("p");
      msg.textContent = t("ui.dashboard.chart.unavailable");
      msg.style.color = color.inkSoft;
      msg.style.fontFamily = font.sans;
      el.replaceChildren(msg);
    }
    return () => { el.replaceChildren(); };
  }, [trajectory]);

  return (
    <div>
      <div ref={ref} />
      <div
        style={{
          display: "flex",
          gap: space.xl,
          marginTop: space.xs,
          fontSize: 12,
          fontFamily: font.sans,
        }}
      >
        {SERIES_CONFIG.map((cfg) => (
          <span
            key={cfg.key}
            style={{ display: "flex", alignItems: "center", gap: space.xs, color: color.inkSoft }}
          >
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 2,
                background: cfg.color,
                borderRadius: 1,
              }}
            />
            {t(cfg.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}
