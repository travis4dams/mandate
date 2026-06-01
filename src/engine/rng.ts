// SPEC-SIM-1: the simulation is deterministic. Given the same seed and inputs,
// a run reproduces exactly. Engine code must never call Math.random() or read
// the wall clock; all randomness flows through a seeded generator like this one.

/** Deterministic PRNG (mulberry32). Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
