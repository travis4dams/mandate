// SPEC-FEED-1: the Chair's activity ledger — shows recent happenings and the felt
// effect each had on the economy, so decisions and events visibly matter.

import type { Session } from "../../src/engine/session";
import { t } from "./loc";
import { color, font, space, surface, heading } from "./theme";

// Vars carried as 0–1 fractions are shown in percentage points; the rest as plain deltas.
const PP_VARS = new Set(["inflation", "unemployment", "bank_fragility", "output_gap"]);

function formatDelta(v: string, delta: number): string {
  const sign = delta >= 0 ? "+" : "−";
  const mag = Math.abs(delta);
  if (PP_VARS.has(v)) return `${sign}${(mag * 100).toFixed(2)}pp`;
  return `${sign}${mag.toFixed(1)}`;
}

export function ActivityFeed(props: { session: Session }): JSX.Element {
  const entries = props.session.activityLog();

  return (
    <section data-testid="activity-feed" style={{ ...surface.card, marginTop: space.lg }}>
      <div style={{ ...heading.label, marginBottom: space.sm }}>{t("ui.feed.heading")}</div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: color.inkSoft, fontFamily: font.sans, margin: 0 }}>
          {t("ui.feed.empty")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space.xs, maxHeight: 220, overflowY: "auto" }}>
          {entries.map((e, i) => (
            <div
              key={`${e.date}-${i}`}
              data-testid="activity-entry"
              style={{
                display: "flex",
                gap: space.sm,
                alignItems: "baseline",
                paddingBottom: space.xs,
                borderBottom: i < entries.length - 1 ? `1px solid ${color.line}` : "none",
                fontFamily: font.sans,
                fontSize: 12,
              }}
            >
              <span style={{ fontFamily: font.mono, color: color.inkSoft, minWidth: 56 }}>{e.date}</span>
              <span style={{ flex: 1, color: color.ink }}>
                {t(e.titleKey)}
                {e.deltas.length > 0 && (
                  <span style={{ color: color.inkSoft }}>
                    {" — "}
                    {e.deltas.map((d, j) => (
                      <span key={d.var}>
                        {j > 0 && ", "}
                        <span style={{ color: d.delta >= 0 ? color.positive : color.negative, fontFamily: font.mono }}>
                          {formatDelta(d.var, d.delta)}
                        </span>{" "}
                        {t(`ui.feed.var.${d.var}`)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
