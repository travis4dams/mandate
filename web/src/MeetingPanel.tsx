// SPEC-WEB-4: FOMC meeting panel. Shows the current month's meeting eligibility,
// per-member preferred rates (so the Chair can see who would dissent and by how
// much before voting), the proposed-rate input, the vote button, and the most
// recent vote result with credibility delta.
// SPEC-WEB-8: owns the per-member Chair-capital spend map (SPEC-COMM-7) and
// threads it into committeeBriefing (live band preview) and proposeRate.

import { useEffect, useMemo, useState } from "react";
import type { Session } from "../../src/engine/session";
import { type FomcVote, type MemberVotePreview } from "../../src/engine/fomc";
import { loadChairCapitalParams } from "../../src/engine/chair-capital";
import { t } from "./loc";
import { PersuasionView } from "./PersuasionView";
import { color, font, space, radius, surface, heading, buttonStyle, chipStyle } from "./theme";

export function MeetingPanel(props: { session: Session; briefingId?: string }): JSX.Element {
  const { session, briefingId } = props;
  // Derive current date from session so it stays in sync with external advances.
  const currentDate = session.current.date;
  const isMeeting = session.isMeetingMonth();
  // SPEC-WEB-15 / per-seed names: committee members are shown with their generated
  // names (vary every game), not the static localization keys.
  const nameOf = (memberId: string): string => session.npcName(memberId);

  const initialRate = session.current.vars.policy_rate ?? 0.05;
  const [rateInput, setRateInput] = useState<string>(initialRate.toFixed(4));
  const [lastVote, setLastVote] = useState<FomcVote | null>(null);
  const [credibilityDelta, setCredibilityDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capitalSpend, setCapitalSpend] = useState<Record<string, number>>({});

  // Capital is per-meeting (use-it-or-lose-it): clear any staged spend when the
  // displayed month changes.
  useEffect(() => {
    setCapitalSpend({});
  }, [currentDate]);

  const chairCapital = session.chairCapital();
  const maxSpendPerMember = loadChairCapitalParams().max_spend_per_member;

  // Clamp client-side to the per-member cap and the remaining budget so the
  // engine's overdraw errors are unreachable through this UI (SPEC-WEB-8).
  function onSpendChange(memberId: string, raw: number): void {
    const allocatedToOthers = Object.entries(capitalSpend)
      .filter(([id]) => id !== memberId)
      .reduce((sum, [, v]) => sum + v, 0);
    const clamped = Math.max(
      0,
      Math.min(Math.floor(raw), maxSpendPerMember, chairCapital - allocatedToOthers),
    );
    setCapitalSpend((prev) => {
      const next = { ...prev };
      if (clamped === 0) {
        delete next[memberId];
      } else {
        next[memberId] = clamped;
      }
      return next;
    });
  }

  const parsedRate = parseFloat(rateInput);

  const briefingResult = useMemo(():
    | { ok: true; briefing: ReturnType<Session["committeeBriefing"]> }
    | { ok: false; error: string }
    | null => {
    if (!Number.isFinite(parsedRate)) return null;
    try {
      return { ok: true, briefing: session.committeeBriefing(parsedRate, capitalSpend) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [session, parsedRate, currentDate, capitalSpend]);
  const briefing = briefingResult?.ok ? briefingResult.briefing : null;
  const briefingError = briefingResult && !briefingResult.ok ? briefingResult.error : null;

  function onPropose(): void {
    if (!Number.isFinite(parsedRate)) {
      setError(`"${rateInput}" ${t("ui.meeting_panel.invalid_rate")}`);
      setLastVote(null);
      setCredibilityDelta(null);
      return;
    }
    const credBefore = session.current.vars.credibility;
    let vote: FomcVote;
    try {
      vote = session.proposeRate(parsedRate, capitalSpend);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastVote(null);
      setCredibilityDelta(null);
      return;
    }
    const credAfter = session.current.vars.credibility;
    setError(null);
    setCapitalSpend({});
    setLastVote(vote);
    setCredibilityDelta(
      credBefore !== undefined && credAfter !== undefined ? credAfter - credBefore : null,
    );
  }

  return (
    <section
      style={{
        ...surface.card,
        margin: `${space.xl}px 0`,
        background: isMeeting ? color.parchmentRaised : color.parchment,
        borderLeft: isMeeting ? `3px solid ${color.brass}` : `3px solid ${color.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: space.md, marginBottom: space.md }}>
        <h2 style={{ ...heading.display, fontSize: 18 }}>
          {t("ui.meeting_panel.heading")} — {currentDate}
        </h2>
        <span style={chipStyle(isMeeting ? "positive" : "neutral")}>
          {isMeeting ? t("ui.meeting_panel.meeting_month") : t("ui.meeting_panel.no_meeting")}
        </span>
      </div>

      <div style={{ display: "flex", gap: space.sm, alignItems: "center", marginTop: space.sm }}>
        <label style={{ fontSize: 13, fontFamily: font.sans, color: color.inkSoft }}>
          {t("ui.meeting_panel.rate_label")}
        </label>
        <input
          type="number"
          step="0.0025"
          min="0"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
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
          aria-label={t("ui.meeting_panel.rate_aria_label")}
        />
        <button
          onClick={onPropose}
          disabled={!isMeeting}
          data-testid="propose-rate-btn"
          style={{
            ...buttonStyle("primary"),
            opacity: isMeeting ? 1 : 0.45,
            cursor: isMeeting ? "pointer" : "not-allowed",
          }}
        >
          {t("ui.meeting_panel.propose_button")}
        </button>
      </div>

      {briefingError !== null && (
        <p style={{ color: color.negative, fontSize: 13, marginTop: space.sm }}>{briefingError}</p>
      )}

      {briefing !== null && (
        <>
          <CommitteeBriefing
            previews={briefing.previews}
            gapInflation={briefing.gapInflation}
            gapUnemployment={briefing.gapUnemployment}
            inflationTarget={briefing.inflationTarget}
            unemploymentTarget={briefing.unemploymentTarget}
            proposed={parsedRate}
            nameOf={nameOf}
          />
          <PersuasionView
            previews={briefing.previews}
            proposed={parsedRate}
            briefingId={briefingId}
            chairCapital={chairCapital}
            capitalSpend={capitalSpend}
            maxSpendPerMember={maxSpendPerMember}
            onSpendChange={onSpendChange}
            nameOf={nameOf}
          />
        </>
      )}

      {error !== null && (
        <p style={{ color: color.negative, fontSize: 13, marginTop: space.sm }}>{error}</p>
      )}

      {lastVote !== null && (
        <div
          style={{
            marginTop: space.md,
            padding: `${space.sm}px ${space.md}px`,
            background: color.parchment,
            borderRadius: radius.sm,
            border: `1px solid ${color.line}`,
            fontSize: 13,
            fontFamily: font.sans,
            color: color.ink,
          }}
        >
          <strong>{t("ui.meeting_panel.last_vote_label")}</strong>{" "}
          {t("ui.meeting_panel.decided_rate")}{" "}
          <span style={{ fontFamily: font.mono, color: color.navy }}>
            {(lastVote.decided * 100).toFixed(2)}%
          </span>{" "}
          · {t("ui.meeting_panel.dissents_label")}{" "}
          <span style={chipStyle(lastVote.dissents > 0 ? "caution" : "positive")}>
            {lastVote.dissents}
          </span>
          {credibilityDelta !== null && (
            <>
              {" "}· {t("ui.meeting_panel.credibility_label")}{" "}
              <span style={chipStyle(credibilityDelta >= 0 ? "positive" : "negative")}>
                {credibilityDelta >= 0 ? "+" : ""}
                {credibilityDelta.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function CommitteeBriefing(props: {
  previews: readonly MemberVotePreview[];
  gapInflation: number;
  gapUnemployment: number;
  inflationTarget: number;
  unemploymentTarget: number;
  proposed: number;
  nameOf: (memberId: string) => string;
}): JSX.Element {
  const dissents = props.previews.filter((p) => p.wouldDissent).length;
  const fmtPct = (n: number): string => `${(n * 100).toFixed(2)}%`;
  return (
    <div style={{ marginTop: space.md }}>
      <div
        style={{
          fontSize: 12,
          color: color.inkSoft,
          marginBottom: space.sm,
          fontFamily: font.sans,
        }}
      >
        {t("ui.meeting_panel.briefing.inflation_gap_label")}{" "}
        <span style={{ fontFamily: font.mono }}>
          {(props.gapInflation * 100).toFixed(2)}{t("ui.meeting_panel.briefing.pp_suffix")}
        </span>{" "}
        {t("ui.meeting_panel.briefing.target_prefix")}{fmtPct(props.inflationTarget)}{t("ui.meeting_panel.briefing.target_suffix")} ·{" "}
        {t("ui.meeting_panel.briefing.unemployment_gap_label")}{" "}
        <span style={{ fontFamily: font.mono }}>
          {(props.gapUnemployment * 100).toFixed(2)}{t("ui.meeting_panel.briefing.pp_suffix")}
        </span>{" "}
        {t("ui.meeting_panel.briefing.target_prefix")}{fmtPct(props.unemploymentTarget)}{t("ui.meeting_panel.briefing.target_suffix")}
      </div>
      <table
        style={{
          width: "100%",
          fontSize: 13,
          borderCollapse: "collapse",
          fontFamily: font.sans,
        }}
      >
        <thead>
          <tr
            style={{
              background: color.navy,
              color: color.onNavy,
              textAlign: "left",
            }}
          >
            <th style={{ padding: `${space.xs}px ${space.sm}px`, fontWeight: 600, letterSpacing: "0.04em" }}>
              {t("ui.meeting_panel.briefing.col_member")}
            </th>
            <th style={{ padding: `${space.xs}px ${space.sm}px`, textAlign: "right", fontWeight: 600 }}>
              {t("ui.meeting_panel.briefing.col_preferred_rate")}
            </th>
            <th style={{ padding: `${space.xs}px ${space.sm}px`, textAlign: "right", fontWeight: 600 }}>
              {t("ui.meeting_panel.briefing.col_delta")}
            </th>
            <th style={{ padding: `${space.xs}px ${space.sm}px`, fontWeight: 600 }}>
              {t("ui.meeting_panel.briefing.col_vote")}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.previews.map((p) => {
            const delta = p.preferred - props.proposed;
            return (
              <tr
                key={p.memberId}
                style={{
                  borderTop: `1px solid ${color.line}`,
                  background: p.wouldDissent ? color.negativeSoft : "transparent",
                }}
              >
                <td style={{ padding: `${space.xs}px ${space.sm}px`, color: color.ink }}>
                  {props.nameOf(p.memberId)}
                </td>
                <td
                  style={{
                    padding: `${space.xs}px ${space.sm}px`,
                    textAlign: "right",
                    fontFamily: font.mono,
                    color: color.navy,
                  }}
                >
                  {(p.preferred * 100).toFixed(2)}%
                </td>
                <td
                  style={{
                    padding: `${space.xs}px ${space.sm}px`,
                    textAlign: "right",
                    fontFamily: font.mono,
                    color: delta > 0 ? color.caution : delta < 0 ? color.negative : color.inkSoft,
                  }}
                >
                  {delta >= 0 ? "+" : ""}
                  {(delta * 100).toFixed(2)}{t("ui.meeting_panel.briefing.pp_suffix")}
                </td>
                <td style={{ padding: `${space.xs}px ${space.sm}px` }}>
                  <span style={chipStyle(p.wouldDissent ? "negative" : "positive")}>
                    {p.wouldDissent ? t("ui.meeting_panel.dissent") : t("ui.meeting_panel.approve")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        style={{
          marginTop: space.sm,
          fontSize: 12,
          color: color.inkSoft,
          fontFamily: font.sans,
        }}
      >
        {t("ui.meeting_panel.briefing.at_proposed_rate")}{" "}
        <strong style={{ color: dissents > 0 ? color.negative : color.positive }}>{dissents}</strong>{" "}
        {t("ui.meeting_panel.briefing.dissents_of")}{" "}
        {props.previews.length}{" "}
        {dissents === 1
          ? t("ui.meeting_panel.briefing.dissent_singular")
          : t("ui.meeting_panel.briefing.dissent_plural")}.
      </div>
    </div>
  );
}
