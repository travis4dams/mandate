// SPEC-WEB-16 (real-time clock) + SPEC-WEB-17 (per-seed committee names, all chart series).
import "./engine-content";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { useGameClock, SPEED_MS } from "./useGameClock";
import { ChartsPanel } from "./ChartsPanel";
import { App } from "./App";
import { Session } from "../../src/engine/session";
import { t } from "./loc";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---- SPEC-WEB-16: real-time-with-pause clock ----

// Minimal fake session exercising the clock's branching without the full engine.
function fakeSession(opts: { meeting?: boolean; escalations?: unknown[] }): {
  session: import("../../src/engine/session").Session;
  advances: () => number;
} {
  let month = 0;
  const advance = vi.fn(() => {
    month += 1;
  });
  const session = {
    advance,
    isMeetingMonth: () => opts.meeting ?? false,
    escalations: () => opts.escalations ?? [],
    get current() {
      return { date: `1979-${String(8 + month).padStart(2, "0")}` };
    },
  } as unknown as import("../../src/engine/session").Session;
  return { session, advances: () => advance.mock.calls.length };
}

function ClockHarness({ session }: { session: import("../../src/engine/session").Session }): JSX.Element {
  const clock = useGameClock(session);
  return (
    <div>
      <button data-testid="toggle" onClick={clock.toggle}>
        {clock.playing ? "playing" : "paused"}
      </button>
      <span data-testid="blocked">{String(clock.blockedByEscalation)}</span>
    </div>
  );
}

describe("SPEC-WEB-16: real-time clock", () => {
  it("advances while playing and halts when paused", () => {
    vi.useFakeTimers();
    const { session, advances } = fakeSession({});
    render(<ClockHarness session={session} />);

    act(() => {
      fireEvent.click(screen.getByTestId("toggle")); // play
    });
    act(() => {
      vi.advanceTimersByTime(SPEED_MS.normal * 3 + 10);
    });
    const afterPlay = advances();
    expect(afterPlay).toBeGreaterThanOrEqual(2);

    act(() => {
      fireEvent.click(screen.getByTestId("toggle")); // pause
    });
    act(() => {
      vi.advanceTimersByTime(SPEED_MS.normal * 3 + 10);
    });
    expect(advances()).toBe(afterPlay); // no further advances after pause
  });

  it("is blocked and does not advance while an escalation is pending", () => {
    vi.useFakeTimers();
    const { session, advances } = fakeSession({ escalations: [{ id: "evt.x" }] });
    render(<ClockHarness session={session} />);
    expect(screen.getByTestId("blocked").textContent).toBe("true");
    act(() => {
      fireEvent.click(screen.getByTestId("toggle")); // attempt play
    });
    act(() => {
      vi.advanceTimersByTime(SPEED_MS.normal * 5);
    });
    expect(advances()).toBe(0); // never advanced — a decision is waiting
  });
});

// ---- SPEC-WEB-17: per-seed committee names + all chart series ----

describe("SPEC-WEB-17: generated committee names + chart panels", () => {
  it("renders generated committee names that vary by seed (not the static loc value)", () => {
    // 1979-08 is a meeting month, so the committee briefing table renders.
    const { container, unmount } = render(<App />);
    fireEvent.change(screen.getByTestId("seed-input"), { target: { value: "42" } });
    act(() => {
      fireEvent.click(screen.getByTestId("start-scenario-scen.1979_stagflation"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("tab-committee"));
    });
    const text42 = container.textContent ?? "";
    // The old static committee name must no longer appear.
    expect(text42).not.toContain("Dr. Eleanor Voss");
    // The generated chair name (twin session, same seed) should appear in the committee view.
    const twin42 = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    expect(text42).toContain(twin42.npcName("member.chair"));
    unmount();

    // A different seed yields a different chair name.
    const twin7 = Session.fromScenario("scen.1979_stagflation", 7, "comm.fomc_1979");
    expect(twin7.npcName("member.chair")).not.toBe(twin42.npcName("member.chair"));
  });

  it("the activity feed records a resolved escalation (SPEC-FEED-1)", () => {
    render(<App />);
    fireEvent.change(screen.getByTestId("seed-input"), { target: { value: "42" } });
    act(() => {
      fireEvent.click(screen.getByTestId("start-scenario-scen.2008_gfc"));
    });
    // Advance one month so the 2008 bank-distress escalation fires.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("escalation-opt-evt.regional_bank_distress-intervene"));
    });
    const feed = screen.getByTestId("activity-feed");
    expect(feed.querySelectorAll('[data-testid="activity-entry"]').length).toBeGreaterThan(0);
  });

  it("briefing scenario cards show the analyzed target rate (SPEC-BRIEF-4)", () => {
    render(<App />);
    fireEvent.change(screen.getByTestId("seed-input"), { target: { value: "42" } });
    act(() => {
      fireEvent.click(screen.getByTestId("start-scenario-scen.1979_stagflation"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("tab-committee"));
    });
    const raiseRate = screen.getByTestId("scenario-target-rate-raise");
    expect(raiseRate).toBeDefined();
    expect(raiseRate.textContent).toContain("13.25%"); // 1979 raise target_rate
  });

  it("ChartsPanel renders a credibility panel alongside the rate series (two svgs)", () => {
    const trajectory = [
      { date: "1979-08", vars: { inflation: 0.11, unemployment: 0.06, policy_rate: 0.1075, credibility: 25 } },
      { date: "1979-09", vars: { inflation: 0.10, unemployment: 0.07, policy_rate: 0.12, credibility: 27 } },
    ];
    const { container } = render(<ChartsPanel trajectory={trajectory} />);
    // Two stacked plots: rates + credibility.
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    // The credibility panel heading renders.
    expect(screen.getAllByText(t("ui.dashboard.chart.legend.credibility")).length).toBeGreaterThan(0);
  });
});
