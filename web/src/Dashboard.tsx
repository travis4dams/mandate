// SPEC-WEB-2: dashboard for the engine. Shows current state, a small chart of the
// trajectory so far, and controls to advance time. SPEC-WEB-4 adds the FOMC
// meeting panel + advance-to-next-meeting / stance controls so the Chair has
// actual levers, not just a time-advance button.

import { useState } from "react";
import { useSession } from "./useSession";
import { MeetingPanel } from "./MeetingPanel";
import type { Session } from "../../src/engine/session";

export function Dashboard(): JSX.Element {
  const [btnError, setBtnError] = useState<string | null>(null);
  const { session, current, trajectory } = useSession(
    "scen.1979_stagflation",
    42,
    "comm.fomc_1979",
  );

  const fmtPercent = (n: number | undefined): string =>
    n === undefined ? "—" : `${(n * 100).toFixed(2)}%`;
  const fmtPlain = (n: number | undefined, digits = 0): string =>
    n === undefined ? "—" : n.toFixed(digits);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "24px" }}>
      <header>
        <h1 style={{ margin: 0 }}>MANDATE</h1>
        <p style={{ marginTop: 4, color: "#666" }}>
          Scenario: <code>scen.1979_stagflation</code> · Seed 42
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
        <Stat label="Date" value={current.date} />
        <Stat label="Policy rate" value={fmtPercent(current.vars.policy_rate)} />
        <Stat label="Inflation" value={fmtPercent(current.vars.inflation)} />
        <Stat label="Unemployment" value={fmtPercent(current.vars.unemployment)} />
        <Stat label="Credibility" value={fmtPlain(current.vars.credibility, 1)} />
        <Stat label="Anchor" value={fmtPercent(current.vars.expectations_anchor)} />
        <Stat label="Months below anchor" value={fmtPlain(current.vars.months_below_anchor, 0)} />
        <Stat label="Months elapsed" value={String(trajectory.length - 1)} />
      </section>

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Trajectory ({trajectory.length} snapshots)</h2>
        <TrajectoryChart trajectory={trajectory} />
      </section>

      <MeetingPanel session={session} currentDate={current.date} />

      <section style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        <button onClick={() => { try { session.advance(1); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Advance 1 month</button>
        <button onClick={() => { try { session.advance(3); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Advance 3 months</button>
        <button onClick={() => { try { session.advance(12); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Advance 12 months</button>
        <button onClick={() => { try { advanceToNextMeeting(session); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Advance to next meeting</button>
        <button onClick={() => { try { session.reset(); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Reset</button>
      </section>

      {btnError !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, margin: "4px 0 12px" }}>{btnError}</p>
      )}

      <section style={{ display: "flex", gap: 8, alignItems: "center", margin: "16px 0" }}>
        <span style={{ fontSize: 13, color: "#666" }}>Forward-guidance stance:</span>
        <button onClick={() => { try { session.setForwardGuidanceStance("hawkish"); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Hawkish</button>
        <button onClick={() => { try { session.setForwardGuidanceStance("neutral"); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Neutral</button>
        <button onClick={() => { try { session.setForwardGuidanceStance("dovish"); setBtnError(null); } catch (e) { setBtnError(e instanceof Error ? e.message : String(e)); } }}>Dovish</button>
      </section>
    </div>
  );
}

function advanceToNextMeeting(session: Session): void {
  for (let i = 0; i < 12; i++) {
    session.advance(1);
    if (session.isMeetingMonth()) return;
  }
  throw new Error("No meeting month found within the next 12 months.");
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
    { key: "inflation", color: "#c92a2a", label: "Inflation" },
    { key: "unemployment", color: "#1864ab", label: "Unemployment" },
    { key: "policy_rate", color: "#2b8a3e", label: "Policy rate" },
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
