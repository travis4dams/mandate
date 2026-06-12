// SPEC-WEB-7: doctrine management panel — lists the catalog, adopts/abandons
// through the Session, and shows the flip-flop cost before an abandon commits.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup, within } from "@testing-library/react";
import { App } from "./App.js";
import { loadDoctrineCatalog } from "../../src/content/doctrines.js";

afterEach(() => {
  cleanup();
});

// Boot through the start screen into the 1979 scenario at the default seed —
// the doctrine panel lives on the Dashboard behind the new-game flow.
function bootGame(): ReturnType<typeof render> {
  const result = render(<App />);
  act(() => {
    fireEvent.click(screen.getByTestId("start-scenario-scen.1979_stagflation"));
  });
  return result;
}

function gradualismCard(): HTMLElement {
  return screen.getByTestId("doctrine-card-doctrine.gradualism");
}

describe("DoctrinePanel", () => {
  // SPEC-WEB-7: every catalog doctrine renders with its localized name.
  it("renders all doctrines from the catalog", () => {
    bootGame();
    const catalog = loadDoctrineCatalog();
    expect(catalog.length).toBe(3);
    expect(screen.getByText("Gradualism")).toBeDefined();
    expect(screen.getByText("Inflation Targeting")).toBeDefined();
    expect(screen.getByText("Dot Plot")).toBeDefined();
  });

  // SPEC-WEB-7: adopting applies the standing effect — Gradualism is
  // credibility +2 in content, so the 1979 scenario's 25.0 becomes 27.0.
  it("adopting Gradualism raises displayed credibility by its standing effect", () => {
    const { container } = bootGame();
    expect(container.textContent).toContain("25.0");
    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Adopt" }));
    });
    expect(container.textContent).toContain("27.0");
    expect(within(gradualismCard()).getByText("Adopted")).toBeDefined();
  });

  // SPEC-WEB-7: the abandon flow is two-step and the flip-flop cost (8 for
  // Gradualism, read from content) is visible before confirmation.
  it("shows the flip-flop cost before abandon is confirmed, then applies it", () => {
    const { container } = bootGame();
    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Adopt" }));
    });
    expect(container.textContent).toContain("27.0");

    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Abandon" }));
    });
    // Cost is shown, sourced from content (flip_flop_cost = 8); nothing applied yet.
    const catalog = loadDoctrineCatalog();
    const gradualism = catalog.find((d) => d.id === "doctrine.gradualism");
    expect(gradualism).toBeDefined();
    const costNode = within(gradualismCard()).getByTestId("flip-flop-cost");
    expect(costNode.textContent).toContain(String(gradualism?.flip_flop_cost));
    expect(container.textContent).toContain("27.0");

    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Confirm abandon" }));
    });
    // 27.0 − 2 (reversed standing effect) − 8 (flip-flop cost) = 17.0
    expect(container.textContent).toContain("17.0");
    expect(within(gradualismCard()).queryByText("Adopted")).toBeNull();
  });

  // SPEC-WEB-7: cancel backs out without touching state.
  it("cancel leaves the doctrine adopted and credibility unchanged", () => {
    const { container } = bootGame();
    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Adopt" }));
    });
    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Abandon" }));
    });
    act(() => {
      fireEvent.click(within(gradualismCard()).getByRole("button", { name: "Cancel" }));
    });
    expect(container.textContent).toContain("27.0");
    expect(within(gradualismCard()).getByText("Adopted")).toBeDefined();
  });
});
