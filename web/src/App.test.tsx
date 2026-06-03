import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { App } from "./App.js";

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("renders MANDATE heading", () => {
    // SPEC-WEB-1
    render(<App />);
    expect(screen.getByRole("heading", { name: "MANDATE" })).toBeDefined();
  });

  // SPEC-WEB-2: dashboard renders the initial scenario state read straight from the engine.
  it("renders the 1979 scenario's initial date and inflation from the Session", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    // 1979 scenario starts at date 1979-08 and inflation 0.114 = 11.40%.
    // Use getAllByText because "1979-08" also appears as an axis tick on the chart.
    expect(screen.getAllByText("1979-08").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("11.40%");
  });

  // SPEC-WEB-2: pressing "Advance 1 month" mutates the Session and re-renders the
  // current snapshot — this is the useSyncExternalStore wiring under test.
  it("advances the simulation date when the Advance 1 month button is clicked", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    expect(container.textContent).toContain("1979-08");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-09");
  });

  // SPEC-WEB-2: "Advance 3 months" jumps three months forward.
  it("advances 3 months when the Advance 3 months button is clicked", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 3 months" }));
    });
    expect(container.textContent).toContain("1979-11");
  });

  // SPEC-WEB-2: "Reset" restores the session to its initial snapshot.
  it("resets the session to the initial date when Reset is clicked", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    expect(container.textContent).toContain("1979-09");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    });
    expect(container.textContent).toContain("1979-08");
  });

  // SPEC-WEB-4: the meeting panel's Propose-rate button is enabled at a meeting
  // month, fires session.proposeRate, and surfaces the decided rate + dissent count.
  it("propose-rate at a meeting month updates the policy_rate stat and shows a vote summary", () => {
    // SPEC-WEB-4
    const { container } = render(<App />);
    // 1979-08 is a meeting month per content/engine/meeting-schedule.json.
    const input = screen.getByLabelText("Proposed policy rate") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "0.15" } });
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Propose rate" }));
    });
    // Stat shows the new rate.
    expect(container.textContent).toContain("15.00%");
    // Vote summary appears.
    expect(container.textContent).toContain("Last vote:");
  });

  // SPEC-WEB-4: Propose rate button is disabled outside a meeting month.
  it("Propose rate button is disabled at a non-meeting month", () => {
    // SPEC-WEB-4
    render(<App />);
    // 1979-08 (month 8) and 1979-09 (month 9) are both meeting months.
    // 1979-10 (month 10) is not in the schedule → button must be disabled.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
    });
    const proposeButton = screen.getByRole("button", { name: "Propose rate" }) as HTMLButtonElement;
    expect(proposeButton.disabled).toBe(true);
  });

  // SPEC-WEB-5: "Advance to next meeting" advances exactly to the next meeting month.
  // From 1979-08 the next meeting month per the schedule is 1979-09 (month 9 in the list).
  it("Advance-to-next-meeting lands on the next scheduled meeting month", () => {
    // SPEC-WEB-5
    const { container } = render(<App />);
    expect(container.textContent).toContain("1979-08");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance to next meeting" }));
    });
    expect(container.textContent).toContain("1979-09");
  });
});
