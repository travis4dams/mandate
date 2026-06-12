// SPEC-WEB-7: doctrine management panel. Lists the doctrine catalog, shows
// adopted state from the current snapshot's flags, and drives
// Session.adoptDoctrine/abandonDoctrine. Abandoning is deliberately two-step
// so the flip-flop credibility cost is visible before it is committed.

import { useState } from "react";
import { t } from "./loc";
import { loadDoctrineCatalog } from "../../src/content/doctrines";
import { doctrineFlagKey } from "../../src/engine/doctrine";
import type { Session } from "../../src/engine/session";
import type { GameStateSnapshot } from "../../src/engine/state";

export function DoctrinePanel(props: {
  session: Session;
  current: GameStateSnapshot;
}): JSX.Element {
  const { session, current } = props;
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const catalog = loadDoctrineCatalog();

  function run(action: () => void): void {
    try {
      action();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section style={{ margin: "16px 0" }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{t("ui.doctrine.heading")}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {catalog.map((d) => {
          const adopted = current.flags[doctrineFlagKey(d.id)] === true;
          const confirming = confirmingId === d.id;
          return (
            <div
              key={d.id}
              data-testid={`doctrine-card-${d.id}`}
              style={{ border: "1px solid #ddd", borderRadius: 6, padding: "10px 12px", background: "#fafafa" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{t(d.name)}</strong>
                {adopted && (
                  <span
                    style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "#2b8a3e", color: "#fff" }}
                  >
                    {t("ui.doctrine.adopted_badge")}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>{t(d.description)}</p>
              {!adopted && (
                <button onClick={() => run(() => { session.adoptDoctrine(d.id); setConfirmingId(null); })}>
                  {t("ui.doctrine.adopt")}
                </button>
              )}
              {adopted && !confirming && (
                <button onClick={() => setConfirmingId(d.id)}>{t("ui.doctrine.abandon")}</button>
              )}
              {adopted && confirming && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span data-testid="flip-flop-cost" style={{ fontSize: 12, color: "#c92a2a" }}>
                    {t("ui.doctrine.flip_flop_label")} {d.flip_flop_cost}
                  </span>
                  <button onClick={() => run(() => { session.abandonDoctrine(d.id); setConfirmingId(null); })}>
                    {t("ui.doctrine.confirm_abandon")}
                  </button>
                  <button onClick={() => setConfirmingId(null)}>{t("ui.doctrine.cancel")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, margin: "4px 0 0" }}>{error}</p>
      )}
    </section>
  );
}
