// SPEC-WEB-10: new-game start screen. Lists playable scenarios from the
// catalog (test fixtures stay hidden), takes an optional seed, and offers the
// confirmation-hearing path: answers resolve deterministically through the
// hearing resolver to a starting scenario plus state modifiers (varDeltas).

import { useState } from "react";
import { t } from "./loc";
import { loadScenarioCatalog, type Scenario } from "../../src/content/scenarios";
import { loadHearing, resolveHearing, type HearingEntry } from "../../src/content/hearings";
import { color, font, space, radius, shadow, surface, heading, buttonStyle } from "./theme";

export interface StartConfig {
  scenarioId: string;
  seed: number;
  briefingId?: string;
  varDeltas?: Readonly<Record<string, number>>;
}

const DEFAULT_SEED = 42;
const HEARING_ID = "hearing.confirmation";

export function StartScreen(props: { onStart: (config: StartConfig) => void }): JSX.Element {
  const { onStart } = props;
  const [seedInput, setSeedInput] = useState<string>(String(DEFAULT_SEED));
  const [hearingMode, setHearingMode] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const catalog = loadScenarioCatalog();
  const playable = catalog.filter((s) => s.playable === true);
  const briefingOf = (id: string): string | undefined =>
    catalog.find((s) => s.id === id)?.briefing;

  const parsedSeed = parseInt(seedInput, 10);
  const seed = Number.isFinite(parsedSeed) ? parsedSeed : DEFAULT_SEED;

  function startScenario(s: Scenario): void {
    onStart({ scenarioId: s.id, seed, briefingId: s.briefing });
  }

  function startHearing(hearing: HearingEntry): void {
    try {
      const ordered = hearing.questions.map((q) => {
        const a = answers[q.id];
        if (a === undefined) throw new Error(t("ui.start.hearing.incomplete"));
        return a;
      });
      const result = resolveHearing(ordered, hearing);
      const varDeltas: Record<string, number> = {};
      for (const mod of result.modifiers) {
        varDeltas[mod.target] = (varDeltas[mod.target] ?? 0) + mod.delta;
      }
      onStart({
        scenarioId: result.scenarioId,
        seed,
        briefingId: briefingOf(result.scenarioId),
        varDeltas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const hearing = hearingMode ? loadHearing(HEARING_ID) : null;

  return (
    <div
      style={{
        ...surface.page,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: `${space.xxl * 2}px ${space.xl}px`,
      }}
    >
      {/* ── Title block ── */}
      <div style={{ textAlign: "center", marginBottom: space.xxl, maxWidth: 560 }}>
        <div
          style={{
            display: "inline-block",
            padding: `${space.xs}px ${space.lg}px`,
            border: `1px solid ${color.brass}`,
            borderRadius: radius.sm,
            marginBottom: space.lg,
          }}
        >
          <span style={{ ...heading.label, color: color.brass }}>
            Federal Reserve — Office of the Chair
          </span>
        </div>
        <h1
          style={{
            fontFamily: font.display,
            fontSize: 42,
            color: color.navy,
            margin: `0 0 ${space.sm}px`,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
          }}
        >
          {t("ui.start.title")}
        </h1>
        <p
          style={{
            fontFamily: font.sans,
            color: color.inkSoft,
            fontSize: 16,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {t("ui.start.subtitle")}
        </p>
      </div>

      {/* ── Seed row ── */}
      <div
        style={{
          display: "flex",
          gap: space.sm,
          alignItems: "center",
          marginBottom: space.xl,
        }}
      >
        <label
          style={{ fontSize: 13, fontFamily: font.sans, color: color.inkSoft }}
          htmlFor="seed-input"
        >
          {t("ui.start.seed_label")}
        </label>
        <input
          id="seed-input"
          type="number"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          data-testid="seed-input"
          style={{
            width: 100,
            padding: `${space.xs}px ${space.sm}px`,
            fontFamily: font.mono,
            fontSize: 13,
            border: `1px solid ${color.line}`,
            borderRadius: radius.sm,
            background: color.parchmentRaised,
            color: color.ink,
          }}
        />
      </div>

      {!hearingMode && (
        <div style={{ width: "100%", maxWidth: 800 }}>
          {/* ── Confirmation Hearing — marquee path ── */}
          <div
            style={{
              background: color.navy,
              borderRadius: radius.lg,
              padding: `${space.xxl}px ${space.xl}px`,
              marginBottom: space.xxl,
              boxShadow: shadow.raised,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: space.md,
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: `${space.xs}px ${space.lg}px`,
                border: `1px solid ${color.brass}`,
                borderRadius: radius.sm,
              }}
            >
              <span style={{ ...heading.label, color: color.brass }}>
                Recommended
              </span>
            </div>
            <h2
              style={{
                fontFamily: font.display,
                fontSize: 26,
                color: color.onNavy,
                margin: 0,
                letterSpacing: "0.01em",
              }}
            >
              Confirmation Hearing
            </h2>
            <p
              style={{
                fontFamily: font.sans,
                color: color.onNavySoft,
                fontSize: 14,
                margin: 0,
                maxWidth: 420,
                lineHeight: 1.6,
              }}
            >
              Answer questions before the Senate Banking Committee. Your responses determine your
              starting mandate, credibility, and the economic conditions you inherit.
            </p>
            <button
              data-testid="start-hearing-mode"
              style={{
                ...buttonStyle("primary"),
                fontSize: 14,
                padding: `${space.sm}px ${space.xl}px`,
                background: color.brass,
                marginTop: space.xs,
              }}
              onClick={() => setHearingMode(true)}
            >
              {t("ui.start.hearing.enter")}
            </button>
          </div>

          {/* ── Scenario quick-start grid ── */}
          <h2
            style={{
              ...heading.display,
              fontSize: 16,
              marginBottom: space.md,
            }}
          >
            {t("ui.start.scenarios_heading")}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space.md }}>
            {playable.map((s) => (
              <div
                key={s.id}
                style={{
                  ...surface.card,
                  display: "flex",
                  flexDirection: "column",
                  gap: space.xs,
                }}
              >
                <strong
                  style={{
                    fontFamily: font.display,
                    fontSize: 15,
                    color: color.navy,
                    letterSpacing: "0.01em",
                  }}
                >
                  {t(s.name)}
                </strong>
                <p
                  style={{
                    fontSize: 12,
                    color: color.inkSoft,
                    margin: 0,
                    fontFamily: font.sans,
                    lineHeight: 1.5,
                    flexGrow: 1,
                  }}
                >
                  {t(s.desc)}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    margin: `0 0 ${space.xs}px`,
                    fontFamily: font.mono,
                    color: color.brass,
                  }}
                >
                  {s.date}
                </p>
                <button
                  data-testid={`start-scenario-${s.id}`}
                  style={buttonStyle("secondary")}
                  onClick={() => startScenario(s)}
                >
                  {t("ui.start.begin")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {hearing !== null && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
          }}
        >
          <div style={{ marginBottom: space.xl }}>
            <h2
              style={{
                ...heading.display,
                fontSize: 22,
                marginBottom: space.xs,
              }}
            >
              {t(hearing.name)}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: color.inkSoft,
                margin: 0,
                fontFamily: font.sans,
                lineHeight: 1.6,
              }}
            >
              {t(hearing.desc)}
            </p>
          </div>
          {hearing.questions.map((q) => (
            <fieldset
              key={q.id}
              style={{
                border: `1px solid ${color.line}`,
                borderRadius: radius.md,
                margin: `0 0 ${space.md}px`,
                padding: `${space.sm}px ${space.md}px`,
                background: color.parchmentRaised,
              }}
            >
              <legend
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: font.sans,
                  color: color.navy,
                  padding: `0 ${space.xs}px`,
                }}
              >
                {t(q.text)}
              </legend>
              {q.answers.map((a) => (
                <label
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: space.sm,
                    fontSize: 13,
                    margin: `${space.sm}px 0`,
                    fontFamily: font.sans,
                    color: answers[q.id] === a.id ? color.navy : color.ink,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === a.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: a.id }))}
                    data-testid={`answer-${a.id}`}
                    style={{ accentColor: color.brass, marginTop: 2 }}
                  />{" "}
                  {t(a.text)}
                </label>
              ))}
            </fieldset>
          ))}
          <div style={{ display: "flex", gap: space.sm }}>
            <button
              data-testid="hearing-begin"
              style={{
                ...buttonStyle("primary"),
                fontSize: 14,
                padding: `${space.sm}px ${space.xl}px`,
              }}
              onClick={() => startHearing(hearing)}
            >
              {t("ui.start.hearing.begin")}
            </button>
            <button
              style={buttonStyle("ghost")}
              onClick={() => { setHearingMode(false); setError(null); }}
            >
              {t("ui.start.hearing.back")}
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <p
          style={{
            color: color.negative,
            fontSize: 13,
            marginTop: space.sm,
            fontFamily: font.sans,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
