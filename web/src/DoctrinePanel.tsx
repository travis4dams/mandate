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
import { color, font, space, surface, heading, buttonStyle, chipStyle } from "./theme";

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
    <section style={{ margin: `${space.xl}px 0` }}>
      <h2 style={{ ...heading.display, fontSize: 18, marginBottom: space.md }}>
        {t("ui.doctrine.heading")}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space.md }}>
        {catalog.map((d) => {
          const adopted = current.flags[doctrineFlagKey(d.id)] === true;
          const confirming = confirmingId === d.id;
          return (
            <div
              key={d.id}
              data-testid={`doctrine-card-${d.id}`}
              style={{
                ...surface.card,
                borderLeft: adopted ? `3px solid ${color.brass}` : `3px solid transparent`,
                background: adopted ? color.parchmentRaised : color.parchment,
                transition: "border-color 150ms ease, background 150ms ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: space.xs }}>
                <strong
                  style={{
                    fontFamily: font.display,
                    fontSize: 15,
                    color: color.navy,
                    letterSpacing: "0.01em",
                  }}
                >
                  {t(d.name)}
                </strong>
                {adopted && (
                  <span style={chipStyle("positive")}>
                    {t("ui.doctrine.adopted_badge")}
                  </span>
                )}
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: color.inkSoft,
                  margin: `${space.xs}px 0 ${space.sm}px`,
                  fontFamily: font.sans,
                  lineHeight: 1.5,
                }}
              >
                {t(d.description)}
              </p>
              {!adopted && (
                <button
                  style={buttonStyle("primary")}
                  onClick={() => run(() => { session.adoptDoctrine(d.id); setConfirmingId(null); })}
                >
                  {t("ui.doctrine.adopt")}
                </button>
              )}
              {adopted && !confirming && (
                <button
                  style={buttonStyle("secondary")}
                  onClick={() => setConfirmingId(d.id)}
                >
                  {t("ui.doctrine.abandon")}
                </button>
              )}
              {adopted && confirming && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
                  <span
                    data-testid="flip-flop-cost"
                    style={{
                      ...chipStyle("negative"),
                      fontSize: 12,
                    }}
                  >
                    {t("ui.doctrine.flip_flop_label")} {d.flip_flop_cost}
                  </span>
                  <button
                    style={{ ...buttonStyle("secondary"), borderColor: color.negative, color: color.negative }}
                    onClick={() => run(() => { session.abandonDoctrine(d.id); setConfirmingId(null); })}
                  >
                    {t("ui.doctrine.confirm_abandon")}
                  </button>
                  <button
                    style={buttonStyle("ghost")}
                    onClick={() => setConfirmingId(null)}
                  >
                    {t("ui.doctrine.cancel")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error !== null && (
        <p
          style={{
            color: color.negative,
            fontSize: 13,
            margin: `${space.xs}px 0 0`,
            fontFamily: font.sans,
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
