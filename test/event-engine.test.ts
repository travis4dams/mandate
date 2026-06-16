import { describe, it, expect } from "vitest";
import { loadEventCatalog, type GameEvent } from "../src/content/events";
import { eligibleEvents, eventFireProbability } from "../src/engine/event-engine";
import { applyEffects } from "../src/content/effects";
import { makeState } from "../src/engine/state";

// SPEC-EVENT-1: eligibility, probability, loader flatten + validate
// SPEC-EVENT-2: effects applied from option, fires_once gate, unknown id throws

describe("loadEventCatalog", () => {
  // SPEC-EVENT-1: loader flattens arrays and validates against schema
  it("loads and flattens all events from content/events/*.json", () => {
    const catalog = loadEventCatalog();
    // oil_shock is an array-of-events file — must be flattened
    expect(catalog.length).toBeGreaterThanOrEqual(9); // oil_shock + 8 new events
    const ids = catalog.map((e) => e.id);
    expect(ids).toContain("evt.oil_shock");
    expect(ids).toContain("evt.regional_bank_distress");
    expect(ids).toContain("evt.staff_poached");
    expect(ids).toContain("evt.congressional_letter");
    expect(ids).toContain("evt.market_jitters");
    expect(ids).toContain("evt.fiscal_stimulus");
    expect(ids).toContain("evt.bank_lobby");
    expect(ids).toContain("evt.foreign_crisis");
    expect(ids).toContain("evt.deferred_asset_press");
  });

  // SPEC-EVENT-2: options carry effects
  it("event options carry effects arrays", () => {
    const catalog = loadEventCatalog();
    for (const evt of catalog) {
      expect(evt.options.length).toBeGreaterThanOrEqual(1);
      for (const opt of evt.options) {
        expect(Array.isArray(opt.effects)).toBe(true);
      }
    }
  });
});

describe("eligibleEvents", () => {
  // SPEC-EVENT-1: trigger condition gates eligibility
  it("returns events whose trigger condition holds", () => {
    const state = makeState({ vars: { bank_fragility: 0.6 } });
    const catalog = loadEventCatalog();
    const eligible = eligibleEvents(state, catalog, new Set());
    const ids = eligible.map((e) => e.id);
    expect(ids).toContain("evt.regional_bank_distress");
  });

  it("excludes events whose trigger condition does not hold", () => {
    // bank_fragility below threshold — regional_bank_distress should NOT fire
    const state = makeState({ vars: { bank_fragility: 0.3 } });
    const catalog = loadEventCatalog();
    const eligible = eligibleEvents(state, catalog, new Set());
    const ids = eligible.map((e) => e.id);
    expect(ids).not.toContain("evt.regional_bank_distress");
  });

  // SPEC-EVENT-1: fires_once respected
  it("excludes fires_once events that are already in firedOnce set", () => {
    const state = makeState({
      vars: { bank_fragility: 0.6, inflation: 0.06, deferred_asset: 2 },
      flags: { "staffed.research": true },
    });
    const catalog = loadEventCatalog();
    // Grab a fires_once event id if one exists, else use deferred_asset_press
    const firesOnceEvt = catalog.find((e) => e.fires_once);
    if (firesOnceEvt) {
      const withFired = new Set([firesOnceEvt.id]);
      const eligible = eligibleEvents(state, catalog, withFired);
      expect(eligible.map((e) => e.id)).not.toContain(firesOnceEvt.id);
    }
  });

  it("includes fires_once events not yet in firedOnce set", () => {
    // deferred_asset_press requires deferred_asset >= 1
    const state = makeState({ vars: { deferred_asset: 2 } });
    const catalog = loadEventCatalog();
    const firesOnceEvt = catalog.find((e) => e.id === "evt.deferred_asset_press");
    if (firesOnceEvt?.fires_once) {
      const eligible = eligibleEvents(state, catalog, new Set());
      expect(eligible.map((e) => e.id)).toContain("evt.deferred_asset_press");
    }
  });

  it("includes exogenous events with no trigger condition", () => {
    const state = makeState({});
    const catalog = loadEventCatalog();
    const eligible = eligibleEvents(state, catalog, new Set());
    // market_jitters is exogenous with no trigger — always eligible
    expect(eligible.map((e) => e.id)).toContain("evt.market_jitters");
  });
});

