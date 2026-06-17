// SPEC-DIV-1: per-division function-effects resolver.
// Test order: schema validation, identity baseline, single-division contributions,
// competence_floor underperformance, fogFactor/externalShockDamp clamping, multi-division.

import { describe, it, expect, beforeEach } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeState } from "../src/engine/state.js";
import {
  divisionEffects,
  loadDivisionEffectsParams,
  type DivisionEffects,
  type DivisionEffectsParams,
} from "../src/engine/division-effects.js";
import type { Division } from "../src/engine/institution.js";
import { _resetValidateFileCache } from "../src/content/loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../schemas/division-effects.schema.json",
);
const CONTENT_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../content/engine/division-effects.json",
);

function makeDivision(id: string, channel: Division["channel"]): Division {
  return {
    id,
    name: `division.${id}.name`,
    desc: `division.${id}.desc`,
    hire_cost: 10,
    investment: 0.2,
    channel,
    skill_weights: {
      forecasting: 0.2,
      markets: 0.2,
      supervision: 0.2,
      communication: 0.2,
      crisis: 0.2,
    },
  };
}

/** Staff a division in state by setting eff and flags directly (bypasses hireStaff cost). */
function staffDiv(
  state: ReturnType<typeof makeState>,
  divId: string,
  eff: number,
) {
  return {
    ...state,
    vars: { ...state.vars, [`staff.${divId}.eff`]: eff },
    flags: { ...state.flags, [`staffed.${divId}`]: true },
  };
}

/** Minimal params fixture used in most tests (avoids loading from disk). */
const TEST_PARAMS: DivisionEffectsParams = {
  competence_floor: 0.3,
  disposition_influence: 0.1,
  effect_strength: {
    fog: 0.6,
    transmission: 0.5,
    fragility_visibility: 0.5,
    fragility_mitigation: 0.6,
    crisis_severity: 0.5,
    external_shock: 0.4,
    org: 0.3,
    political: 0.3,
    oversight: 0.3,
  },
};

// ---------------------------------------------------------------------------
// Schema validation — SPEC-DIV-1 + SPEC-CONTENT-1
// ---------------------------------------------------------------------------

