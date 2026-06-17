// SPEC-WEB-15: escalations in-tray. Renders events that division heads have
// escalated for a Chair decision — session.escalations() + resolveEscalation.
// Empty state is shown when the queue is empty.

import { t } from "./loc";
import { color, font, space, surface, heading, buttonStyle } from "./theme";
import type { Session } from "../../src/engine/session";

export function EscalationsPanel(props: { session: Session }): JSX.Element {
  const { session } = props;
  const events = session.escalations();

  return (
    <section style={{ margin: `0 0 ${space.xl}px` }}>
      {/* --- Header --- */}
      <div style={{ marginBottom: space.md }}>
        <h2 style={{ ...heading.display, fontSize: 18, marginBottom: space.xs }}>
          {t("ui.escalations.heading")}
        </h2>
        <p
          style={{
            ...heading.label,
            textTransform: "none",
            fontSize: 12,
            letterSpacing: "0.01em",
            color: color.inkSoft,
            margin: 0,
          }}
        >
          {t("ui.escalations.subtitle")}
        </p>
      </div>

      {/* --- Empty state --- */}
      {events.length === 0 && (
        <div
          style={{
            ...surface.card,
            color: color.inkSoft,
            fontSize: 13,
            fontFamily: font.sans,
            padding: `${space.lg}px ${space.lg}px`,
          }}
        >
          {t("ui.escalations.empty")}
        </div>
      )}

      {/* --- Escalation cards --- */}
      {events.map((evt) => (
        <div
          key={evt.id}
          data-testid={`escalation-${evt.id}`}
          style={{
            ...surface.card,
            marginBottom: space.md,
            borderLeft: `4px solid ${color.caution}`,
          }}
        >
          {/* Title */}
          <div
            style={{
              fontFamily: font.display,
              fontSize: 15,
              fontWeight: 700,
              color: color.navy,
              marginBottom: space.xs,
            }}
          >
            {t(evt.title)}
          </div>

          {/* Body text */}
          {evt.desc !== undefined && (
            <p
              style={{
                fontSize: 13,
                color: color.inkSoft,
                fontFamily: font.sans,
                margin: `0 0 ${space.md}px`,
              }}
            >
              {t(evt.desc)}
            </p>
          )}

          {/* Options */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
            {evt.options.map((opt) => (
              <button
                key={opt.id}
                data-testid={`escalation-opt-${evt.id}-${opt.id}`}
                style={{ ...buttonStyle("secondary"), fontSize: 12 }}
                onClick={() => session.resolveEscalation(evt.id, opt.id)}
              >
                {t(opt.name)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