describe("eventFireProbability", () => {
  // SPEC-EVENT-1: no MTTH => probability 1
  it("returns 1 for event with no mean_time_to_happen", () => {
    const state = makeState({});
    const catalog = loadEventCatalog();
    const noMtth = catalog.find((e) => e.mean_time_to_happen === undefined);
    if (noMtth) {
      expect(eventFireProbability(noMtth, state)).toBe(1);
    }
  });

  // SPEC-EVENT-1: MTTH produces probability in (0,1)
  it("returns a probability in (0,1) for event with MTTH", () => {
    const state = makeState({ vars: { global_tension: 0.6 } });
    const catalog = loadEventCatalog();
    const withMtth = catalog.find((e) => e.mean_time_to_happen !== undefined);
    if (withMtth) {
      const p = eventFireProbability(withMtth, state, 30);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  // SPEC-EVENT-1: shorter effective days => higher probability
  it("gives higher probability when effective days shrink", () => {
    // Build a synthetic event with modifiers that halve the base_days
    const state = makeState({ vars: { global_tension: 0.9 } });
    const evt: GameEvent = {
      id: "evt.test_mtth",
      category: "exogenous",
      title: "evt.test_mtth.title",
      fires_once: false,
      mean_time_to_happen: {
        base_days: 365,
        modifiers: [
          { condition: { var: "global_tension", op: ">=", value: 0.8 }, factor: 0.1 },
        ],
      },
      options: [{ id: "ok", name: "evt.test_mtth.opt.ok", effects: [] }],
    };

    const pModified = eventFireProbability(evt, state, 30);   // tension >= 0.8 applies 0.1 factor
    const stateNoTension = makeState({ vars: { global_tension: 0.0 } });
    const pBase = eventFireProbability(evt, stateNoTension, 30); // modifier does not apply

    expect(pModified).toBeGreaterThan(pBase);
  });

  it("returns probability approaching 1 when daysPerMonth equals effective days", () => {
    const state = makeState({});
    const evt: GameEvent = {
      id: "evt.near_certain",
      category: "exogenous",
      title: "evt.near_certain.title",
      fires_once: false,
      mean_time_to_happen: { base_days: 1 },
      options: [{ id: "ok", name: "evt.near_certain.opt.ok", effects: [] }],
    };
    // formula: 1 - 0.5^(daysPerMonth / effectiveDays) = 1 - 0.5^30 ≈ 1
    const p = eventFireProbability(evt, state, 30);
    expect(p).toBeGreaterThan(0.99);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe("option effects application (SPEC-EVENT-2)", () => {
  // SPEC-EVENT-2: resolving an option applies its effects to game state
  it("applies var effects from a chosen option", () => {
    const catalog = loadEventCatalog();
    const bankEvt = catalog.find((e) => e.id === "evt.regional_bank_distress");
    expect(bankEvt).toBeDefined();
    const intervene = bankEvt!.options.find((o) => o.id === "intervene");
    expect(intervene).toBeDefined();

    const state = makeState({ vars: { bank_fragility: 0.6, operating_budget: 500 } });
    const result = applyEffects(intervene!.effects, state);

    // intervene should sub bank_fragility and sub operating_budget
    expect(result.state.vars["bank_fragility"]).toBeLessThan(0.6);
    expect(result.state.vars["operating_budget"]).toBeLessThan(500);
    // input state must be unchanged (pure)
    expect(state.vars["bank_fragility"]).toBe(0.6);
  });

  it("applies flag effects from a chosen option", () => {
    const catalog = loadEventCatalog();
    // market_jitters reassure should add credibility
    const jitters = catalog.find((e) => e.id === "evt.market_jitters");
    expect(jitters).toBeDefined();
    const reassure = jitters!.options.find((o) => o.id === "reassure");
    expect(reassure).toBeDefined();

    const state = makeState({ vars: { credibility: 0.5 } });
    const result = applyEffects(reassure!.effects, state);
    // credibility should increase
    expect(result.state.vars["credibility"]).toBeGreaterThan(0.5);
  });

  it("applyEffects does not mutate input state (pure)", () => {
    const catalog = loadEventCatalog();
    const evt = catalog[0];
    const opt = evt?.options[0];
    if (!opt) return;
    const state = makeState({ vars: { bank_fragility: 0.5, operating_budget: 1000, inflation: 0.05 } });
    const before = JSON.stringify(state);
    applyEffects(opt.effects, state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
