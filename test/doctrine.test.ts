import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeState } from "../src/engine/state.js";
import {
  adoptDoctrine,
  abandonDoctrine,
  isDoctrineAdopted,
  doctrineFlagKey,
  DoctrineAlreadyAdoptedError,
  DoctrineNotAdoptedError,
} from "../src/engine/doctrine.js";
import {
  getDoctrine,
  loadDoctrineCatalog,
  DoctrineNotFoundError,
  _resetDoctrineCatalogCache,
  type DoctrineEntry,
} from "../src/content/doctrines.js";

// SPEC-DOCT-1

const INFLATION_TARGETING_ID = "doctrine.inflation_targeting";

// A minimal in-memory doctrine for unit tests (avoids disk I/O in pure engine tests).
const MOCK_DOCTRINE: DoctrineEntry = {
  id: "doctrine.mock",
  name: "doctrine.mock.name",
  standing_effects: [{ target: "credibility", value: 5 }],
  flip_flop_cost: 10,
};

const NO_EFFECTS_DOCTRINE: DoctrineEntry = {
  id: "doctrine.no_effects",
  name: "doctrine.no_effects.name",
  standing_effects: [],
  flip_flop_cost: 15,
};

describe("doctrineFlagKey", () => {
  // SPEC-DOCT-1
  it("returns the expected flag key string", () => {
    // Doctrine IDs follow the schema pattern ^doctrine\.[a-z0-9_]+$, so
    // the key is simply `${id}.adopted` — e.g. "doctrine.mock.adopted".
    expect(doctrineFlagKey("doctrine.mock")).toBe("doctrine.mock.adopted");
  });
});

describe("isDoctrineAdopted", () => {
  // SPEC-DOCT-1: returns false before adoption
  it("returns false before adoption", () => {
    const state = makeState({ vars: { credibility: 50 } });
    expect(isDoctrineAdopted(state, MOCK_DOCTRINE.id)).toBe(false);
  });

  // SPEC-DOCT-1: returns true after adoption
  it("returns true after adoption", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const after = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(isDoctrineAdopted(after, MOCK_DOCTRINE.id)).toBe(true);
  });

  // SPEC-DOCT-1: returns false after abandonment
  it("returns false after abandonment", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE);
    const abandoned = abandonDoctrine(adopted, MOCK_DOCTRINE);
    expect(isDoctrineAdopted(abandoned, MOCK_DOCTRINE.id)).toBe(false);
  });
});

describe("adoptDoctrine", () => {
  // SPEC-DOCT-1: records flag
  it("sets the adopted flag in state.flags", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const next = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(next.flags[doctrineFlagKey(MOCK_DOCTRINE.id)]).toBe(true);
  });

  // SPEC-DOCT-1: applies standing effects (credibility goes up by 5)
  it("applies standing effects — credibility increases by 5", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const next = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(next.vars.credibility).toBe(55);
  });

  // SPEC-DOCT-1: no flip-flop cost on adoption
  it("does NOT deduct flip-flop cost on adoption", () => {
    // flip_flop_cost = 10; credibility starts at 50; after adoption credibility should be 55 (not 45)
    const state = makeState({ vars: { credibility: 50 } });
    const next = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(next.vars.credibility).toBe(55);
  });

  // SPEC-DOCT-1: throws DoctrineAlreadyAdoptedError when already adopted
  it("throws DoctrineAlreadyAdoptedError when already adopted", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(() => adoptDoctrine(adopted, MOCK_DOCTRINE)).toThrow(DoctrineAlreadyAdoptedError);
  });

  // SPEC-DOCT-1: purity — does not mutate input state
  it("does not mutate the input state", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const flagsBefore = { ...state.flags };
    const varsBefore = { ...state.vars };
    adoptDoctrine(state, MOCK_DOCTRINE);
    expect(state.flags).toEqual(flagsBefore);
    expect(state.vars).toEqual(varsBefore);
  });

  // SPEC-DOCT-1: guard fires for standing effect target absent from state.vars
  it("throws when a standing_effect target is absent from state.vars", () => {
    const doctrineTouchingInflation: DoctrineEntry = {
      id: "doctrine.inflation_touch",
      name: "doctrine.inflation_touch.name",
      standing_effects: [{ target: "inflation", value: 0.01 }],
      flip_flop_cost: 0,
    };
    // state has no "inflation" var — should throw, not silently fabricate it
    const state = makeState({ vars: { credibility: 50 } });
    expect(() => adoptDoctrine(state, doctrineTouchingInflation)).toThrow(
      /standing effect target "inflation" is absent/,
    );
  });

  // SPEC-DOCT-1: non-credibility target is applied correctly when present in state.vars
  it("applies a non-credibility standing effect (inflation) when var is present", () => {
    const doctrineTouchingInflation: DoctrineEntry = {
      id: "doctrine.inflation_touch",
      name: "doctrine.inflation_touch.name",
      standing_effects: [{ target: "inflation", value: 0.01 }],
      flip_flop_cost: 0,
    };
    const state = makeState({ vars: { credibility: 50, inflation: 0.05 } });
    const next = adoptDoctrine(state, doctrineTouchingInflation);
    expect(next.vars.inflation).toBeCloseTo(0.06, 10);
    expect(next.vars.credibility).toBe(50); // unaffected
  });
});

