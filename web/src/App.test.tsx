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

  // SPEC-WEB-2: dashboard renders all 8 stat fields specified by the AC, sourced
  // straight from the engine's initial scenario state. Asserting only date and
  // inflation (as the prior round did) lets a regression replace any of the other
  // six cards with stale placeholders without failing the test.
  it("renders all 8 SPEC-WEB-2 stat fields from the 1979 scenario's initial state", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    // 1979 scenario starting vars: policy_rate=0.1075, inflation=0.114,
    // unemployment=0.058, credibility=25, expectations_anchor=0.090,
    // months_below_anchor=6. trajectory.length === 1 at boot → "0" months elapsed.
    expect(screen.getAllByText("1979-08").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("10.75%"); // policy_rate
    expect(container.textContent).toContain("11.40%"); // inflation
    expect(container.textContent).toContain("5.80%");  // unemployment
    expect(container.textContent).toContain("25.0");   // credibility
    expect(container.textContent).toContain("9.00%");  // expectations_anchor
    expect(container.textContent).toContain("6");      // months_below_anchor
    expect(container.textContent).toContain("0");      // trajectory length - 1
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

  // SPEC-WEB-2: "Advance 12 months" jumps twelve months forward — pins the
  // multiplier so a copy-paste bug (e.g. advance(1) instead of advance(12)) surfaces.
  it("advances 12 months when the Advance 12 months button is clicked", () => {
    // SPEC-WEB-2
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Advance 12 months" }));
    });
    expect(container.textContent).toContain("1980-08");
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
});
