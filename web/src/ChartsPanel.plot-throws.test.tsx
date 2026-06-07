// SPEC-WEB-3: tests that require mocking @observablehq/plot are isolated here
// because vi.mock is hoisted to file scope and would break the smoke test in
// ChartsPanel.test.tsx where the real Plot module must succeed.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChartsPanel } from "./ChartsPanel";
import { t } from "./loc";

// vi.mock is hoisted before all imports, so Plot.plot is replaced for every
// module resolved in this file — including ChartsPanel's own import of Plot.
// We use importActual to keep all other Plot exports intact (areaY, line, etc.
// are called before plot(), so they must be real).
vi.mock("@observablehq/plot", async (importActual) => {
  const actual = await importActual<typeof import("@observablehq/plot")>();
  return {
    ...actual,
    plot: () => { throw new Error("Plot.plot mock failure"); },
  };
});

afterEach(() => {
  cleanup();
});

describe("SPEC-WEB-3 ChartsPanel component — Plot error fallback", () => {
  const snapshot = {
    date: "1979-08",
    vars: {
      inflation: 0.11,
      unemployment: 0.06,
      policy_rate: 0.105,
      credibility: 8.2,
    },
  };

  it("shows the unavailable fallback when Plot.plot throws", () => {
    // Silence the expected console.error from the catch block to keep output clean.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // The component's useEffect calls Plot.plot(...) which throws due to the mock
    // above. The catch block renders the localized "unavailable" paragraph.
    render(<ChartsPanel trajectory={[snapshot]} />);

    expect(screen.getByText(t("ui.dashboard.chart.unavailable"))).toBeDefined();

    consoleSpy.mockRestore();
  });
});
