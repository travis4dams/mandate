// SPEC-WEB-12: institution building panel. Shows operating budget, political
// capital, and institutional investment readouts, then lists every division
// from the catalog. Unstaffed divisions show a candidate slate with Hire
// buttons; staffed divisions show the hired head and their competence.
// Engine errors (InsufficientCapitalError, DivisionAlreadyStaffedError) are
// caught into a local useState and displayed inline — no crash.

import { useState } from "react";
import { t } from "./loc";
import { color, space, radius, font, surface, heading, buttonStyle, chipStyle } from "./theme";
import type { Session } from "../../src/engine/session";
import type { GameStateSnapshot } from "../../src/engine/state";

export function InstitutionPanel(props: {
  session: Session;
  current: GameStateSnapshot;
}): JSX.Element {
  const { session, current } = props;
  const [error, setError] = useState<string | null>(null);

  function run(action: () => void): void {
    try {
      action();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const catalog = session.divisionCatalog();
  const budget = session.operatingBudget();
  const capital = session.politicalCapital();
  const investment = session.institutionInvestment();

  return (
    <section style={{ margin: `${space.lg}px 0` }}>
      {/* --- Header --- */}
      <div style={{ marginBottom: space.lg }}>
        <h2 style={{ ...heading.display, fontSize: 20, marginBottom: space.xs }}>
          {t("ui.institution.heading")}
        </h2>
        <p style={{ ...heading.label, textTransform: "none", fontSize: 13, letterSpacing: "0.01em", color: color.inkSoft }}>
          {t("ui.institution.subtitle")}
        </p>
      </div>

      {/* --- Resource readouts --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        <div style={{ ...surface.card, textAlign: "center" }}>
          <div style={{ ...heading.label }}>{t("ui.institution.operating_budget")}</div>
          <div
            data-testid="institution-operating-budget"
            style={{ fontFamily: font.mono, fontSize: 22, color: color.navy, marginTop: space.xs }}
          >
            {budget.toFixed(1)}
          </div>
        </div>
        <div style={{ ...surface.card, textAlign: "center" }}>
          <div style={{ ...heading.label }}>{t("ui.institution.political_capital")}</div>
          <div
            data-testid="institution-political-capital"
            style={{ fontFamily: font.mono, fontSize: 22, color: color.navy, marginTop: space.xs }}
          >
            {capital.toFixed(1)}
          </div>
        </div>
        <div style={{ ...surface.card, textAlign: "center" }}>
          <div style={{ ...heading.label }}>{t("ui.institution.investment_label")}</div>
          <div
            data-testid="institution-investment"
            style={{ fontFamily: font.mono, fontSize: 22, color: color.navy, marginTop: space.xs }}
          >
            {investment.toFixed(2)}
          </div>
        </div>
      </div>

      {/* --- Divisions heading --- */}
      <h3
        style={{
          fontFamily: font.sans,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: color.inkSoft,
          margin: `0 0 ${space.md}px`,
        }}
      >
        {t("ui.institution.divisions_heading")}
      </h3>

      {/* --- Division cards --- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(1, 1fr)", gap: space.md }}>
        {catalog.map((division) => {
          const staffed = session.isStaffed(division.id);
          const competence = current.vars[`staff.${division.id}.competence`] ?? 0;

          return (
            <div
              key={division.id}
              data-testid={`division-${division.id}`}
              style={{
                ...surface.card,
                borderLeft: staffed
                  ? `4px solid ${color.brass}`
                  : `4px solid ${color.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: space.sm }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: space.xs }}>
                    <strong style={{ fontFamily: font.display, fontSize: 15, color: color.navy }}>
                      {t(division.name)}
                    </strong>
                    {staffed ? (
                      <span style={{ ...chipStyle("positive") }}>{t("ui.institution.staffed_badge")}</span>
                    ) : (
                      <span style={{ ...chipStyle("neutral") }}>{t("ui.institution.unstaffed_badge")}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: color.inkSoft, margin: 0 }}>{t(division.desc)}</p>
                </div>
                {!staffed && (
                  <div
                    style={{
                      fontSize: 12,
                      color: color.inkSoft,
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    <span style={{ ...heading.label }}>{t("ui.institution.hire_cost_label")}</span>
                    <div style={{ fontFamily: font.mono, color: color.caution, fontSize: 14 }}>
                      {division.hire_cost}
                    </div>
                  </div>
                )}
              </div>

              {/* Staffed: show division head competence */}
              {staffed && (
                <div style={{ marginTop: space.sm, display: "flex", gap: space.xl }}>
                  <div>
                    <div style={{ ...heading.label }}>{t("ui.institution.head_label")}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>
                      {t("ui.institution.competence_label")}: {(competence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              )}

              {/* Unstaffed: candidate slate */}
              {!staffed && (
                <div style={{ marginTop: space.md }}>
                  <div
                    style={{
                      ...heading.label,
                      marginBottom: space.sm,
                    }}
                  >
                    {t("ui.institution.candidates_heading")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                    {session.candidatesFor(division.id).map((candidate, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: space.md,
                          background: color.parchment,
                          borderRadius: radius.sm,
                          padding: `${space.sm}px ${space.md}px`,
                          border: `1px solid ${color.line}`,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: color.ink }}>
                            {candidate.name}
                          </div>
                          <div style={{ fontSize: 12, color: color.inkSoft, display: "flex", gap: space.md, marginTop: 2 }}>
                            <span>
                              {t("ui.institution.competence_label")}: {(candidate.competence * 100).toFixed(0)}%
                            </span>
                            <span>
                              {t("ui.institution.lean_label")}: {t(`ui.institution.lean.${candidate.lean}`)}
                            </span>
                          </div>
                        </div>
                        <button
                          data-testid={`hire-${division.id}-${index}`}
                          style={{ ...buttonStyle("primary"), fontSize: 12 }}
                          onClick={() => run(() => session.hire(division.id, index))}
                        >
                          {t("ui.institution.hire_button")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- Inline error --- */}
      {error !== null && (
        <p
          data-testid="institution-error"
          style={{ color: color.negative, fontSize: 13, margin: `${space.sm}px 0 0` }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
