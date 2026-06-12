// SPEC-WEB-10: new-game start screen. Lists playable scenarios from the
// catalog (test fixtures stay hidden), takes an optional seed, and offers the
// confirmation-hearing path: answers resolve deterministically through the
// hearing resolver to a starting scenario plus state modifiers (varDeltas).

import { useState } from "react";
import { t } from "./loc";
import { loadScenarioCatalog, type Scenario } from "../../src/content/scenarios";
import { loadHearing, resolveHearing, type HearingEntry } from "../../src/content/hearings";

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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "24px" }}>
      <h1 style={{ margin: 0 }}>{t("ui.start.title")}</h1>
      <p style={{ color: "#666", marginTop: 4 }}>{t("ui.start.subtitle")}</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <label style={{ fontSize: 13 }} htmlFor="seed-input">{t("ui.start.seed_label")}</label>
        <input
          id="seed-input"
          type="number"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          data-testid="seed-input"
          style={{ width: 100, padding: "4px 6px", fontFamily: "monospace" }}
        />
      </div>

      {!hearingMode && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t("ui.start.scenarios_heading")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {playable.map((s) => (
              <div
                key={s.id}
                style={{ border: "1px solid #ddd", borderRadius: 6, padding: "10px 12px", background: "#fafafa" }}
              >
                <strong>{t(s.name)}</strong>
                <p style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>{t(s.desc)}</p>
                <p style={{ fontSize: 12, color: "#999", margin: "6px 0" }}>{s.date}</p>
                <button data-testid={`start-scenario-${s.id}`} onClick={() => startScenario(s)}>
                  {t("ui.start.begin")}
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <button data-testid="start-hearing-mode" onClick={() => setHearingMode(true)}>
              {t("ui.start.hearing.enter")}
            </button>
          </div>
        </>
      )}

      {hearing !== null && (
        <div>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{t(hearing.name)}</h2>
          <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>{t(hearing.desc)}</p>
          {hearing.questions.map((q) => (
            <fieldset key={q.id} style={{ border: "1px solid #ddd", borderRadius: 6, margin: "10px 0", padding: "8px 12px" }}>
              <legend style={{ fontSize: 13, fontWeight: 600 }}>{t(q.text)}</legend>
              {q.answers.map((a) => (
                <label key={a.id} style={{ display: "block", fontSize: 13, margin: "6px 0" }}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === a.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: a.id }))}
                    data-testid={`answer-${a.id}`}
                  />{" "}
                  {t(a.text)}
                </label>
              ))}
            </fieldset>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="hearing-begin" onClick={() => startHearing(hearing)}>
              {t("ui.start.hearing.begin")}
            </button>
            <button onClick={() => { setHearingMode(false); setError(null); }}>
              {t("ui.start.hearing.back")}
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}
