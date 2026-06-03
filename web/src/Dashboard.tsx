// SPEC-WEB-2: dashboard for the engine. Shows current state, a small chart of the
// trajectory so far, and controls to advance time. SPEC-WEB-4 adds the FOMC
// meeting panel so the Chair can propose rates; SPEC-WEB-5 adds stance controls
// and advance-to-next-meeting so the Chair always lands in a meeting context.

import { useState } from "react";
import { useSession } from "./useSession";
import { t } from "./loc";
import { MeetingPanel } from "./MeetingPanel";
import type { Session } from "../../src/engine/session";

const fmtPercent = (n: number | undefined): string =>
  n === undefined ? "—" : `${(n * 100).toFixed(2)}%`;
const fmtPlain = (n: number | undefined, digits = 0): string =>
  n === undefined ? "—" : n.toFixed(digits);

export function Dashboard(): JSX.Element {
  const [btnError, setBtnError] = useState<string | null>(null);
  const { session, current, trajectory } = useSession(
    "scen.1979_stagflation",
    42,
    "comm.fomc_1979",
  );

  function run(action: () => void): void {
    try { action(); setBtnError(null); }
    catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "24px" }}>
      <header>
        <h1 style={{ margin: 0 }}>{t("ui.dashboard.title")}</h1>
        <p style={{ marginTop: 4, color: "#666" }}>
          {t("ui.dashboard.scenario_label")} <code>scen.1979_stagflation</code> · {t("ui.dashboard.seed_label")} 42
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          margin: "16px 0",
        }}
      >
        <Stat label={t("ui.dashboard.stat.date")} value={current.date} />
        <Stat label={t("ui.dashboard.stat.policy_rate")} value={fmtPercent(current.vars.policy_rate)} />
        <Stat label={t("ui.dashboard.stat.inflation")} value={fmtPercent(current.vars.inflation)} />
        <Stat label={t("ui.dashboard.stat.unemployment")} value={fmtPercent(current.vars.unemployment)} />
        <Stat label={t("ui.dashboard.stat.credibility")} value={fmtPlain(current.vars.credibility, 1)} />
        <Stat label={t("ui.dashboard.stat.expectations_anchor")} value={fmtPercent(current.vars.expectations_anchor)} />
        <Stat label={t("ui.dashboard.stat.months_below_anchor")} value={fmtPlain(current.vars.months_below_anchor, 0)} />
        <Stat label={t("ui.dashboard.stat.months_elapsed")} value={String(trajectory.length - 1)} />
      </section>

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t("ui.dashboard.trajectory_heading")} ({trajectory.length})</h2>
        <TrajectoryChart trajectory={trajectory} />
      </section>

      <MeetingPanel session={session} />

      <section style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        <button onClick={() => run(() => session.advance(1))}>{t("ui.dashboard.button.advance_1")}</button>
        <button onClick={() => run(() => session.advance(3))}>{t("ui.dashboard.button.advance_3")}</button>
        <button onClick={() => run(() => session.advance(12))}>{t("ui.dashboard.button.advance_12")}</button>
        <button onClick={() => run(() => {
          try {
            advanceToNextMeeting(session);
          } catch (e) {
            // Match ONLY the bounded-loop helper error; re-throw anything else
            // unchanged so real engine/content failures from session.advance()
            // surface as themselves rather than being misreported as
            // "no meeting in 12 months".
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.startsWith("advanceToNextMeeting:")) {
              throw new Error(t("ui.dashboard.no_meeting_in_12mo"));
            }
            throw e;
          }
        })}>{t("ui.dashboard.button.advance_to_meeting")}</button>
        <button onClick={() => run(() => session.reset())}>{t("ui.dashboard.button.reset")}</button>
      </section>

      <section style={{ display: "flex", gap: 8, alignItems: "center", margin: "16px 0" }}>
        <span style={{ fontSize: 13, color: "#666" }}>{t("ui.dashboard.guidance_label")}</span>
        <button onClick={() => run(() => session.setForwardGuidanceStance("hawkish"))}>{t("ui.dashboard.button.hawkish")}</button>
        <button onClick={() => run(() => session.setForwardGuidanceStance("neutral"))}>{t("ui.dashboard.button.neutral")}</button>
        <button onClick={() => run(() => session.setForwardGuidanceStance("dovish"))}>{t("ui.dashboard.button.dovish")}</button>
      </section>

      {btnError !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, margin: "4px 0 12px" }}>{btnError}</p>
      )}
    </div>
  );
}

