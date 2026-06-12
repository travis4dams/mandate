// SPEC-SIM-1: the simulation is deterministic. Given the same seed and inputs,
// a run reproduces exactly. Engine code must never call Math.random() or read
// the wall clock; all randomness flows through a seeded generator like this one.

/**
 * A seeded deterministic RNG with snapshot/restore support for SPEC-SIM-1 rollback safety.
 * `snapshot()` captures the current internal counter; `restore(n)` rewinds to that position.
 */
export interface SeededRng {
  (): number;
  snapshot(): number;
  restore(state: number): void;
}

/**
 * FNV-1a 32-bit hash of a string. Used to derive per-key RNG seeds (e.g. a
 * fogged-observation stream keyed by seed/date/series) without consuming any
 * existing RNG stream. Pure and deterministic (SPEC-SIM-1-safe).
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). Returns a SeededRng yielding floats in [0, 1). */
export function mulberry32(seed: number): SeededRng {
  let a = seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } as SeededRng;
  rng.snapshot = () => a;
  rng.restore = (state: number) => { a = state; };
  return rng;
}
