// SPEC-WEB-4: FOMC meeting panel. Shows the current month's meeting eligibility,
// per-member preferred rates (so the Chair can see who would dissent and by how
// much before voting), the proposed-rate input, the vote button, and the most
// recent vote result with credibility delta.

import { useMemo, useState } from "react";
import type { Session } from "../../src/engine/session";
import { VoteMissingVarError, type FomcVote, type MemberVotePreview } from "../../src/engine/fomc";
import { t } from "./loc";

export function MeetingPanel(props: { session: Session }): JSX.Element {
  const { session } = props;
  // Derive current date from session so it stays in sync with external advances.
  const currentDate = session.current.date;
  const isMeeting = session.isMeetingMonth();

  const initialRate = session.current.vars.policy_rate ?? 0.05;
  const [rateInput, setRateInput] = useState<string>(initialRate.toFixed(4));
  const [lastVote, setLastVote] = useState<FomcVote | null>(null);
  const [credibilityDelta, setCredibilityDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const parsedRate = parseFloat(rateInput);

  const briefing = useMemo(() => {
    if (!Number.isFinite(parsedRate)) return null;
    try {
      return session.committeeBriefing(parsedRate);
    } catch (e) {
      // VoteMissingVarError means state vars are missing — don't crash the panel.
      if (e instanceof VoteMissingVarError) {
        setBriefingError(e.message);
        return null;
      }
      // Any other error is unexpected — surface it and return null rather than
      // re-throwing inside useMemo, which would crash the render tree.
      setBriefingError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [session, parsedRate, currentDate]);

  function onPropose(): void {
    setError(null);
    setLastVote(null);
    setCredibilityDelta(null);
    if (!Number.isFinite(parsedRate)) {
      setError(`"${rateInput}" is not a finite number.`);
      return;
    }
    const credBefore = session.current.vars.credibility ?? 0;
    try {
      const vote = session.proposeRate(parsedRate);
      setLastVote(vote);
      const credAfter = session.current.vars.credibility ?? 0;
      setCredibilityDelta(credAfter - credBefore);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: "12px 14px",
        background: isMeeting ? "#f6fff7" : "#fafafa",
        margin: "16px 0",
      }}
    >
      <h2 style={{ fontSize: 16, margin: 0 }}>
        {t("ui.meeting_panel.heading")} — {currentDate}
        <span style={{ marginLeft: 8, fontSize: 12, color: isMeeting ? "#2f9e44" : "#999" }}>
          {isMeeting ? t("ui.meeting_panel.meeting_month") : t("ui.meeting_panel.no_meeting")}
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <label style={{ fontSize: 13 }}>{t("ui.meeting_panel.rate_label")}</label>
        <input
          type="number"
          step="0.0025"
          min="0"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          style={{ width: 100, padding: "4px 6px", fontFamily: "monospace" }}
          aria-label="Proposed policy rate"
        />
        <button onClick={onPropose} disabled={!isMeeting} data-testid="propose-rate-btn">
          {t("ui.meeting_panel.propose_button")}
        </button>
      </div>

      {briefingError !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, marginTop: 8 }}>{briefingError}</p>
      )}

      {briefing !== null && (
        <CommitteeBriefing
          previews={briefing.previews}
          gapInflation={briefing.gapInflation}
          gapUnemployment={briefing.gapUnemployment}
          inflationTarget={briefing.inflationTarget}
          unemploymentTarget={briefing.unemploymentTarget}
          proposed={parsedRate}
        />
      )}

      {error !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      {lastVote !== null && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <strong>{t("ui.meeting_panel.last_vote_label")}</strong>{" "}
          decided rate {(lastVote.decided * 100).toFixed(2)}% ·{" "}
          dissents {lastVote.dissents}
          {credibilityDelta !== null && (
            <>
              {" "}· credibility {credibilityDelta >= 0 ? "+" : ""}
              {credibilityDelta.toFixed(2)}
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
}): JSX.Element {
  const dissents = props.previews.filter((p) => p.wouldDissent).length;
  const fmtPct = (n: number): string => `${(n * 100).toFixed(2)}%`;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
        {t("ui.meeting_panel.briefing.inflation_gap_label")}{" "}
        {(props.gapInflation * 100).toFixed(2)}pp (target {fmtPct(props.inflationTarget)}) ·{" "}
        {t("ui.meeting_panel.briefing.unemployment_gap_label")}{" "}
        {(props.gapUnemployment * 100).toFixed(2)}pp (target {fmtPct(props.unemploymentTarget)})
      </div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
            <th style={{ padding: "4px 6px" }}>Member</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Preferred rate</th>
            <th style={{ padding: "4px 6px", textAlign: "right" }}>Δ from proposed</th>
            <th style={{ padding: "4px 6px" }}>Vote</th>
          </tr>
        </thead>
        <tbody>
          {props.previews.map((p) => {
            const delta = p.preferred - props.proposed;
            return (
              <tr key={p.memberId} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "4px 6px" }}>{t(p.nameKey)}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {(p.preferred * 100).toFixed(2)}%
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {delta >= 0 ? "+" : ""}
                  {(delta * 100).toFixed(2)}pp
                </td>
                <td style={{ padding: "4px 6px", color: p.wouldDissent ? "#c92a2a" : "#2f9e44" }}>
                  {p.wouldDissent ? t("ui.meeting_panel.dissent") : t("ui.meeting_panel.approve")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
        At this proposed rate: <strong>{dissents}</strong> of {props.previews.length} {t("ui.meeting_panel.dissent").toLowerCase()}{dissents === 1 ? "s" : ""}.
      </div>
    </div>
  );
}
