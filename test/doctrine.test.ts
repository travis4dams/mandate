import { describe, it, expect, afterEach, vi } from "vitest";
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
import { Session } from "../src/engine/session.js";

// SPEC-DOCT-1

const INFLATION_TARGETING_ID = "doctrine.inflation_targeting";

// A minimal in-memory doctrine for unit tests (avoids disk I/O in pure engine tests).
const MOCK_DOCTRINE: DoctrineEntry = {
  id: "doctrine.mock",
  name: "doctrine.mock.name",
  description: "doctrine.mock.desc",
  standing_effects: [{ target: "credibility", value: 5 }],
  flip_flop_cost: 10,
};

const NO_EFFECTS_DOCTRINE: DoctrineEntry = {
  id: "doctrine.no_effects",
  name: "doctrine.no_effects.name",
  description: "doctrine.no_effects.desc",
  standing_effects: [],
  flip_flop_cost: 15,
};

describe("doctrineFlagKey", () => {
  // SPEC-DOCT-1
  it("returns the expected flag key string without double-prefix", () => {
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
      description: "doctrine.costly.desc",
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

describe("adoptDoctrine / abandonDoctrine — round-trip symmetry", () => {
  // SPEC-DOCT-1: adopt then abandon must restore the original credibility exactly (no clamping in adoptDoctrine)
  it("restores original credibility after adopt then abandon (no flip-flop cost)", () => {
    // Start at 98: adopt +5 stores 103; abandon subtracts 5 back to 98 — no permanent loss
    const state = makeState({ vars: { credibility: 98 } });
    const highGainDoctrine: DoctrineEntry = {
      id: "doctrine.high_gain",
      name: "doctrine.high_gain.name",
      description: "doctrine.high_gain.desc",
      standing_effects: [{ target: "credibility", value: 5 }],
      flip_flop_cost: 0,
    };
    const adopted = adoptDoctrine(state, highGainDoctrine);
    expect(adopted.vars.credibility).toBe(103);
    const abandoned = abandonDoctrine(adopted, highGainDoctrine);
    // Standing effect reversed exactly; no flip-flop cost → back to original 98
    expect(abandoned.vars.credibility).toBe(98);
  });

  // SPEC-DOCT-1: flip-flop cost is separate from standing-effect reversal
  it("charges flip-flop cost on top of exact standing-effect reversal", () => {
    // Start at 50: adopt +5 → 55; abandon: reverse to 50, then deduct flip-flop cost 10 → 40
    const state = makeState({ vars: { credibility: 50 } });
    const adopted = adoptDoctrine(state, MOCK_DOCTRINE);
    expect(adopted.vars.credibility).toBe(55);
    const abandoned = abandonDoctrine(adopted, MOCK_DOCTRINE);
    expect(abandoned.vars.credibility).toBe(40);
  });

  // SPEC-DOCT-1: adoptDoctrine throws when a target var is absent (symmetric with abandonDoctrine)
  it("adoptDoctrine throws when a target var is absent in state", () => {
    const state = makeState({ vars: {} }); // no credibility var
    expect(() => adoptDoctrine(state, MOCK_DOCTRINE)).toThrow(
      'adoptDoctrine: var "credibility" is absent in state'
    );
  });

  // SPEC-DOCT-1
  it("abandon after adopt restores exact original credibility (round-trip invariant)", () => {
    const doctrine = { ...MOCK_DOCTRINE, standing_effects: [{ target: "credibility", value: 5 }] };
    // Start at credibility 98 so +5 would exceed 100 without clamp
    const state = makeState({ vars: { credibility: 98 } });
    const adopted = adoptDoctrine(state, doctrine);
    const restored = abandonDoctrine(adopted, { ...doctrine, flip_flop_cost: 0 });
    // Should restore to exactly 98 (not 98-5+2 or similar clamp artifact)
    expect(restored.vars.credibility).toBe(98);
  });
});

describe("Session.adoptDoctrine / Session.abandonDoctrine", () => {
  const MOCK_CATALOG: DoctrineEntry[] = [MOCK_DOCTRINE, NO_EFFECTS_DOCTRINE];

  function makeSession(): Session {
    // SPEC-DOCT-1: use the 1979 stagflation scenario which is always available
    return Session.fromScenario("scen.1979_stagflation", 0, "comm.fomc_1979");
  }

  // SPEC-DOCT-1: adoptDoctrine updates state and rebuilds caches
  it("adoptDoctrine — state reflects adoption and cache is updated", () => {
    const session = makeSession();
    const credBefore = session.current.vars.credibility as number;
    session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    // flag is set
    expect(session.current.flags[doctrineFlagKey(MOCK_DOCTRINE.id)]).toBe(true);
    // standing effect applied (+5 credibility, no clamping on adopt)
    const expectedCred = credBefore + 5;
    expect(session.current.vars.credibility).toBe(expectedCred);
  });

  // SPEC-DOCT-1: abandonDoctrine updates state and rebuilds caches
  it("abandonDoctrine — state reflects abandonment and cache is updated", () => {
    const session = makeSession();
    const credBefore = session.current.vars.credibility as number;
    session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    const credAfterAdopt = session.current.vars.credibility as number;
    session.abandonDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    // flag cleared
    expect(session.current.flags[doctrineFlagKey(MOCK_DOCTRINE.id)]).toBe(false);
    // standing effect reversed then flip-flop cost (10) deducted, clamped
    const expectedCred = Math.max(0, credAfterAdopt - 5 - 10);
    expect(session.current.vars.credibility).toBe(expectedCred);
  });

  // SPEC-DOCT-1: adoptDoctrine throws DoctrineNotFoundError for unknown id
  it("adoptDoctrine — throws DoctrineNotFoundError for unknown id", () => {
    const session = makeSession();
    expect(() => session.adoptDoctrine("doctrine.unknown", MOCK_CATALOG)).toThrow(DoctrineNotFoundError);
  });

  // SPEC-DOCT-1: adoptDoctrine throws DoctrineAlreadyAdoptedError on double-adopt
  it("adoptDoctrine — throws DoctrineAlreadyAdoptedError when already adopted", () => {
    const session = makeSession();
    session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    expect(() => session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG)).toThrow(DoctrineAlreadyAdoptedError);
  });

  // SPEC-DOCT-1: abandonDoctrine throws DoctrineNotAdoptedError when not adopted
  it("abandonDoctrine — throws DoctrineNotAdoptedError when not adopted", () => {
    const session = makeSession();
    expect(() => session.abandonDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG)).toThrow(DoctrineNotAdoptedError);
  });

  // SPEC-DOCT-1: listeners are notified after adoptDoctrine
  it("adoptDoctrine — notifies subscribers", () => {
    const session = makeSession();
    const listener = vi.fn();
    session.subscribe(listener);
    session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-DOCT-1: listeners are notified after abandonDoctrine
  it("abandonDoctrine — notifies subscribers", () => {
    const session = makeSession();
    session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    const listener = vi.fn();
    session.subscribe(listener);
    session.abandonDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // SPEC-DOCT-1: checkpoint/rollback — state stays consistent if _rebuildCaches throws
  it("adoptDoctrine — rolls back _state if _rebuildCaches throws, keeping cache in sync", () => {
    const session = makeSession();
    const stateBefore = session.current;
    // Force _rebuildCaches to throw once by temporarily monkey-patching Session's private method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = Object.getPrototypeOf(session) as any;
    const original = proto._rebuildCaches;
    let callCount = 0;
    proto._rebuildCaches = function (this: unknown) {
      callCount++;
      if (callCount === 1) throw new Error("simulated _rebuildCaches failure");
      return original.call(this);
    };
    try {
      expect(() => session.adoptDoctrine(MOCK_DOCTRINE.id, MOCK_CATALOG)).toThrow("simulated _rebuildCaches failure");
    } finally {
      proto._rebuildCaches = original;
    }
    // After rollback, current snapshot must equal what it was before the failed adoptDoctrine
    expect(session.current.flags[doctrineFlagKey(MOCK_DOCTRINE.id)]).toBeFalsy();
    expect(session.current.vars.credibility).toBe(stateBefore.vars.credibility);
  });
});
