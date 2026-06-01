import { describe, it, expect } from "vitest";
import { mulberry32 } from "../src/engine/rng";

describe("deterministic rng", () => {
  // SPEC-SIM-1
  it("reproduces the same sequence for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  // SPEC-SIM-1
  it("diverges for different seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});
