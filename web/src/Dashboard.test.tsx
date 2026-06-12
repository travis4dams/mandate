// SPEC-WEB-9: the dashboard shows fogged observations (not true vars) for
// inflation/unemployment, plus mandate status and long_rate/output_gap stats.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { App } from "./App";
import { Session } from "../../src/engine/session";
import { t } from "./loc";

afterEach(() => {
  cleanup();
});

// Twin session: same scenario/seed/committee as the App's Dashboard, so its
// observed() values are exactly what the UI must display (derived-RNG determinism).
function twinSession(): Session {
  return Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
}

const fmtPercent = (n: number): string => `${(n * 100).toFixed(2)}%`;

describe("Dashboard fog + mandate surfacing", () => {
  it("inflation and unemployment tiles show the fogged observations", () => {
    // SPEC-WEB-9
    const twin = twinSession();
    render(<App />);
    expect(screen.getByTestId("stat-inflation").textContent).toBe(
      fmtPercent(twin.observed("inflation")),
    );
    expect(screen.getByTestId("stat-unemployment").textContent).toBe(
      fmtPercent(twin.observed("unemployment")),
    );
  });

  it("the inflation tile hides the true var when it differs from the observation", () => {
    // SPEC-WEB-9 — the fog pillar: truth stays hidden behind the observation.
    const twin = twinSession();
    const trueInflation = twin.current.vars.inflation;
    if (trueInflation === undefined) throw new Error("scenario missing inflation");
    // Content gives inflation a nonzero noise_scale, so observation ≠ truth here.
    expect(twin.observed("inflation")).not.toBe(trueInflation);
    render(<App />);
    expect(screen.getByTestId("stat-inflation").textContent).not.toBe(fmtPercent(trueInflation));
  });

  it("shows the mandate chip reflecting mandateOnTarget()", () => {
    // SPEC-WEB-9 — 1979 stagflation starts off-target.
    const twin = twinSession();
    render(<App />);
    const chip = screen.getByTestId("mandate-status");
    const expected = twin.mandateOnTarget() ? t("ui.mandate.on") : t("ui.mandate.off");
    expect(chip.textContent).toContain(expected);
    expect(twin.mandateOnTarget()).toBe(false);
  });

  it("renders long_rate and output_gap stat tiles", () => {
    // SPEC-WEB-9 — cold-start: both vars are absent at boot and display "—".
    const { container } = render(<App />);
    expect(container.textContent).toContain(t("ui.dashboard.stat.long_rate"));
    expect(container.textContent).toContain(t("ui.dashboard.stat.output_gap"));
    expect(screen.getByTestId("stat-long-rate").textContent).toBe("—");
    expect(screen.getByTestId("stat-output-gap").textContent).toBe("—");
  });
});