describe("division-effects schema", () => {
  it("accepts a valid division-effects.json", () => {
    // SPEC-DIV-1: content file must pass its schema.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
    const validate = ajv.compile(schema);
    const content = JSON.parse(readFileSync(CONTENT_PATH, "utf8")) as unknown;
    expect(validate(content)).toBe(true);
  });

  it("rejects a file missing competence_floor", () => {
    // SPEC-DIV-1: schema must enforce required fields.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
    const validate = ajv.compile(schema);
    const bad = {
      effect_strength: { ...TEST_PARAMS.effect_strength },
      // competence_floor omitted intentionally
    };
    expect(validate(bad)).toBe(false);
  });

  it("rejects effect_strength with a zero-or-negative value", () => {
    // SPEC-DIV-1: all effect strengths must be strictly positive.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as object;
    const validate = ajv.compile(schema);
    const bad = {
      competence_floor: 0.3,
      effect_strength: { ...TEST_PARAMS.effect_strength, fog: 0 },
    };
    expect(validate(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadDivisionEffectsParams
// ---------------------------------------------------------------------------

describe("loadDivisionEffectsParams", () => {
  beforeEach(() => {
    _resetValidateFileCache();
  });

  it("loads and validates content/engine/division-effects.json", () => {
    // SPEC-DIV-1: loader must return a valid DivisionEffectsParams object.
    const params = loadDivisionEffectsParams();
    expect(typeof params.competence_floor).toBe("number");
    expect(params.competence_floor).toBeGreaterThan(0);
    expect(params.competence_floor).toBeLessThanOrEqual(1);
    expect(typeof params.effect_strength.fog).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Identity baseline — nothing staffed
// ---------------------------------------------------------------------------

describe("divisionEffects — identity baseline", () => {
  it("returns identity when no divisions are staffed", () => {
    // SPEC-DIV-1: with no staffed divisions the output is the identity object.
    const state = makeState();
    const catalog: Division[] = [makeDivision("research", "fog")];
    const result = divisionEffects(state, catalog, TEST_PARAMS);
    expect(result).toEqual<DivisionEffects>({
      fogFactor: 1,
      transmission: 0,
      fragilityVisibility: 0,
      fragilityMitigation: 0,
      crisisSeverityReduction: 0,
      externalShockDamp: 1,
      forecastBias: 0,
    });
  });

  it("returns identity when catalog is empty", () => {
    // SPEC-DIV-1: empty catalog must not crash and must return identity.
    const state = makeState();
    const result = divisionEffects(state, [], TEST_PARAMS);
    expect(result.fogFactor).toBe(1);
    expect(result.externalShockDamp).toBe(1);
    expect(result.transmission).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Single-division channel contributions
// ---------------------------------------------------------------------------

describe("divisionEffects — single division", () => {
  it("fog channel: reduces fogFactor by effect_strength.fog * eff", () => {
    // SPEC-DIV-1: a staffed fog division reduces fogFactor below 1.
    const div = makeDivision("research", "fog");
    const eff = 0.8;
    const state = staffDiv(makeState(), "research", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    const expectedContribution = TEST_PARAMS.effect_strength.fog * eff;
    expect(result.fogFactor).toBeCloseTo(1 - expectedContribution);
    // Other outputs unchanged from identity
    expect(result.transmission).toBe(0);
    expect(result.externalShockDamp).toBe(1);
  });

  it("transmission channel: adds to transmission output", () => {
    // SPEC-DIV-1: staffed transmission division contributes to transmission.
    const div = makeDivision("monetary_affairs", "transmission");
    const eff = 1.0;
    const state = staffDiv(makeState(), "monetary_affairs", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.transmission).toBeCloseTo(TEST_PARAMS.effect_strength.transmission * eff);
    expect(result.fogFactor).toBe(1);
    expect(result.externalShockDamp).toBe(1);
  });

  it("fragility_visibility channel: adds to fragilityVisibility", () => {
    // SPEC-DIV-1: financial_stability division feeds fragilityVisibility.
    const div = makeDivision("financial_stability", "fragility_visibility");
    const eff = 0.9;
    const state = staffDiv(makeState(), "financial_stability", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.fragilityVisibility).toBeCloseTo(
      TEST_PARAMS.effect_strength.fragility_visibility * eff,
    );
  });

  it("fragility_mitigation channel: adds to fragilityMitigation", () => {
    // SPEC-DIV-1: supervision division feeds fragilityMitigation.
    const div = makeDivision("supervision", "fragility_mitigation");
    const eff = 0.7;
    const state = staffDiv(makeState(), "supervision", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.fragilityMitigation).toBeCloseTo(
      TEST_PARAMS.effect_strength.fragility_mitigation * eff,
    );
  });

  it("crisis_severity channel: adds to crisisSeverityReduction", () => {
    // SPEC-DIV-1: rbops division feeds crisisSeverityReduction.
    const div = makeDivision("rbops", "crisis_severity");
    const eff = 0.6;
    const state = staffDiv(makeState(), "rbops", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.crisisSeverityReduction).toBeCloseTo(
      TEST_PARAMS.effect_strength.crisis_severity * eff,
    );
  });

  it("external_shock channel: reduces externalShockDamp below 1", () => {
    // SPEC-DIV-1: international division reduces externalShockDamp.
    const div = makeDivision("international", "external_shock");
    const eff = 0.5;
    const state = staffDiv(makeState(), "international", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.externalShockDamp).toBeCloseTo(
      1 - TEST_PARAMS.effect_strength.external_shock * eff,
    );
    expect(result.fogFactor).toBe(1);
  });

  it("org/political/oversight channels: do not affect primary outputs", () => {
    // SPEC-DIV-1: informational channels don't change the six primary outputs.
    for (const channel of ["org", "political", "oversight"] as const) {
      const div = makeDivision(`div_${channel}`, channel);
      const state = staffDiv(makeState(), `div_${channel}`, 0.9);
      const result = divisionEffects(state, [div], TEST_PARAMS);
      expect(result.fogFactor).toBe(1);
      expect(result.externalShockDamp).toBe(1);
      expect(result.transmission).toBe(0);
      expect(result.fragilityVisibility).toBe(0);
      expect(result.fragilityMitigation).toBe(0);
      expect(result.crisisSeverityReduction).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Competence floor — underperformance when eff < floor
// ---------------------------------------------------------------------------

describe("divisionEffects — competence_floor underperformance", () => {
  it("contribution is (effect_strength * (eff - floor)) which may be negative when eff < floor", () => {
    // SPEC-DIV-1: below competence_floor the contribution is reduced/slightly negative.
    const div = makeDivision("research", "fog");
    const eff = 0.1; // well below floor of 0.3
    const state = staffDiv(makeState(), "research", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    // contribution = effect_strength.fog * (eff - floor) = 0.6 * (0.1 - 0.3) = -0.12
    // fogFactor = clamp(1 - (-0.12), small, 1) = clamp(1.12, small, 1) = 1
    expect(result.fogFactor).toBe(1);
  });

  it("at exactly the floor eff a normal contribution is applied (no underperformance penalty)", () => {
    // SPEC-DIV-1: eff >= competence_floor → normal path: contribution = effect_strength * eff.
    // At eff = floor = 0.3: contribution = 0.6 * 0.3 = 0.18, fogFactor = 1 - 0.18 = 0.82.
    const div = makeDivision("research", "fog");
    const eff = TEST_PARAMS.competence_floor; // 0.3
    const state = staffDiv(makeState(), "research", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    const expectedContribution = TEST_PARAMS.effect_strength.fog * eff; // 0.6 * 0.3 = 0.18
    expect(result.fogFactor).toBeCloseTo(1 - expectedContribution); // 0.82
  });

  it("transmission channel with eff below floor produces a slightly negative contribution clamped at 0", () => {
    // SPEC-DIV-1: additive channels like transmission floor at 0 (can't go negative).
    const div = makeDivision("monetary_affairs", "transmission");
    const eff = 0.1; // well below floor
    const state = staffDiv(makeState(), "monetary_affairs", eff);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    // Transmission is additive, floored at 0.
    expect(result.transmission).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Clamping: fogFactor and externalShockDamp ∈ (0, 1]
// ---------------------------------------------------------------------------

describe("divisionEffects — clamping", () => {
  it("fogFactor never drops below a small positive value regardless of contributions", () => {
    // SPEC-DIV-1: fogFactor clamped to (0, 1].
    // Staff two fog divisions with eff=1 to push total contribution > 1.
    const div1 = makeDivision("research", "fog");
    const div2 = makeDivision("research2", "fog");
    let state = makeState();
    state = staffDiv(state, "research", 1.0);
    state = staffDiv(state, "research2", 1.0);
    const result = divisionEffects(state, [div1, div2], TEST_PARAMS);
    expect(result.fogFactor).toBeGreaterThan(0);
    expect(result.fogFactor).toBeLessThanOrEqual(1);
  });

  it("externalShockDamp never drops below a small positive value", () => {
    // SPEC-DIV-1: externalShockDamp clamped to (0, 1].
    const div = makeDivision("international", "external_shock");
    const state = staffDiv(makeState(), "international", 1.0);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.externalShockDamp).toBeGreaterThan(0);
    expect(result.externalShockDamp).toBeLessThanOrEqual(1);
  });

  it("fogFactor does not exceed 1 in the normal case (no staffing)", () => {
    // SPEC-DIV-1: fogFactor is always ≤ 1.
    const state = makeState();
    const result = divisionEffects(state, [], TEST_PARAMS);
    expect(result.fogFactor).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Multi-division: contributions aggregate correctly
// ---------------------------------------------------------------------------

describe("divisionEffects — multi-division", () => {
  it("sums contributions across multiple channels independently", () => {
    // SPEC-DIV-1: two divisions each contributing to different channels.
    const fogDiv = makeDivision("research", "fog");
    const transmDiv = makeDivision("monetary_affairs", "transmission");
    const fogEff = 0.8;
    const transmEff = 0.9;
    let state = makeState();
    state = staffDiv(state, "research", fogEff);
    state = staffDiv(state, "monetary_affairs", transmEff);
    const result = divisionEffects(state, [fogDiv, transmDiv], TEST_PARAMS);
    const fogContrib = TEST_PARAMS.effect_strength.fog * fogEff;
    const transmContrib = TEST_PARAMS.effect_strength.transmission * transmEff;
    expect(result.fogFactor).toBeCloseTo(1 - fogContrib);
    expect(result.transmission).toBeCloseTo(transmContrib);
    expect(result.externalShockDamp).toBe(1);
  });

  it("ignores divisions not in catalog even if staffed in state", () => {
    // SPEC-DIV-1: state may have staff vars for divisions not in the provided catalog.
    const div = makeDivision("research", "fog");
    let state = makeState();
    state = staffDiv(state, "research", 0.8);
    // "mystery_div" staffed in state but not in catalog
    state = staffDiv(state, "mystery_div", 1.0);
    const result = divisionEffects(state, [div], TEST_PARAMS);
    // Only research contributes
    const expected = TEST_PARAMS.effect_strength.fog * 0.8;
    expect(result.fogFactor).toBeCloseTo(1 - expected);
  });

  it("does not count an unstaffed division in catalog", () => {
    // SPEC-DIV-1: a division in the catalog but not staffed contributes nothing.
    const div = makeDivision("research", "fog");
    const state = makeState(); // "research" not in state.flags
    const result = divisionEffects(state, [div], TEST_PARAMS);
    expect(result.fogFactor).toBe(1);
  });

  it("pure: does not mutate the input state", () => {
    // SPEC-SIM-1: effects return new state (or value); they never mutate inputs.
    const div = makeDivision("research", "fog");
    const state = staffDiv(makeState(), "research", 0.8);
    const varsBefore = { ...state.vars };
    const flagsBefore = { ...state.flags };
    divisionEffects(state, [div], TEST_PARAMS);
    expect(state.vars).toEqual(varsBefore);
    expect(state.flags).toEqual(flagsBefore);
  });
});
