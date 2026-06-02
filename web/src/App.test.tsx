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
});