describe("abandonDoctrine", () => {
  // SPEC-DOCT-1: reverses standing effects and deducts flip-flop cost
  it("reverses standing effects and deducts flip-flop cost", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE); // credibility = 55
    const abandoned = abandonDoctrine(adopted, MOCK_DOCTRINE);
    // standing effect reversed: 55 - 5 = 50; then flip-flop cost: 50 - 10 = 40
    expect(abandoned.vars.credibility).toBe(40);
  });

  // SPEC-DOCT-1: clears the adopted flag
  it("sets the adopted flag to false", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE);
    const abandoned = abandonDoctrine(adopted, MOCK_DOCTRINE);
    expect(abandoned.flags[doctrineFlagKey(MOCK_DOCTRINE.id)]).toBe(false);
  });

  // SPEC-DOCT-1: throws DoctrineNotAdoptedError when not adopted
  it("throws DoctrineNotAdoptedError when doctrine is not adopted", () => {
    const state = makeState({ vars: { credibility: 50 } });
    expect(() => abandonDoctrine(state, MOCK_DOCTRINE)).toThrow(DoctrineNotAdoptedError);
  });

  // SPEC-DOCT-1: flip-flop cost clamped — credibility can't go below 0
  it("clamps credibility to 0 even with a large flip-flop cost", () => {
    const highCostDoctrine: DoctrineEntry = {
      id: "doctrine.costly",
      name: "doctrine.costly.name",
      standing_effects: [],
      flip_flop_cost: 100,
    };
    const state = makeState({ vars: { credibility: 5 } });
    const adopted = adoptDoctrine(state, highCostDoctrine);
    const abandoned = abandonDoctrine(adopted, highCostDoctrine);
    expect(abandoned.vars.credibility).toBe(0);
  });

  // SPEC-DOCT-1: doctrine with no standing_effects — only flag changes and flip-flop cost applies
  it("with no standing effects, only flips flag and charges flip-flop cost", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, NO_EFFECTS_DOCTRINE);
    expect(adopted.vars.credibility).toBe(50); // no standing effects on adopt
    const abandoned = abandonDoctrine(adopted, NO_EFFECTS_DOCTRINE);
    expect(abandoned.vars.credibility).toBe(35); // 50 - 15 flip-flop cost
    expect(abandoned.flags[doctrineFlagKey(NO_EFFECTS_DOCTRINE.id)]).toBe(false);
  });

  // SPEC-DOCT-1: purity — does not mutate input state
  it("does not mutate the input state", () => {
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE);
    const flagsBefore = { ...adopted.flags };
    const varsBefore = { ...adopted.vars };
    abandonDoctrine(adopted, MOCK_DOCTRINE);
    expect(adopted.flags).toEqual(flagsBefore);
    expect(adopted.vars).toEqual(varsBefore);
  });
});

describe("getDoctrine", () => {
  // SPEC-DOCT-1: throws DoctrineNotFoundError for unknown id
  it("throws DoctrineNotFoundError for an unknown doctrine id", () => {
    expect(() => getDoctrine("doctrine.does_not_exist", [])).toThrow(DoctrineNotFoundError);
  });

  // SPEC-DOCT-1: returns the matching doctrine from the catalog
  it("returns the matching doctrine from a provided catalog", () => {
    const catalog: DoctrineEntry[] = [MOCK_DOCTRINE];
    const result = getDoctrine(MOCK_DOCTRINE.id, catalog);
    expect(result).toBe(MOCK_DOCTRINE);
  });
});

describe("loadDoctrineCatalog", () => {
  afterEach(() => {
    _resetDoctrineCatalogCache();
  });

  // SPEC-DOCT-1: loads successfully and returns at least one doctrine
  it("loads the catalog and includes inflation_targeting", () => {
    const catalog = loadDoctrineCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    const psm = catalog.find((d) => d.id === INFLATION_TARGETING_ID);
    expect(psm).toBeDefined();
    expect(psm!.flip_flop_cost).toBe(10);
  });

  // SPEC-DOCT-1: caches — same reference returned on second call
  it("returns the same array reference on repeated calls (caches)", () => {
    const first = loadDoctrineCatalog();
    const second = loadDoctrineCatalog();
    expect(first).toBe(second);
  });
});
