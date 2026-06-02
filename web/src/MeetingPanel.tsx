// SPEC-WEB-4: FOMC meeting panel. Shows the current month's meeting eligibility,
// the proposed-rate input, a vote button, and the most recent vote result. The
// button is gated on Session.isMeetingMonth() — clicking proposeRate outside a
// meeting month throws NotMeetingMonthError, which SESSION-1 enforces.

import { useState } from "react";
import type { Session } from "../../src/engine/session";
import type { FomcVote } from "../../src/engine/fomc";

export function MeetingPanel(props: { session: Session; currentDate: string }): JSX.Element {
  const { session, currentDate } = props;
  const isMeeting = session.isMeetingMonth();

  const initialRate = session.current.vars.policy_rate ?? 0.05;
  const [rateInput, setRateInput] = useState<string>(initialRate.toFixed(4));
  const [lastVote, setLastVote] = useState<FomcVote | null>(null);
  const [credibilityDelta, setCredibilityDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPropose(): void {
    setError(null);
    const value = parseFloat(rateInput);
    if (!Number.isFinite(value)) {
      setError(`"${rateInput}" is not a finite number.`);
      return;
    }
    const credBefore = session.current.vars.credibility ?? 0;
    try {
      const vote = session.proposeRate(value);
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
