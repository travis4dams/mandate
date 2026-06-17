// SPEC-WEB-11: "Office of the Chair" game shell. Wraps the existing panels in
// an immersive, tabbed interface styled to the institutional Fed aesthetic.
// Four tabs: Desk (economy view), Committee (FOMC meeting), Institution, Legacy.
// The office header shows the Chair's generated name, current date, term progress,
// and a credibility gauge. All panel components are mounted here; Dashboard.tsx
// is kept as a pure "Desk content" export that this shell renders in the Desk tab.

import { useState, useMemo } from "react";
import { useSession } from "./useSession";
import { t } from "./loc";
import { MeetingPanel } from "./MeetingPanel";
import { DoctrinePanel } from "./DoctrinePanel";
import { EscalationsPanel } from "./EscalationsPanel";
import { ActivityFeed } from "./ActivityFeed";
import { InstitutionPanel } from "./InstitutionPanel";
import { LegacyPanel } from "./LegacyPanel";
import { ChartsPanel } from "./ChartsPanel";
import { useGameClock, type ClockSpeed } from "./useGameClock";
import { color, font, space, surface, heading, buttonStyle } from "./theme";

// ---- Stat tile (shared between Desk and header gauge) ----

// An engraved institutional seal — pure SVG, no assets. Gives the header instant gravitas.
function Seal(): JSX.Element {
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 15 : 6;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <svg width={50} height={50} viewBox="0 0 100 100" aria-hidden="true" data-testid="office-seal" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r="47" fill="none" stroke={color.brass} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={color.brassBright} strokeWidth="0.75" />
      <circle cx="50" cy="50" r="29" fill={color.navyMute} stroke={color.brass} strokeWidth="1.5" />
      {Array.from({ length: 36 }).map((_, i) => {
        const a = (i / 36) * Math.PI * 2;
        const r1 = 37;
        const r2 = 42;
        return (
          <line
            key={i}
            x1={(50 + r1 * Math.cos(a)).toFixed(2)}
            y1={(50 + r1 * Math.sin(a)).toFixed(2)}
            x2={(50 + r2 * Math.cos(a)).toFixed(2)}
            y2={(50 + r2 * Math.sin(a)).toFixed(2)}
            stroke={color.brass}
            strokeWidth="0.9"
            opacity="0.65"
          />
        );
      })}
      <polygon points={star} fill={color.brassBright} />
    </svg>
  );
}

