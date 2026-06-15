// SPEC-WEB-13: Legacy panel — tenure clock, reappointment outlook, legacy score.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Session } from "../../src/engine/session";
import { LegacyPanel } from "./LegacyPanel";

afterEach(() => {
  cleanup();
});

// 1979 scenario: credibility = 25, reappointment_credibility_min = 48
// (term_length_months = 48, reappointment_credibility_min = 50 per content).
// Fail session: credibility 25 < 50 → reappointed = false.
// Pass session: credibility 25 + 30 = 55 >= 50 → reappointed = true.
function makeSession(varDeltas?: Readonly<Record<string, number>>): Session {
  return Session.fromScenario("scen.1979_stagflation", 1, "comm.fomc_1979", varDeltas ? { varDeltas } : undefined);
}

describe("LegacyPanel", () => {
  // SPEC-WEB-13: panel heading renders.
  it("renders the Legacy heading", () => {
    const session = makeSession();
    render(<LegacyPanel session={session} />);
    expect(screen.getByTestId("legacy-heading").textContent).toBe("Legacy");
  });

  // SPEC-WEB-13: tenure section displays term clock data from Session.termProgress().
  it("renders tenure section with terms-served and months-into-term", () => {
    const session = makeSession();
    render(<LegacyPanel session={session} />);
    // At month 0 (just started): termsServed = 0, monthsIntoTerm = 0.
    const termsServed = screen.getByTestId("legacy-terms-served");
    const monthsInto = screen.getByTestId("legacy-months-into-term");
    const monthsTo = screen.getByTestId("legacy-months-to-reappointment");
    expect(termsServed.textContent).toBe("0");
    expect(monthsInto.textContent).toBe("0");
    // termLength = 48, monthsIntoTerm = 0 → monthsToReappointment = 48.
    expect(monthsTo.textContent).toBe("48");
  });

  // SPEC-WEB-13: reappointment fail shown when credibility is below threshold.
  it("shows reappointment-fail when credibility is below threshold", () => {
    // 1979 scenario credibility = 25, threshold = 50 → fail.
    const session = makeSession();
    render(<LegacyPanel session={session} />);
    expect(screen.getByTestId("legacy-reappointment-status").textContent).toContain(
      "Reappointment at risk",
    );
  });

  // SPEC-WEB-13: reappointment pass shown when credibility clears threshold.
  it("shows reappointment-pass when credibility is at or above threshold", () => {
    // credibility 25 + 30 = 55 >= 50 → pass.
    const session = makeSession({ credibility: 30 });
    render(<LegacyPanel session={session} />);
    expect(screen.getByTestId("legacy-reappointment-status").textContent).toContain(
      "On track for reappointment",
    );
  });

  // SPEC-WEB-13: reappointment threshold value is rendered.
  it("displays the reappointment credibility threshold", () => {
    const session = makeSession();
    render(<LegacyPanel session={session} />);
    // threshold = 50 per content/engine/legacy.json
    expect(screen.getByTestId("legacy-reappointment-threshold").textContent).toContain("50");
  });

  // SPEC-WEB-13: legacy score is rendered as a number.
  it("renders the legacy score", () => {
    const session = makeSession();
    render(<LegacyPanel session={session} />);
    const score = screen.getByTestId("legacy-score");
    // Score is a number; just verify it's present and parseable.
    expect(Number.isFinite(parseFloat(score.textContent ?? ""))).toBe(true);
  });
});
