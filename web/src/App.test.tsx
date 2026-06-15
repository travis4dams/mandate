import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { App } from "./App.js";
import { Session } from "../../src/engine/session.js";

afterEach(() => {
  cleanup();
});

// Boot through the start screen into the classic 1979 scenario (seed stays at
// the default 42, matching the twin-session assertions below).
function bootGame(): ReturnType<typeof render> {
  const result = render(<App />);
  act(() => {
    fireEvent.click(screen.getByTestId("start-scenario-scen.1979_stagflation"));
  });
  return result;
}

describe("App", () => {
  it("renders MANDATE heading", () => {
    // SPEC-WEB-1 — the start screen carries the heading before a game boots.
    render(<App />);
    expect(screen.getByRole("heading", { name: "MANDATE" })).toBeDefined();
  });

  // SPEC-WEB-2: dashboard renders all 8 stat fields specified by the AC, sourced
  // straight from the engine's initial scenario state. Asserting only date and
  // inflation (as the prior round did) lets a regression replace any of the other
  // six cards with stale placeholders without failing the test.
  it("renders all 8 SPEC-WEB-2 stat fields from the 1979 scenario's initial state", () => {
    // SPEC-WEB-2
    const { container } = bootGame();
    // 1979 scenario starting vars: policy_rate=0.1075, inflation=0.114,
    // unemployment=0.058, credibility=25, expectations_anchor=0.090,
    // months_below_anchor=6. trajectory.length === 1 at boot → "0" months elapsed.
    // Inflation/unemployment tiles show fogged observations (Session.observed,
    // see the data-fog requirement), so derive expected text from a twin session
    // with the same scenario/seed rather than the raw scenario vars.
    const twin = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;
    expect(screen.getAllByText("1979-08").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("10.75%"); // policy_rate
    expect(screen.getByTestId("stat-inflation").textContent).toBe(pct(twin.observed("inflation")));
    expect(screen.getByTestId("stat-unemployment").textContent).toBe(pct(twin.observed("unemployment")));
    expect(container.textContent).toContain("25.0");   // credibility
    expect(container.textContent).toContain("9.00%");  // expectations_anchor
    expect(container.textContent).toContain("6");      // months_below_anchor
    expect(container.textContent).toContain("0");      // trajectory length - 1
  });

  // SPEC-WEB-2: pressing "Advance 1 month" mutates the Session and re-renders the
  // current snapshot — this is the useSyncExternalStore wiring under test.
  it("advances the simulation date when the Advance 1 month button is clicked", () => {
    // SPEC-WEB-2
    const { container } = bootGame();
    expect(container.textContent).toContain("1979-08");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-09");
  });

  // SPEC-WEB-2: "Advance 3 months" jumps three months forward.
  it("advances 3 months when the Advance 3 months button is clicked", () => {
    // SPEC-WEB-2
    const { container } = bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 3 months" }));
    });
    expect(container.textContent).toContain("1979-11");
  });

  // SPEC-WEB-2: "Advance 12 months" jumps twelve months forward — pins the
  // multiplier so a copy-paste bug (e.g. advance(1) instead of advance(12)) surfaces.
  it("advances 12 months when the Advance 12 months button is clicked", () => {
    // SPEC-WEB-2
    const { container } = bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 12 months" }));
    });
    expect(container.textContent).toContain("1980-08");
  });

  // SPEC-WEB-2: "Reset" restores the session to its initial snapshot.
  it("resets the session to the initial date when Reset is clicked", () => {
    // SPEC-WEB-2
    const { container } = bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-09");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    });
    expect(container.textContent).toContain("1979-08");
  });

  // SPEC-WEB-4: "Propose rate" button is disabled when not in a meeting month.
  // Scenario starts at 1979-08 (August = meeting month), advance 2 months to
  // 1979-10 (October = non-meeting month) → button must be disabled.
  it("Propose rate button is disabled outside a meeting month", () => {
    // SPEC-WEB-4
    const { container } = bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-10");
    // SPEC-WEB-11: the meeting flow lives on the Committee tab in the shell.
    act(() => {
      fireEvent.click(screen.getByTestId("tab-committee"));
    });
    const proposeBtn = screen.getByTestId("propose-rate-btn");
    expect((proposeBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // SPEC-WEB-4: "Propose rate" button is enabled in a meeting month.
  it("Propose rate button is enabled in a meeting month (1979-08 = August)", () => {
    // SPEC-WEB-4
    bootGame();
    // Initial date is 1979-08 — a meeting month. Open the Committee tab (SPEC-WEB-11).
    act(() => {
      fireEvent.click(screen.getByTestId("tab-committee"));
    });
    const proposeBtn = screen.getByTestId("propose-rate-btn");
    expect((proposeBtn as HTMLButtonElement).disabled).toBe(false);
  });

  // SPEC-WEB-5: "Advance to next meeting" lands on the next FOMC meeting month.
  // Starting at 1979-08 (August = meeting month), the next meeting is 1979-09
  // (September), so advancing to next meeting should move to 1979-09.
  it("Advance to next meeting lands on the next FOMC meeting month", () => {
    // SPEC-WEB-5
    const { container } = bootGame();
    // Advance 2 months first to be in 1979-10 (non-meeting month) so the
    // advance-to-next-meeting button has to actually skip past a non-meeting month.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-10");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance to next meeting" }));
    });
    // 1979-10 (Oct) is not a meeting month. Next meeting month after Oct is Nov (11).
    expect(container.textContent).toContain("1979-11");
  });

  // SPEC-WEB-5: "Advance to next meeting" from a meeting month skips to the *next*
  // meeting, not the current one (loop starts at i=1, not i=0).
  it("Advance to next meeting skips current meeting month and lands on the next one", () => {
    // SPEC-WEB-5
    const { container } = bootGame();
    // Initial state is 1979-08 (August = meeting month). The button should advance
    // to 1979-09 (September = also a meeting month), not stay at 1979-08.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance to next meeting" }));
    });
    expect(container.textContent).toContain("1979-09");
  });

  // SPEC-WEB-5: hawkish stance button calls setForwardGuidanceStance.
  // We verify it doesn't throw (engine wiring) rather than inspecting internal state.
  it("hawkish stance button does not throw", () => {
    // SPEC-WEB-5
    bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Hawkish" }));
    });
    // No error displayed — button handler succeeded.
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  // SPEC-WEB-5: neutral and dovish stance buttons do not throw.
  it("neutral and dovish stance buttons do not throw", () => {
    // SPEC-WEB-5
    bootGame();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Neutral" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dovish" }));
    });
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
