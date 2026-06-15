// SPEC-WEB-13: Legacy panel — tenure clock, reappointment outlook, and legacy
// score. Reads from the Session surface (termProgress, reappointmentOutlook,
// legacyScore) which are all pure derived values; no additional state needed.
// Styled to the shared "Office of the Chair" design tokens (theme.ts).

import { t } from "./loc";
import { color, font, space, radius, shadow, surface, heading, chipStyle } from "./theme";
import type { Session } from "../../src/engine/session";

export interface LegacyPanelProps {
  session: Session;
}

export function LegacyPanel({ session }: LegacyPanelProps): JSX.Element {
  const term = session.termProgress();
  const reappt = session.reappointmentOutlook();
  const score = session.legacyScore();

  return (
    <section style={{ margin: `${space.lg}px 0` }}>
      {/* Heading */}
      <h2
        data-testid="legacy-heading"
        style={{ ...heading.display, fontSize: 22, marginBottom: space.sm }}
      >
        {t("ui.legacy.heading")}
      </h2>
      <p style={{ fontFamily: font.sans, fontSize: 13, color: color.inkSoft, marginTop: 0, marginBottom: space.xl }}>
        {t("ui.legacy.subtitle")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: space.lg }}>
        {/* Tenure clock card */}
        <div style={{ ...surface.card, display: "flex", flexDirection: "column", gap: space.md }}>
          <div style={{ ...heading.label }}>{t("ui.legacy.term_clock_heading")}</div>

          <StatRow label={t("ui.legacy.terms_served")}>
            <span
              data-testid="legacy-terms-served"
              style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: color.navy }}
            >
              {term.termsServed}
            </span>
          </StatRow>

          <StatRow label={t("ui.legacy.months_into_term")}>
            <span
              data-testid="legacy-months-into-term"
              style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: color.navy }}
            >
              {term.monthsIntoTerm}
            </span>
            <span style={{ fontFamily: font.sans, fontSize: 12, color: color.inkSoft, marginLeft: space.xs }}>
              {t("ui.legacy.term_clock_heading").toLowerCase().includes("tenure") ? "" : ""}
              / {term.termLength}
            </span>
          </StatRow>

          <StatRow label={t("ui.legacy.months_to_reappointment")}>
            <span
              data-testid="legacy-months-to-reappointment"
              style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: color.navy }}
            >
              {term.monthsToReappointment}
            </span>
          </StatRow>
        </div>

        {/* Reappointment outlook card */}
        <div style={{ ...surface.card, display: "flex", flexDirection: "column", gap: space.md }}>
          <div style={{ ...heading.label }}>{t("ui.legacy.reappointment_heading")}</div>

          <div
            data-testid="legacy-reappointment-status"
            style={{
              ...chipStyle(reappt.reappointed ? "positive" : "negative"),
              fontSize: 13,
              padding: `${space.sm}px ${space.md}px`,
              borderRadius: radius.sm,
            }}
          >
            {reappt.reappointed
              ? t("ui.legacy.reappointment_pass")
              : t("ui.legacy.reappointment_fail")}
          </div>

          <StatRow label={t("ui.legacy.reappointment_threshold")}>
            <span
              data-testid="legacy-reappointment-threshold"
              style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: color.navy }}
            >
              {reappt.threshold}
            </span>
          </StatRow>
        </div>

        {/* Legacy score card */}
        <div
          style={{
            ...surface.card,
            display: "flex",
            flexDirection: "column",
            gap: space.md,
            boxShadow: shadow.raised,
          }}
        >
          <div style={{ ...heading.label }}>{t("ui.legacy.legacy_score_heading")}</div>
          <div
            data-testid="legacy-score"
            style={{
              fontFamily: font.display,
              fontSize: 48,
              fontWeight: 700,
              color: color.brass,
              lineHeight: 1,
              letterSpacing: "0.01em",
            }}
          >
            {score.toFixed(1)}
          </div>
        </div>
      </div>
    </section>
  );
}

// Small label+value layout helper (no testId needed; children carry their own).
function StatRow(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: color.inkSoft }}>
        {props.label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: space.xs }}>
        {props.children}
      </div>
    </div>
  );
}
