// SPEC-WEB-10: new-game start screen — playable-scenario picker, optional
// seed, and the confirmation-hearing path. All expectations are derived from
// content (catalog + hearing files), never hardcoded.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { App } from "./App";
import { loadScenarioCatalog, _resetScenarioCatalogCache } from "../../src/content/scenarios";
import { loadHearing, resolveHearing } from "../../src/content/hearings";
import { Session } from "../../src/engine/session";
import { t } from "./loc";

afterEach(() => {
  cleanup();
  _resetScenarioCatalogCache();
});

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;

describe("StartScreen", () => {
  it("lists exactly the playable scenarios — the recovery_test fixture is not offered", () => {
    // SPEC-WEB-10
    render(<App />);
    const playable = loadScenarioCatalog().filter((s) => s.playable === true);
    expect(playable.length).toBe(3);
    for (const s of playable) {
      expect(screen.getByTestId(`start-scenario-${s.id}`)).toBeDefined();
    }
    expect(screen.queryByTestId("start-scenario-scen.recovery_test")).toBeNull();
  });

  it("picking a scenario boots a session on that scenario", () => {
    // SPEC-WEB-10
    const gfc = loadScenarioCatalog().find((s) => s.id === "scen.2008_gfc");
    if (gfc === undefined) throw new Error("scen.2008_gfc missing from catalog");
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(screen.getByTestId("start-scenario-scen.2008_gfc"));
    });
    expect(container.textContent).toContain("scen.2008_gfc");
    expect(container.textContent).toContain(gfc.date);
  });

  it("the seed input reaches the session (fogged observation matches a twin at that seed)", () => {
    // SPEC-WEB-10
    render(<App />);
    fireEvent.change(screen.getByTestId("seed-input"), { target: { value: "7" } });
    act(() => {
      fireEvent.click(screen.getByTestId("start-scenario-scen.1979_stagflation"));
    });
    const twin = Session.fromScenario("scen.1979_stagflation", 7, "comm.fomc_1979");
    expect(screen.getByTestId("stat-inflation").textContent).toBe(pct(twin.observed("inflation")));
  });

  it("the hearing path boots the resolved scenario with the content-declared modifiers applied", () => {
    // SPEC-WEB-10 — expectations computed via resolveHearing on the actual content,
    // so a semantics drift between UI and resolver fails loudly.
    const hearing = loadHearing("hearing.confirmation");
    const chosen = hearing.questions.map((q) => {
      const first = q.answers[0];
      if (first === undefined) throw new Error(`question ${q.id} has no answers`);
      return first.id;
    });
    const result = resolveHearing(chosen, hearing);
    const varDeltas: Record<string, number> = {};
    for (const mod of result.modifiers) {
      varDeltas[mod.target] = (varDeltas[mod.target] ?? 0) + mod.delta;
    }
    // The content must exercise the modifier path, or this test is vacuous.
    expect(Object.keys(varDeltas).length).toBeGreaterThan(0);
    const twin = Session.fromScenario(result.scenarioId, 42, "comm.fomc_1979", { varDeltas });

    const { container } = render(<App />);
    act(() => {
      fireEvent.click(screen.getByTestId("start-hearing-mode"));
    });
    for (const answerId of chosen) {
      act(() => {
        fireEvent.click(screen.getByTestId(`answer-${answerId}`));
      });
    }
    act(() => {
      fireEvent.click(screen.getByTestId("hearing-begin"));
    });

    expect(container.textContent).toContain(result.scenarioId);
    const cred = twin.current.vars.credibility;
    expect(cred).toBeDefined();
    expect(container.textContent).toContain((cred ?? 0).toFixed(1));
  });

  it("submitting an incomplete hearing shows an error and stays on the start screen", () => {
    // SPEC-WEB-10
    render(<App />);
    act(() => {
      fireEvent.click(screen.getByTestId("start-hearing-mode"));
    });
    act(() => {
      fireEvent.click(screen.getByTestId("hearing-begin"));
    });
    expect(screen.getByText(t("ui.start.hearing.incomplete"))).toBeDefined();
    expect(screen.getByTestId("seed-input")).toBeDefined();
  });
});
