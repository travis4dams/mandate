import { describe, it, expect } from "vitest";
import { tick } from "../src/engine/clock";
import { makeState } from "../src/engine/state";

// SPEC-SIM-3

describe("tick", () => {
  it("advances date by 1 month", () => {
    const s = makeState({ date: "1979-08", vars: { x: 1 }, flags: { at_war: false } });
    const next = tick(s, 1);
    expect(next.date).toBe("1979-09");
    expect(next.vars).toEqual(s.vars);
    expect(next.flags).toEqual(s.flags);
  });

  it("advances date by 12 months crossing a year", () => {
    const s = makeState({ date: "1979-08" });
    const next = tick(s, 12);
    expect(next.date).toBe("1980-08");
  });

  it("advances date by 5 months crossing a year", () => {
    const s = makeState({ date: "1979-08" });
    const next = tick(s, 5);
    expect(next.date).toBe("1980-01");
  });

  it("zero-month advance is a pure clone — no history pushed", () => {
    const s = makeState({ date: "1979-08", vars: { x: 1 } });
    const next = tick(s, 0);
    expect(next.date).toBe("1979-08");
    expect(next.history.length).toBe(0);
  });

  it("does not mutate the input state (no-mutation invariant)", () => {
    const s = makeState({ date: "1979-08", vars: { y: 42 }, flags: { recession: true } });
    const before = JSON.stringify(s);
    tick(s, 3);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("December → January rolls year correctly", () => {
    // SPEC-SIM-3: a swap of the year-increment condition would break this case
    // while leaving year-crossing tests that start mid-year green.
    const s = makeState({ date: "1979-12" });
    const next = tick(s, 1);
    expect(next.date).toBe("1980-01");
  });

  it("history is bounded to params.history_size", () => {
    const params = { history_size: 3 };
    let s = makeState({ date: "1979-01" });
    for (let i = 0; i < 10; i++) {
      s = tick(s, 1, params);
    }
    expect(s.history.length).toBeLessThanOrEqual(3);
    // Verify the surviving entries: history[0] is most-recent, history[2] is oldest kept.
    expect(s.history[0].date).toBe("1979-10");
    expect(s.history[2].date).toBe("1979-08");
  });

  it("history[0] is the most-recent prior snapshot after one tick", () => {
    const s = makeState({ date: "1979-08", vars: { z: 7 }, flags: {} });
    const next = tick(s, 1);
    expect(next.history.length).toBeGreaterThanOrEqual(1);
    expect(next.history[0].date).toBe("1979-08");
    expect(next.history[0].vars).toEqual({ z: 7 });
    expect(next.history[0].flags).toEqual({});
  });
});
