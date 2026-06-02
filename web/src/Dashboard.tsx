// SPEC-WEB-2: dashboard for the engine. Shows current state, a small chart of the
// trajectory so far, and controls to advance time. The dashboard is intentionally
// minimal — SPEC-WEB-3 will replace the inline SVG chart with @observablehq/plot
// and SPEC-WEB-4 will add the FOMC meeting panel.

import { useSession } from "./useSession";

const fmtPercent = (n: number | undefined): string =>
  n === undefined ? "—" : `${(n * 100).toFixed(2)}%`;
const fmtPlain = (n: number | undefined, digits = 0): string =>
  n === undefined ? "—" : n.toFixed(digits);

export function Dashboard(): JSX.Element {
  const { session, current, trajectory } = useSession(
    "scen.1979_stagflation",
    42,
    "comm.fomc_1979",
  );

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

      <section style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button onClick={() => session.advance(1)}>Advance 1 month</button>
        <button onClick={() => session.advance(3)}>Advance 3 months</button>
        <button onClick={() => session.advance(12)}>Advance 12 months</button>
        <button onClick={() => session.reset()}>Reset</button>
      </section>
    </div>
  );
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