/**
 * Advance the session to the next FOMC meeting month without mutating state first.
 * Checks future months by date string before advancing, so if no meeting is found
 * in the next 12 months, this throws without having changed any game state.
 */
function advanceToNextMeeting(session: Session): void {
  const parts = session.current.date.split("-");
  const baseYear = parseInt(parts[0] ?? "1979", 10);
  const baseMonth = parseInt(parts[1] ?? "01", 10);

  for (let i = 1; i <= 12; i++) {
    // Compute YYYY-MM for baseMonth+i without advancing session state.
    const totalMonthIndex = (baseYear * 12 + (baseMonth - 1)) + i;
    const futureYear = Math.floor(totalMonthIndex / 12);
    const futureMonth = (totalMonthIndex % 12) + 1;
    const futureDate = `${futureYear}-${String(futureMonth).padStart(2, "0")}`;

    if (session.isMeetingMonth(futureDate)) {
      session.advance(i);
      return;
    }
  }

  // Throw a stable developer-facing message; the call site is responsible for
  // surfacing a localized error to the user. Localization keys do not belong in
  // logic helpers — they couple the function to the UI translation context and
  // make it hard to test in isolation.
  throw new Error("advanceToNextMeeting: no meeting month within 12 months");
}

function Stat(props: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: "10px 12px", background: "#fafafa" }}>
      <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase" }}>{props.label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{props.value}</div>
    </div>
  );
}

function TrajectoryChart(props: { trajectory: readonly { vars: Record<string, number | undefined> }[] }): JSX.Element {
  const series = [
    { key: "inflation", color: "#c92a2a", label: t("ui.dashboard.chart.legend.inflation") },
    { key: "unemployment", color: "#1864ab", label: t("ui.dashboard.chart.legend.unemployment") },
    { key: "policy_rate", color: "#2b8a3e", label: t("ui.dashboard.chart.legend.policy_rate") },
  ] as const;

  const width = 880;
  const height = 200;
  const padding = { top: 8, right: 8, bottom: 24, left: 40 };
  const n = props.trajectory.length;
  const allValues = props.trajectory.flatMap((s) =>
    series.map((sd) => s.vars[sd.key]).filter((v): v is number => typeof v === "number"),
  );
  const yMin = Math.min(0, ...allValues);
  const yMax = Math.max(0.2, ...allValues);
  const xScale = (i: number): number =>
    padding.left + (n <= 1 ? 0 : (i / (n - 1)) * (width - padding.left - padding.right));
  const yScale = (v: number): number =>
    padding.top +
    (height - padding.top - padding.bottom) * (1 - (v - yMin) / (yMax - yMin || 1));

  const pathFor = (key: string): string =>
    props.trajectory
      .map((s, i) => {
        const v = s.vars[key];
        if (typeof v !== "number") return "";
        return `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

  return (
    <svg width={width} height={height} style={{ border: "1px solid #ddd", background: "#fff" }}>
      {[0, 0.05, 0.1, 0.15, 0.2].map((tick) => (
        <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={yScale(tick)} y2={yScale(tick)} stroke="#eee" />
          <text x={padding.left - 6} y={yScale(tick) + 4} fontSize={10} textAnchor="end" fill="#999">
            {`${(tick * 100).toFixed(0)}%`}
          </text>
        </g>
      ))}
      {series.map((sd) => (
        <path key={sd.key} d={pathFor(sd.key)} stroke={sd.color} fill="none" strokeWidth={1.5} />
      ))}
      <g transform={`translate(${padding.left}, ${height - 4})`}>
        {series.map((sd, i) => (
          <g key={sd.key} transform={`translate(${i * 130}, 0)`}>
            <line x1={0} x2={16} y1={-4} y2={-4} stroke={sd.color} strokeWidth={2} />
            <text x={20} y={0} fontSize={11} fill="#333">
              {sd.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
