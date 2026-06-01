import { describe, it, expect } from "vitest";
import { evaluate, type Condition } from "../src/content/conditions";
import { applyEffects, type Effect } from "../src/content/effects";
import { makeState } from "../src/engine/state";

const state = makeState({
  vars: { debt_to_gdp: 0.95, inflation: 0.06, global_tension: 0.9 },
  flags: { at_war: false },
});

describe("conditions", () => {
  // SPEC-COND-1
  it("evaluates var comparisons, combinators, and flags", () => {
    expect(evaluate({ var: "debt_to_gdp", op: ">", value: 0.9 }, state)).toBe(true);
    expect(evaluate({ var: "inflation", op: "<", value: 0.02 }, state)).toBe(false);
    expect(evaluate({ flag: "at_war", value: false }, state)).toBe(true);
    const c: Condition = { all: [{ var: "debt_to_gdp", op: ">=", value: 0.9 }, { not: { flag: "at_war" } }] };
    expect(evaluate(c, state)).toBe(true);
    expect(evaluate({ any: [{ var: "inflation", op: ">", value: 0.5 }, { flag: "at_war" }] }, state)).toBe(false);
  });
});

describe("effects", () => {
  // SPEC-COND-2
  it("applies purely without mutating the input state", () => {
    const effects: Effect[] = [{ op: "add", target: "policy_rate", value: 0.005 }, { trigger_event: "evt.oil_shock" }];
    const before = JSON.stringify(state);
    const result = applyEffects(effects, state);
    expect(result.state.vars.policy_rate).toBe(0.005);
    expect(result.queuedEvents).toEqual(["evt.oil_shock"]);
    expect(JSON.stringify(state)).toBe(before); // input untouched
  });
});
