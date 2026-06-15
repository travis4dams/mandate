// SPEC-WEB-11: Office of the Chair game shell — AppShell tab structure and
// header content. Mounts the shell through the full useSession/engine path;
// all assertions are against the rendered DOM, not internal state.
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { Session } from "../../src/engine/session";
import { t } from "./loc";

afterEach(() => {
  cleanup();
});

const SCENARIO = "scen.1979_stagflation";
const SEED = 42;

function renderShell(): ReturnType<typeof render> {
  return render(<AppShell scenarioId={SCENARIO} seed={SEED} />);
}

describe("AppShell — SPEC-WEB-11", () => {
  // ---- Tab controls ----

  it("renders all four tab controls", () => {
    // SPEC-WEB-11
    renderShell();
    expect(screen.getByTestId("tab-desk")).toBeDefined();
    expect(screen.getByTestId("tab-committee")).toBeDefined();
    expect(screen.getByTestId("tab-institution")).toBeDefined();
    expect(screen.getByTestId("tab-legacy")).toBeDefined();
  });

  // ---- Chair generated name in header ----

  it("renders the Chair generated name in the office header", () => {
    // SPEC-WEB-11
    renderShell();
    // Session.npcName("member.chair") produces a name; the header shows it
    // prefixed with the Chair label. We confirm the element is non-empty.
    const nameEl = screen.getByTestId("shell-chair-name");
    expect(nameEl.textContent).toBeTruthy();
    // Must include the Chair prefix from localization.
    expect(nameEl.textContent).toContain(t("ui.shell.chair_prefix"));
  });

  // ---- Desk tab is the default and shows date + a stat tile ----

  it("Desk tab is active by default and shows the current date", () => {
    // SPEC-WEB-11
    const { container } = renderShell();
    // 1979 stagflation scenario starts at 1979-08.
    expect(container.textContent).toContain("1979-08");
  });

  it("Desk tab shows the inflation stat tile", () => {
    // SPEC-WEB-11
    renderShell();
    // stat-inflation is in the Desk tab grid; it must be visible on first render.
    const twin = Session.fromScenario(SCENARIO, SEED, "comm.fomc_1979");
    const fmtPct = (n: number): string => `${(n * 100).toFixed(2)}%`;
    expect(screen.getByTestId("stat-inflation").textContent).toBe(
      fmtPct(twin.observed("inflation")),
    );
  });

  // ---- Committee tab shows "Propose rate" button ----

  it("clicking tab-committee reveals the Propose rate button", () => {
    // SPEC-WEB-11
    renderShell();
    act(() => {
      fireEvent.click(screen.getByTestId("tab-committee"));
    });
    // MeetingPanel renders a button with label matching the propose key.
    expect(screen.getByTestId("propose-rate-btn")).toBeDefined();
  });

  // ---- Institution tab shows the institution heading ----

  it("clicking tab-institution reveals the institution heading", () => {
    // SPEC-WEB-11
    renderShell();
    act(() => {
      fireEvent.click(screen.getByTestId("tab-institution"));
    });
    const { container } = { container: document.body };
    expect(container.textContent).toContain(t("ui.institution.heading"));
  });

  // ---- Legacy tab shows the legacy heading ----

  it("clicking tab-legacy reveals the legacy heading", () => {
    // SPEC-WEB-11
    renderShell();
    act(() => {
      fireEvent.click(screen.getByTestId("tab-legacy"));
    });
    expect(screen.getByTestId("legacy-heading")).toBeDefined();
    expect(screen.getByTestId("legacy-heading").textContent).toContain(t("ui.legacy.heading"));
  });
});
