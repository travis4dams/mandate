import { useRef } from "react";
import { Session } from "../../src/engine/session.js";
import { useSession } from "./hooks/index.js";

// SPEC-WEB-1: placeholder app — renders the game title.
// SPEC-WEB-2: demonstrates the useSession hook with the 1979 stagflation scenario.
// Note: labels below are temporary English placeholders pending localization wiring (SPEC-CONTENT-2).

// Session is created once for the component tree lifetime.
// Using useRef so the Session instance is stable across re-renders.
function useStableSession(): Session {
  const ref = useRef<Session | null>(null);
  if (ref.current === null) {
    ref.current = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
  }
  return ref.current;
}

export function App() {
  const session = useStableSession();
  const { current } = useSession(session);

  const date = current.date;
  const policyRate = current.vars["policy_rate"] ?? 0;
  const isMeeting = session.isMeetingMonth();

  function handleAdvance() {
    if (!isMeeting) {
      session.advance(1);
    }
  }

  return (
    <div>
      <h1>MANDATE</h1>
      <p>Date: {date}</p>
      <p>Policy rate: {(policyRate * 100).toFixed(2)}%</p>
      <button onClick={handleAdvance} disabled={isMeeting}>
        Advance 1 month
      </button>
      {isMeeting && (
        <p>Meeting month — use proposeRate to set the policy rate.</p>
      )}
    </div>
  );
}
