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
import { directorEffectiveness } from "../../src/engine/institution";

// SPEC-WEB-14: localize the institution's policy-lean readout from a numeric tilt.
function leanLabel(lean: number): string {
  if (lean > 0.15) return t("ui.institution.lean.hawk");
  if (lean < -0.15) return t("ui.institution.lean.dove");
  return t("ui.institution.lean.centrist");
}

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
  const effects = session.divisionEffects();
  const culture = session.culture();
  const balanceSheet = session.balanceSheet();
  const netIncome = session.netIncome();
  const deferredAsset = session.deferredAsset();
  const inDeferredAsset = deferredAsset > 0;

  // SPEC-WEB-14: the channels a staffed institution is actively contributing.
  const effectRows: { key: string; label: string; value: string }[] = [
    { key: "fog", label: t("ui.institution.effect.fog"), value: `${((1 - effects.fogFactor) * 100).toFixed(0)}%` },
    { key: "transmission", label: t("ui.institution.effect.transmission"), value: effects.transmission.toFixed(2) },
    { key: "fragility_visibility", label: t("ui.institution.effect.fragility_visibility"), value: effects.fragilityVisibility.toFixed(2) },
    { key: "fragility_mitigation", label: t("ui.institution.effect.fragility_mitigation"), value: effects.fragilityMitigation.toFixed(2) },
    { key: "crisis_severity", label: t("ui.institution.effect.crisis_severity"), value: effects.crisisSeverityReduction.toFixed(2) },
    { key: "external_shock", label: t("ui.institution.effect.external_shock"), value: `${((1 - effects.externalShockDamp) * 100).toFixed(0)}%` },
  ];

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

      {/* --- Fed finances --- */}
      <div
        data-testid="fed-finances"
        style={{
          ...surface.card,
          marginBottom: space.lg,
          borderLeft: inDeferredAsset ? `4px solid ${color.negative}` : `4px solid ${color.line}`,
        }}
      >
        <div style={{ ...heading.label, marginBottom: space.sm }}>{t("ui.institution.finances_heading")}</div>
        <div style={{ display: "flex", gap: space.xl, flexWrap: "wrap" }}>
          <FinanceStat label={t("ui.institution.balance_sheet")} value={balanceSheet.toFixed(2)} />
          <FinanceStat
            label={t("ui.institution.net_income")}
            value={netIncome.toFixed(3)}
            tone={netIncome < 0 ? color.negative : color.positive}
          />
          <FinanceStat
            label={t("ui.institution.deferred_asset")}
            value={deferredAsset.toFixed(2)}
            tone={inDeferredAsset ? color.negative : color.ink}
            testId="fed-deferred-asset"
          />
        </div>
        {inDeferredAsset && (
          <p style={{ color: color.negative, fontSize: 12, margin: `${space.sm}px 0 0` }}>
            {t("ui.institution.deferred_asset_warning")}
          </p>
        )}
      </div>

      {/* --- Institutional culture --- */}
      <div style={{ ...surface.card, marginBottom: space.lg }}>
        <div style={{ ...heading.label, marginBottom: space.sm }}>{t("ui.institution.culture_heading")}</div>
        <div style={{ display: "flex", gap: space.xl, flexWrap: "wrap" }}>
          <FinanceStat label={t("ui.institution.culture.policy_lean")} value={leanLabel(culture.policyLean)} />
          <FinanceStat label={t("ui.institution.culture.supervisory_rigor")} value={`${(culture.supervisoryRigor * 100).toFixed(0)}%`} />
        </div>
      </div>

      {/* --- What your divisions are doing (SPEC-DIV-1 channels) --- */}
      <div style={{ ...surface.card, marginBottom: space.xl }}>
        <div style={{ ...heading.label, marginBottom: space.sm }}>{t("ui.institution.effects_heading")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: space.sm }}>
          {effectRows.map((r) => (
            <div key={r.key} style={{ fontSize: 12, color: color.inkSoft }}>
              {r.label}: <span style={{ fontFamily: font.mono, color: color.navy }}>{r.value}</span>
            </div>
          ))}
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
                    {/* SPEC-WEB-15: label explicitly calls out operating-budget cost. */}
                    <span style={{ ...heading.label }}>{t("ui.institution.hire_cost_budget_label")}</span>
                    <div style={{ fontFamily: font.mono, color: color.caution, fontSize: 14 }}>
                      {division.hire_cost}
                    </div>
                  </div>
                )}
              </div>

              {/* Staffed: show division head competence + Dismiss button */}
              {staffed && (
                <div style={{ marginTop: space.sm, display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.xl }}>
                  <div>
                    <div style={{ ...heading.label }}>{t("ui.institution.head_label")}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 13, color: color.ink }}>
                      {t("ui.institution.competence_label")}: {(competence * 100).toFixed(0)}%
                    </div>
                  </div>
                  {/* SPEC-WEB-15: dismiss/fire button — calls session.fire(divisionId). */}
                  <button
                    data-testid={`fire-${division.id}`}
                    style={{ ...buttonStyle("secondary"), fontSize: 12, color: color.negative, borderColor: color.negative }}
                    onClick={() => run(() => session.fire(division.id))}
                  >
                    {t("ui.institution.dismiss_button")}
                  </button>
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
                          <div style={{ fontSize: 12, color: color.inkSoft, display: "flex", gap: space.md, marginTop: 2, flexWrap: "wrap" }}>
                            <span>
                              {t("ui.institution.competence_label")}: {(candidate.competence * 100).toFixed(0)}%
                            </span>
                            {/* SPEC-WEB-15: hawk/dove lean is NOT shown for candidates —
                                only fit and skills are surfaced to the player. */}
                            {/* SPEC-WEB-14: the fit computed for THIS division — a poor match is
                                visible before hiring. The hidden disposition is deliberately NOT shown. */}
                            <span
                              data-testid={`candidate-fit-${division.id}-${index}`}
                              style={{ color: color.brass, fontWeight: 600 }}
                            >
                              {t("ui.institution.fit_label")}: {(directorEffectiveness(candidate.skills, division.skill_weights) * 100).toFixed(0)}%
                            </span>
                          </div>
                          {/* SPEC-WEB-14: the skill vector (no disposition). */}
                          <div style={{ fontSize: 11, color: color.inkSoft, marginTop: 2 }}>
                            {t("ui.institution.skills_label")}:{" "}
                            {t("ui.institution.skill.forecasting")} {(candidate.skills.forecasting * 100).toFixed(0)} ·{" "}
                            {t("ui.institution.skill.markets")} {(candidate.skills.markets * 100).toFixed(0)} ·{" "}
                            {t("ui.institution.skill.supervision")} {(candidate.skills.supervision * 100).toFixed(0)} ·{" "}
                            {t("ui.institution.skill.communication")} {(candidate.skills.communication * 100).toFixed(0)} ·{" "}
                            {t("ui.institution.skill.crisis")} {(candidate.skills.crisis * 100).toFixed(0)}
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

function FinanceStat(props: { label: string; value: string; tone?: string; testId?: string }): JSX.Element {
  return (
    <div>
      <div style={{ ...heading.label }}>{props.label}</div>
      <div
        data-testid={props.testId}
        style={{ fontFamily: font.mono, fontSize: 16, color: props.tone ?? color.navy, marginTop: 2 }}
      >
        {props.value}
      </div>
    </div>
  );
}
