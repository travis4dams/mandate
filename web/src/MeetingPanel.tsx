// SPEC-WEB-4: FOMC meeting panel. Shows the current month's meeting eligibility,
// per-member preferred rates (so the Chair can see WHO would dissent and by how
// much before voting), the proposed-rate input, the vote button, and the most
// recent vote result with credibility delta.

import { useMemo, useState } from "react";
import type { Session } from "../../src/engine/session";
import type { FomcVote, MemberVotePreview } from "../../src/engine/fomc";
import en from "../../content/localization/en.json";

const loc = en as Record<string, string>;

export function MeetingPanel(props: { session: Session; currentDate: string }): JSX.Element {
  const { session, currentDate } = props;
  const isMeeting = session.isMeetingMonth();

  const initialRate = session.current.vars.policy_rate ?? 0.05;
  const [rateInput, setRateInput] = useState<string>(initialRate.toFixed(4));
  const [lastVote, setLastVote] = useState<FomcVote | null>(null);
  const [credibilityDelta, setCredibilityDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedRate = parseFloat(rateInput);
  const briefing = useMemo(() => {
    if (!Number.isFinite(parsedRate)) return null;
    try {
      return session.committeeBriefing(parsedRate);
    } catch {
      return null;
    }
  }, [session, parsedRate, currentDate]);

  function onPropose(): void {
    setError(null);
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
      setError((e as Error).message);
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
        FOMC meeting — {currentDate}
        <span style={{ marginLeft: 8, fontSize: 12, color: isMeeting ? "#2f9e44" : "#999" }}>
          {isMeeting ? "(meeting month)" : "(no meeting this month — advance first)"}
        </span>
      </h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <label style={{ fontSize: 13 }}>Proposed rate (decimal, e.g. 0.15 = 15%):</label>
        <input
          type="number"
          step="0.0025"
          min="0"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          style={{ width: 100, padding: "4px 6px", fontFamily: "monospace" }}
          aria-label="Proposed policy rate"
        />
        <button onClick={onPropose} disabled={!isMeeting}>
          Propose rate
        </button>
      </div>

      {briefing !== null && (
        <CommitteeBriefing
          previews={briefing.previews}
          gapInflation={briefing.gapInflation}
          gapUnemployment={briefing.gapUnemployment}
          proposed={parsedRate}
        />
      )}

      {error !== null && (
        <p style={{ color: "#c92a2a", fontSize: 13, marginTop: 8 }}>{error}</p>
      )}

      {lastVote !== null && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <strong>Last vote:</strong> decided rate {(lastVote.decided * 100).toFixed(2)}% ·
          {" "}dissents {lastVote.dissents}
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
  proposed: number;
}): JSX.Element {
  const dissents = props.previews.filter((p) => p.wouldDissent).length;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
        Inflation gap from target (2%): {(props.gapInflation * 100).toFixed(2)}pp ·{" "}
        Unemployment gap from target (4%): {(props.gapUnemployment * 100).toFixed(2)}pp
      </div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
            <th style={{ padding: "4px 6px" }}>Member</th>
            <th style={{ padding: "4px 6px" }}>Lean</th>
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
                <td style={{ padding: "4px 6px" }}>{loc[p.nameKey] ?? p.nameKey}</td>
                <td style={{ padding: "4px 6px", color: leanColor(p.lean) }}>{p.lean}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {(p.preferred * 100).toFixed(2)}%
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {delta >= 0 ? "+" : ""}
                  {(delta * 100).toFixed(2)}pp
                </td>
                <td style={{ padding: "4px 6px", color: p.wouldDissent ? "#c92a2a" : "#2f9e44" }}>
                  {p.wouldDissent ? "DISSENT" : "approve"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
        At this proposed rate: <strong>{dissents}</strong> of {props.previews.length} would dissent.
        Each dissent reduces credibility per SPEC-CRED-1.
      </div>
    </div>
  );
}

function leanColor(lean: "hawkish" | "dovish" | "neutral"): string {
  if (lean === "hawkish") return "#c92a2a";
  if (lean === "dovish") return "#1864ab";
  return "#666";
}