function Stat(props: { label: string; value: string; testId?: string }): JSX.Element {
  return (
    <div
      style={{
        ...surface.card,
        padding: `${space.sm}px ${space.md}px`,
      }}
    >
      <div
        style={{
          ...heading.label,
        }}
      >
        {props.label}
      </div>
      <div
        data-testid={props.testId}
        style={{
          fontFamily: font.mono,
          fontSize: 20,
          fontWeight: 600,
          marginTop: 4,
          color: color.navy,
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

// ---- Tab bar types and helpers ----

type TabId = "desk" | "committee" | "institution" | "legacy";

const TABS: { id: TabId; labelKey: string; testId: string }[] = [
  { id: "desk", labelKey: "ui.shell.tab.desk", testId: "tab-desk" },
  { id: "committee", labelKey: "ui.shell.tab.committee", testId: "tab-committee" },
  { id: "institution", labelKey: "ui.shell.tab.institution", testId: "tab-institution" },
  { id: "legacy", labelKey: "ui.shell.tab.legacy", testId: "tab-legacy" },
];

// ---- AppShell props ----

export interface AppShellProps {
  scenarioId: string;
  seed: number;
  briefingId?: string;
  varDeltas?: Readonly<Record<string, number>>;
}

const fmtPercent = (n: number | undefined): string =>
  n === undefined ? "—" : `${(n * 100).toFixed(2)}%`;
const fmtPlain = (n: number | undefined, digits = 0): string =>
  n === undefined ? "—" : n.toFixed(digits);

/**
 * Advance the session to the next FOMC meeting month without mutating state first.
 * Checks future months by date string before advancing; if no meeting is found
 * in the next 12 months, this throws without having changed any game state.
 */
function advanceToNextMeeting(session: import("../../src/engine/session").Session): void {
  const parts = session.current.date.split("-");
  const baseYear = parseInt(parts[0] ?? "1979", 10);
  const baseMonth = parseInt(parts[1] ?? "01", 10);

  for (let i = 1; i <= 12; i++) {
    const totalMonthIndex = (baseYear * 12 + (baseMonth - 1)) + i;
    const futureYear = Math.floor(totalMonthIndex / 12);
    const futureMonth = (totalMonthIndex % 12) + 1;
    const futureDate = `${futureYear}-${String(futureMonth).padStart(2, "0")}`;

    if (session.isMeetingMonth(futureDate)) {
      session.advance(i);
      return;
    }
  }

  throw new Error("advanceToNextMeeting: no meeting month within 12 months");
}

// ---- Main shell component ----

export function AppShell(props: AppShellProps): JSX.Element {
  const { scenarioId, seed, briefingId, varDeltas } = props;
  const [activeTab, setActiveTab] = useState<TabId>("desk");
  const [btnError, setBtnError] = useState<string | null>(null);

  const { session, current, trajectory } = useSession(
    scenarioId,
    seed,
    "comm.fomc_1979",
    varDeltas === undefined ? undefined : { varDeltas },
  );

  function run(action: () => void): void {
    try {
      action();
      setBtnError(null);
    } catch (e) {
      setBtnError(e instanceof Error ? e.message : String(e));
    }
  }

  // SPEC-WEB-9: fogged trajectory — substitutes observed inflation/unemployment
  // into each point so the chart centers on what was actually seen each month.
  const foggedTrajectory = useMemo(
    () =>
      trajectory.map((snap, i) => ({
        ...snap,
        vars: {
          ...snap.vars,
          inflation: session.observed("inflation", i),
          unemployment: session.observed("unemployment", i),
        },
      })),
    [session, trajectory],
  );

  const clock = useGameClock(session);
  const mandateOk = session.mandateOnTarget();
  const termProg = session.termProgress();
  const credibility = current.vars.credibility;
  const chairName = session.npcName("member.chair");
  // SPEC-WEB-14: institution-depth headline readouts.
  const independence = session.independence();
  const fragility = session.bankFragility();
  const crisisActive = current.flags.crisis === true;

  return (
    <div style={{ ...surface.page, minHeight: "100vh" }}>
      {/* ---- Office header ---- */}
      <header
        style={{
          background: color.navyDeep,
          borderBottom: `2px solid ${color.brass}`,
          padding: `${space.lg}px ${space.xl}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: space.md,
        }}
      >
        {/* Left: seal + title + Chair name */}
        <div style={{ display: "flex", alignItems: "center", gap: space.md }}>
          <Seal />
          <div>
          <div
            style={{
              ...heading.label,
              color: color.brassBright,
              marginBottom: space.xs,
            }}
          >
            {t("ui.shell.office_title")}
          </div>
          <h1
            data-testid="shell-chair-name"
            style={{
              ...heading.display,
              color: color.onNavy,
              fontSize: 22,
              margin: 0,
            }}
          >
            {t("ui.shell.chair_prefix")} {chairName}
          </h1>
          </div>
        </div>

        {/* Center: date */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              ...heading.label,
              color: color.onNavySoft,
              marginBottom: space.xs,
            }}
          >
            {t("ui.dashboard.stat.date")}
          </div>
          <div
            data-testid="shell-date"
            style={{
              fontFamily: font.mono,
              fontSize: 20,
              fontWeight: 700,
              color: color.onNavy,
            }}
          >
            {current.date}
          </div>
        </div>

        {/* Right: term clock + credibility gauge */}
        <div style={{ display: "flex", gap: space.xl, alignItems: "flex-start" }}>
          <div>
            <div
              style={{
                ...heading.label,
                color: color.onNavySoft,
                marginBottom: space.xs,
              }}
            >
              {t("ui.shell.term_label")}
            </div>
            <div
              data-testid="shell-term-progress"
              style={{
                fontFamily: font.mono,
                fontSize: 14,
                color: color.onNavy,
              }}
            >
              {termProg.monthsIntoTerm} / {termProg.termLength}
            </div>
          </div>
          <div>
            <div
              style={{
                ...heading.label,
                color: color.onNavySoft,
                marginBottom: space.xs,
              }}
            >
              {t("ui.shell.credibility_label")}
            </div>
            <div
              data-testid="shell-credibility"
              style={{
                fontFamily: font.mono,
                fontSize: 14,
                color: credibility !== undefined && credibility >= 50 ? color.brassBright : color.negative,
              }}
            >
              {fmtPlain(credibility, 1)}
            </div>
          </div>
          <div>
            <div
              style={{
                ...heading.label,
                color: color.onNavySoft,
                marginBottom: space.xs,
              }}
            >
              {t("ui.shell.independence_label")}
            </div>
            <div
              data-testid="shell-independence"
              style={{
                fontFamily: font.mono,
                fontSize: 14,
                color: independence >= 50 ? color.onNavy : color.negative,
              }}
            >
              {fmtPlain(independence, 1)}
            </div>
          </div>
        </div>
      </header>

      {/* SPEC-WEB-14: a financial crisis surfaces as a prominent banner across the shell. */}
      {crisisActive && (
        <div
          data-testid="crisis-banner"
          style={{
            background: color.negative,
            color: "#fff",
            fontFamily: font.sans,
            fontSize: 13,
            fontWeight: 600,
            padding: `${space.sm}px ${space.xl}px`,
            textAlign: "center",
          }}
        >
          {t("ui.crisis.banner")}
        </div>
      )}

      {/* ---- Tab bar ---- */}
      <nav
        style={{
          background: color.navy,
          display: "flex",
          gap: 0,
          borderBottom: `1px solid ${color.navyMute}`,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={tab.testId}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontFamily: font.sans,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                padding: `${space.md}px ${space.xl}px`,
                background: "transparent",
                color: isActive ? color.brassBright : color.onNavySoft,
                border: "none",
                borderBottom: isActive ? `2px solid ${color.brass}` : "2px solid transparent",
                cursor: "pointer",
                transition: "color 120ms ease, border-color 120ms ease",
                letterSpacing: "0.03em",
              }}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </nav>

      {/* ---- Clock strip: real-time-with-pause controls (always visible) ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space.md,
          padding: `${space.sm}px ${space.xl}px`,
          background: color.navyMute,
          color: color.onNavy,
          borderBottom: `1px solid ${color.navyDeep}`,
          flexWrap: "wrap",
        }}
      >
        <button
          data-testid="clock-toggle"
          onClick={clock.toggle}
          disabled={clock.blockedByEscalation && !clock.playing}
          style={{
            ...buttonStyle("primary"),
            fontSize: 13,
            opacity: clock.blockedByEscalation && !clock.playing ? 0.5 : 1,
            cursor: clock.blockedByEscalation && !clock.playing ? "not-allowed" : "pointer",
          }}
        >
          {clock.playing ? `⏸ ${t("ui.clock.pause")}` : `▶ ${t("ui.clock.play")}`}
        </button>
        <div style={{ display: "flex", gap: 2 }}>
          {(["slow", "normal", "fast"] as ClockSpeed[]).map((s) => (
            <button
              key={s}
              data-testid={`clock-speed-${s}`}
              onClick={() => clock.setSpeed(s)}
              style={{
                fontFamily: font.sans,
                fontSize: 12,
                fontWeight: clock.speed === s ? 700 : 500,
                padding: `4px ${space.sm}px`,
                background: clock.speed === s ? color.brass : "transparent",
                color: clock.speed === s ? "#fffdf8" : color.onNavySoft,
                border: `1px solid ${clock.speed === s ? color.brass : color.navyDeep}`,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {t(`ui.clock.speed_${s}`)}
            </button>
          ))}
        </div>
        <span
          data-testid="clock-status"
          style={{
            fontSize: 12,
            fontFamily: font.sans,
            color: clock.blockedByEscalation ? color.brassBright : color.onNavySoft,
          }}
        >
          {clock.blockedByEscalation
            ? t("ui.clock.blocked")
            : session.isMeetingMonth()
              ? t("ui.clock.meeting_pause")
              : clock.playing
                ? t("ui.clock.running")
                : t("ui.clock.paused")}
        </span>
      </div>

      {/* ---- Tab content ---- */}
      <main key={activeTab} className="mnd-rise" style={{ padding: `${space.xl}px`, maxWidth: 980, margin: "0 auto" }}>
        {/* ---- Desk tab ---- */}
        {activeTab === "desk" && (
          <section>
            {/* SPEC-WEB-15: escalations in-tray sits above the economy on The Desk. */}
            <EscalationsPanel session={session} />

            <h2
              style={{
                ...heading.display,
                fontSize: 20,
                marginBottom: space.lg,
              }}
            >
              {t("ui.shell.desk.economy_heading")}
            </h2>

            {/* Stat grid — preserves all existing data-testids */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: space.md,
                margin: `${space.md}px 0`,
              }}
            >
              <Stat label={t("ui.dashboard.stat.date")} value={current.date} />
              <Stat label={t("ui.dashboard.stat.policy_rate")} value={fmtPercent(current.vars.policy_rate)} />
              <Stat label={t("ui.dashboard.stat.inflation")} value={fmtPercent(session.observed("inflation"))} testId="stat-inflation" />
              <Stat label={t("ui.dashboard.stat.unemployment")} value={fmtPercent(session.observed("unemployment"))} testId="stat-unemployment" />
              <Stat label={t("ui.dashboard.stat.credibility")} value={fmtPlain(current.vars.credibility, 1)} />
              <Stat label={t("ui.dashboard.stat.expectations_anchor")} value={fmtPercent(current.vars.expectations_anchor)} />
              <Stat label={t("ui.dashboard.stat.months_below_anchor")} value={fmtPlain(current.vars.months_below_anchor, 0)} />
              <Stat label={t("ui.dashboard.stat.months_elapsed")} value={String(trajectory.length - 1)} />
              <Stat label={t("ui.dashboard.stat.long_rate")} value={fmtPercent(current.vars.long_rate)} testId="stat-long-rate" />
              <Stat label={t("ui.dashboard.stat.output_gap")} value={fmtPercent(current.vars.output_gap)} testId="stat-output-gap" />
              <Stat label={t("ui.dashboard.stat.fragility")} value={`${(fragility * 100).toFixed(0)}%`} testId="stat-fragility" />
              {/* Mandate status tile */}
              <div
                data-testid="mandate-status"
                style={{
                  ...surface.card,
                  padding: `${space.sm}px ${space.md}px`,
                  background: mandateOk ? color.positiveSoft : color.negativeSoft,
                  borderLeft: `3px solid ${mandateOk ? color.positive : color.negative}`,
                }}
              >
                <div style={{ ...heading.label }}>
                  {t("ui.mandate.label")}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: 4,
                    color: mandateOk ? color.positive : color.negative,
                  }}
                >
                  {mandateOk ? t("ui.mandate.on") : t("ui.mandate.off")}
                </div>
              </div>
            </div>

            {/* Charts */}
            <section style={{ margin: `${space.lg}px 0` }}>
              <h3
                style={{
                  ...heading.display,
                  fontSize: 16,
                  marginBottom: space.sm,
                }}
              >
                {t("ui.dashboard.trajectory_heading")} ({trajectory.length})
              </h3>
              <ChartsPanel trajectory={foggedTrajectory} />
            </section>

            {/* Time controls */}
            <section
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: space.sm,
                margin: `${space.lg}px 0`,
              }}
            >
              <button style={buttonStyle("secondary")} onClick={() => run(() => session.advance(1))}>
                {t("ui.dashboard.button.advance_1")}
              </button>
              <button style={buttonStyle("secondary")} onClick={() => run(() => session.advance(3))}>
                {t("ui.dashboard.button.advance_3")}
              </button>
              <button style={buttonStyle("secondary")} onClick={() => run(() => session.advance(12))}>
                {t("ui.dashboard.button.advance_12")}
              </button>
              <button
                style={buttonStyle("secondary")}
                onClick={() =>
                  run(() => {
                    try {
                      advanceToNextMeeting(session);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      if (msg.startsWith("advanceToNextMeeting:")) {
                        throw new Error(t("ui.dashboard.no_meeting_in_12mo"));
                      }
                      throw e;
                    }
                  })
                }
              >
                {t("ui.dashboard.button.advance_to_meeting")}
              </button>
              <button style={buttonStyle("ghost")} onClick={() => run(() => session.reset())}>
                {t("ui.dashboard.button.reset")}
              </button>
            </section>

            {/* Guidance controls */}
            <section
              style={{
                display: "flex",
                gap: space.sm,
                alignItems: "center",
                margin: `${space.md}px 0`,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontFamily: font.sans,
                  color: color.inkSoft,
                }}
              >
                {t("ui.dashboard.guidance_label")}
              </span>
              <button
                style={buttonStyle("secondary")}
                onClick={() => run(() => session.setForwardGuidanceStance("hawkish"))}
              >
                {t("ui.dashboard.button.hawkish")}
              </button>
              <button
                style={buttonStyle("secondary")}
                onClick={() => run(() => session.setForwardGuidanceStance("neutral"))}
              >
                {t("ui.dashboard.button.neutral")}
              </button>
              <button
                style={buttonStyle("secondary")}
                onClick={() => run(() => session.setForwardGuidanceStance("dovish"))}
              >
                {t("ui.dashboard.button.dovish")}
              </button>
            </section>

            {btnError !== null && (
              <p
                style={{
                  color: color.negative,
                  fontSize: 13,
                  margin: `${space.xs}px 0 ${space.md}px`,
                  fontFamily: font.sans,
                }}
              >
                {btnError}
              </p>
            )}

            {/* SPEC-FEED-1: the activity ledger — what's happened and its felt effect. */}
            <ActivityFeed session={session} />
          </section>
        )}

        {/* ---- Committee tab ---- */}
        {activeTab === "committee" && (
          <section>
            <MeetingPanel session={session} briefingId={briefingId} />
          </section>
        )}

        {/* ---- Institution tab ---- */}
        {activeTab === "institution" && (
          <InstitutionPanel session={session} current={current} />
        )}

        {/* ---- Legacy tab ---- */}
        {activeTab === "legacy" && (
          <section>
            <LegacyPanel session={session} />
            {/* SPEC-WEB-11: doctrine is a long-horizon strategic commitment — it lives
                with the Chair's legacy, per the spec. */}
            <DoctrinePanel session={session} current={current} />
          </section>
        )}
      </main>

      {/* ---- Case-file footer: scenario + seed reference (SPEC-WEB-10 id/date visibility) ---- */}
      <footer
        style={{
          borderTop: `1px solid ${color.line}`,
          padding: `${space.sm}px ${space.xl}px`,
          fontFamily: font.mono,
          fontSize: 11,
          color: color.inkSoft,
          textAlign: "center",
          letterSpacing: "0.02em",
        }}
      >
        {t("ui.dashboard.scenario_label")} {scenarioId} · {t("ui.dashboard.seed_label")} {seed}
      </footer>
    </div>
  );
}
