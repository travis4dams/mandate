import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Session } from "../../../src/engine/session.js";
import { useSession } from "./useSession.js";

// SPEC-WEB-2: useSession hook tests

function makeSession(): Session {
  return Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
}

describe("useSession", () => {
  // SPEC-WEB-2: hook returns initial current and trajectory from the session.
  it("returns initial current.date and trajectory.length === 1", () => {
    const session = makeSession();
    const { result } = renderHook(() => useSession(session));
    expect(result.current.current.date).toBe("1979-08");
    expect(result.current.trajectory.length).toBe(1);
  });

  // SPEC-WEB-2: after session.advance(1), hook reflects updated current.date.
  it("reflects updated current.date after advance(1)", () => {
    const session = makeSession();
    const { result } = renderHook(() => useSession(session));
    expect(result.current.current.date).toBe("1979-08");

    act(() => {
      session.advance(1);
    });

    expect(result.current.current.date).toBe("1979-09");
    expect(result.current.trajectory.length).toBe(2);
  });

  // SPEC-WEB-2: after session.reset(), trajectory.length returns to 1.
  it("trajectory.length returns to 1 after advance(3) then reset()", () => {
    const session = makeSession();
    const { result } = renderHook(() => useSession(session));

    act(() => {
      session.advance(3);
    });

    expect(result.current.trajectory.length).toBe(4);
    expect(result.current.current.date).toBe("1979-11");

    act(() => {
      session.reset();
    });

    expect(result.current.trajectory.length).toBe(1);
    expect(result.current.current.date).toBe("1979-08");
  });

  // SPEC-WEB-2: multiple subscribers co-exist (Session fan-out).
  it("two hooks subscribed to the same session both update on advance(1)", () => {
    const session = makeSession();
    const { result: resultA } = renderHook(() => useSession(session));
    const { result: resultB } = renderHook(() => useSession(session));

    // Both start at the initial state.
    expect(resultA.current.current.date).toBe("1979-08");
    expect(resultB.current.current.date).toBe("1979-08");

    act(() => {
      session.advance(1);
    });

    // Both see the updated date after the single advance.
    expect(resultA.current.current.date).toBe("1979-09");
    expect(resultB.current.current.date).toBe("1979-09");
  });
});
