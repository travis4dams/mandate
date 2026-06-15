import { describe, it, expect } from "vitest";
import { generateName, nameForId, loadNamePools } from "../src/engine/names.js";
import { mulberry32 } from "../src/engine/rng.js";

// SPEC-NAME-1: seeded NPC name generator — deterministic, blocklist-safe,
// schema-validated name pools loaded from content/names/pools.json.

// Reuse the same blocklist as test/content-lint.test.ts (SPEC-CONTENT-3).
const BLOCKLIST = [
  "volcker",
  "wallich",
  "partee",
  "teeters",
  "coldwell",
  "schultz",
  "rice",
  "burns",
  "miller",
  "greenspan",
  "bernanke",
  "yellen",
  "powell",
  "taylor",
];

describe("SPEC-NAME-1: name pools load and validate", () => {
  it("loadNamePools returns pools with required arrays", () => {
    // SPEC-NAME-1
    const pools = loadNamePools();
    expect(Array.isArray(pools.honorifics)).toBe(true);
    expect(Array.isArray(pools.given_names)).toBe(true);
    expect(Array.isArray(pools.surnames)).toBe(true);
    expect(pools.given_names.length).toBeGreaterThanOrEqual(30);
    expect(pools.surnames.length).toBeGreaterThanOrEqual(30);
  });

  it("pools contain no blocklisted tokens (SPEC-CONTENT-3)", () => {
    // SPEC-NAME-1 / SPEC-CONTENT-3
    const pools = loadNamePools();
    const allTokens = [
      ...pools.given_names,
      ...pools.surnames,
      ...pools.honorifics,
    ];
    for (const token of allTokens) {
      const lower = token.toLowerCase();
      for (const blocked of BLOCKLIST) {
        expect(
          lower.includes(blocked),
          `pool token "${token}" matches blocklist entry "${blocked}"`
        ).toBe(false);
      }
    }
  });
});

describe("SPEC-NAME-1: generateName", () => {
  it("returns a GeneratedName with given, surname, and full", () => {
    // SPEC-NAME-1
    const pools = loadNamePools();
    const rng = mulberry32(42);
    const name = generateName(rng, pools);
    expect(typeof name.given).toBe("string");
    expect(typeof name.surname).toBe("string");
    expect(typeof name.full).toBe("string");
    expect(name.given.length).toBeGreaterThan(0);
    expect(name.surname.length).toBeGreaterThan(0);
  });

  it("full includes given and surname", () => {
    // SPEC-NAME-1
    const pools = loadNamePools();
    const rng = mulberry32(99);
    const name = generateName(rng, pools);
    expect(name.full).toContain(name.given);
    expect(name.full).toContain(name.surname);
  });

  it("when honorific present, full starts with it", () => {
    // SPEC-NAME-1: full = '<honorific> <given> <surname>' when honorific set
    const pools = loadNamePools();
    // Run enough draws to hit both honorific and no-honorific paths
    let foundWithHonorific = false;
    let foundWithout = false;
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const name = generateName(rng, pools);
      if (name.honorific !== undefined && name.honorific !== "") {
        expect(name.full).toBe(`${name.honorific} ${name.given} ${name.surname}`);
        foundWithHonorific = true;
      } else {
        expect(name.full).toBe(`${name.given} ${name.surname}`);
        foundWithout = true;
      }
    }
    expect(foundWithHonorific).toBe(true);
    expect(foundWithout).toBe(true);
  });
});

describe("SPEC-NAME-1: nameForId determinism", () => {
  it("same seed + npcId always returns identical result", () => {
    // SPEC-NAME-1
    const pools = loadNamePools();
    const a = nameForId(12345, "npc.chair", pools);
    const b = nameForId(12345, "npc.chair", pools);
    expect(a).toEqual(b);
  });

  it("different npcIds with same seed produce different names", () => {
    // SPEC-NAME-1
    const pools = loadNamePools();
    const a = nameForId(1, "npc.member_a", pools);
    const b = nameForId(1, "npc.member_b", pools);
    // Should be different (different npcIds hash to different sub-seeds)
    expect(a.full).not.toBe(b.full);
  });

  it("500-draw blocklist safety — no generated full name contains a blocklisted token", () => {
    // SPEC-NAME-1 / SPEC-CONTENT-3
    const pools = loadNamePools();
    for (let i = 0; i < 500; i++) {
      const name = nameForId(i, `npc.test_${i}`, pools);
      const lower = name.full.toLowerCase();
      for (const blocked of BLOCKLIST) {
        expect(
          lower.includes(blocked),
          `name "${name.full}" (seed ${i}) matches blocklist entry "${blocked}"`
        ).toBe(false);
      }
    }
  });
});
