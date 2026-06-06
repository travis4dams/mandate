// SPEC-WEB-6: in-meeting persuasion view — dot plot + scenario briefing + capital control.

import type { MemberVotePreview } from "../../src/engine/fomc";
import { loadBriefing, type Briefing } from "../../src/content/briefings";
import { t } from "./loc";

// ---- pure helper ---------------------------------------------------------

export interface DotPlotDatum {
  memberId: string;
  nameKey: string;
  preferred: number;
  wouldDissent: boolean;
}

/**
 * Convert member previews + proposed rate into dot-plot layout data.
 * Pure function exported for direct unit testing.
 */
export function buildDotPlotData(
  previews: readonly MemberVotePreview[],
  proposed: number,
): {
  dots: DotPlotDatum[];
  proposed: number;
  rateMin: number;
  rateMax: number;
  dissentCount: number;
} {
  const dissentCount = previews.filter((p) => p.wouldDissent).length;
  const allRates = previews.map((p) => p.preferred).concat([proposed]);
  const rateMin = Math.min(...allRates) - 0.005;
  const rateMax = Math.max(...allRates) + 0.005;
  const dots: DotPlotDatum[] = previews.map((p) => ({
    memberId: p.memberId,
    nameKey: p.nameKey,
    preferred: p.preferred,
    wouldDissent: p.wouldDissent,
  }));
  return { dots, proposed, rateMin, rateMax, dissentCount };
}

// ---- sub-components ------------------------------------------------------

function DotPlot(props: {
  previews: readonly MemberVotePreview[];
  proposed: number;
}): JSX.Element {
  const { dots, proposed, rateMin, rateMax, dissentCount } = buildDotPlotData(
    props.previews,
    props.proposed,
  );

  const width = 600;
  const height = 84;
  const padX = 40;
  const axisY = 44;
  const span = rateMax - rateMin || 1;

  const xOf = (rate: number): number =>
    padX + ((rate - rateMin) / span) * (width - 2 * padX);

  const tickRates = [rateMin, rateMin + span * 0.5, rateMax];

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 4, color: "#555" }}>
        <strong>{t("ui.persuasion.dot_plot.heading")}</strong>
        {" — "}
        {t("ui.persuasion.dot_plot.dissent_label")}:{" "}
        <strong data-testid="dissent-count">{dissentCount}</strong> / {dots.length}
      </div>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {/* axis */}
        <line x1={padX} x2={width - padX} y1={axisY} y2={axisY} stroke="#ccc" strokeWidth={1} />
        {tickRates.map((v, i) => (
          <g key={i}>
            <line x1={xOf(v)} x2={xOf(v)} y1={axisY - 4} y2={axisY + 4} stroke="#ccc" />
            <text
              x={xOf(v)}
              y={axisY + 18}
              fontSize={10}
              textAnchor="middle"
              fill="#999"
            >
              {(v * 100).toFixed(2)}%
            </text>
          </g>
        ))}
        {/* proposed rate marker */}
        <line
          x1={xOf(proposed)}
          x2={xOf(proposed)}
          y1={axisY - 24}
          y2={axisY + 4}
          stroke="#555"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
        <text
          x={xOf(proposed)}
          y={axisY - 28}
          fontSize={10}
          textAnchor="middle"
          fill="#555"
        >
          {t("ui.persuasion.dot_plot.proposed_label")}
        </text>
        {/* member dots */}
        {dots.map((d) => (
          <circle
            key={d.memberId}
            cx={xOf(d.preferred)}
            cy={axisY}
            r={7}
            fill={d.wouldDissent ? "#c92a2a" : "#2f9e44"}
            opacity={0.85}
            data-testid={`dot-${d.memberId}`}
          />
        ))}
      </svg>
    </div>
  );
}

function ScenarioBriefingPanel(props: { briefingId: string }): JSX.Element | null {
  let briefing: Briefing | null = null;
  try {
    briefing = loadBriefing(props.briefingId);
  } catch {
    return null; // degrade gracefully when briefing is unavailable
  }

  return (
    <div style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{t("ui.persuasion.briefing.heading")}</strong>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {briefing.scenarios.map((s) => (
          <div
            key={s.scenario_type}
            data-testid={`scenario-card-${s.scenario_type}`}
            style={{
              flex: 1,
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: "8px 10px",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                color: "#555",
                marginBottom: 4,
              }}
            >
              {t(s.name)}
            </div>
            <div style={{ fontSize: 12 }}>
              {t("ui.persuasion.briefing.inflation_label")}:{" "}
              {(s.forecast.inflation_outlook * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 12 }}>
              {t("ui.persuasion.briefing.unemployment_label")}:{" "}
              {(s.forecast.unemployment_outlook * 100).toFixed(1)}%
            </div>
            {s.forecast.growth_outlook !== undefined && (
              <div style={{ fontSize: 12 }}>
                {t("ui.persuasion.briefing.growth_label")}:{" "}
                {(s.forecast.growth_outlook * 100).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Placeholder for SPEC-COMM-7 Chair capital spend control.
// Rendered as disabled until SPEC-COMM-7 is merged.
function SpendCapitalControl(): JSX.Element {
  return (
    <div style={{ marginTop: 10, fontSize: 13, color: "#999" }}>
      {t("ui.persuasion.capital.label")}:{" "}
      <span data-testid="chair-capital-display">—</span>
      <span style={{ marginLeft: 6, fontSize: 11 }}>
        ({t("ui.persuasion.capital.pending")})
      </span>
    </div>
  );
}

// ---- public component ----------------------------------------------------

export interface PersuasionViewProps {
  previews: readonly MemberVotePreview[];
  proposed: number;
  /** Optional briefing content id (e.g. "brief.1979_q3_stagflation").
   *  When absent the briefing panel is hidden; when present but not found it
   *  degrades silently — SPEC-WEB-6 degrade-gracefully contract. */
  briefingId?: string;
}

export function PersuasionView(props: PersuasionViewProps): JSX.Element {
  const { previews, proposed, briefingId } = props;
  return (
    <div style={{ marginTop: 12 }}>
      <DotPlot previews={previews} proposed={proposed} />
      {briefingId !== undefined && <ScenarioBriefingPanel briefingId={briefingId} />}
      <SpendCapitalControl />
    </div>
  );
}
