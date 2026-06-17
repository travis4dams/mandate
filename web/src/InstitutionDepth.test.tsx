// SPEC-WEB-14: the institution-depth systems are surfaced and legible —
// fragility + independence on the Desk, candidate fit + finances + a deferred-asset
// warning + the crisis banner.
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { App } from "./App";
import { InstitutionPanel } from "./InstitutionPanel";
import { Session } from "../../src/engine/session";
import { t } from "./loc";

afterEach(() => cleanup());

function boot(scenarioId: string, seed: number): void {
  render(<App />);
  fireEvent.change(screen.getByTestId("seed-input"), { target: { value: String(seed) } });
  act(() => {
    fireEvent.click(screen.getByTestId(`start-scenario-${scenarioId}`));
  });
}

describe("SPEC-WEB-14: institution-depth UI", () => {
  it("Desk shows the banking-fragility and independence readouts", () => {
    boot("scen.2008_gfc", 42);
    expect(screen.getByTestId("stat-fragility")).toBeDefined();
    expect(screen.getByTestId("shell-independence")).toBeDefined();
    // Independence reflects the scenario's starting value — derive it from the engine
    // rather than hardcoding, so a scenario content edit can't silently break this.
    const twin = Session.fromScenario("scen.2008_gfc", 42, "comm.fomc_1979");
    expect(screen.getByTestId("shell-independence").textContent).toContain(twin.independence().toFixed(1));
  });

  it("candidate cards show the fit computed for that division (hidden disposition is not shown)", () => {
    boot("scen.1979_stagflation", 42);
    act(() => {
      fireEvent.click(screen.getByTestId("tab-institution"));
    });
    // Supervision is unstaffed at the start → its candidate slate is shown with fit.
    expect(screen.getByTestId("candidate-fit-supervision-0")).toBeDefined();
    expect(screen.getByTestId("candidate-fit-supervision-0").textContent).toContain("%");
    // The hidden disposition must not be surfaced anywhere in the panel.
    expect(screen.queryByText(/disposition/i)).toBeNull();
  });

  it("the Fed-finances block warns when a deferred asset is outstanding", () => {
    // The 1979 tightening on the legacy portfolio drives a (small) deferred asset.
    const s = Session.fromReplay("replay.1979_chair_tightening", 42, "comm.fomc_1979");
    s.advance(36);
    expect(s.deferredAsset()).toBeGreaterThan(0); // precondition
    render(<InstitutionPanel session={s} current={s.current} />);
    expect(screen.getByTestId("fed-finances")).toBeDefined();
    expect(screen.getByTestId("fed-deferred-asset").textContent).not.toBe("0.00");
    expect(screen.getByText(t("ui.institution.deferred_asset_warning"))).toBeDefined();
  });

  it("no deferred-asset warning at a healthy start", () => {
    const s = Session.fromScenario("scen.2008_gfc", 42, "comm.fomc_1979");
    render(<InstitutionPanel session={s} current={s.current} />);
    expect(screen.queryByText(t("ui.institution.deferred_asset_warning"))).toBeNull();
  });

  it("a financial crisis surfaces as a banner (seed 99 fires within ~13 months)", () => {
    // AppShell owns its Session via useSession, so we exercise the real end-to-end path:
    // boot the high-fragility 2008 scenario and advance until a crisis fires. Seed 99 fires
    // at month ~13; the 60-month cap is generous headroom. If crisis tuning changes so a crisis
    // never fires in 60 months this fails LOUDLY (assert appeared===true), flagging the drift —
    // it is not a silent pass.
    boot("scen.2008_gfc", 99);
    let appeared = false;
    for (let i = 0; i < 60; i++) {
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Advance 1 month" }));
      });
      if (screen.queryByTestId("crisis-banner") !== null) {
        appeared = true;
        break;
      }
    }
    expect(appeared).toBe(true);
  });
});
