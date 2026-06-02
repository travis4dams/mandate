import { useRef, useSyncExternalStore } from "react";
import type { Session } from "../../../src/engine/session.js";
import type { GameStateSnapshot } from "../../../src/engine/state.js";

// SPEC-WEB-2: useSyncExternalStore adapter for the Session façade.

export interface SessionSnapshot {
  current: GameStateSnapshot;
  trajectory: readonly GameStateSnapshot[];
}

/**
 * React hook that adapts the Session external store to useSyncExternalStore.
 *
 * Session provides referential stability: `session.current` and
 * `session.trajectory` return the same object references between mutations.
 * We exploit that guarantee to cache the composite SessionSnapshot, ensuring
 * getSnapshot returns the same reference when nothing has changed — a requirement
 * of useSyncExternalStore to avoid infinite re-render loops.
 */
export function useSession(session: Session): SessionSnapshot {
  // Cached refs so we can return a stable snapshot object when neither
  // `current` nor `trajectory` has changed reference.
  const cacheRef = useRef<{
    current: GameStateSnapshot;
    trajectory: readonly GameStateSnapshot[];
    snapshot: SessionSnapshot;
  } | null>(null);

  function getSnapshot(): SessionSnapshot {
    const current = session.current;
    const trajectory = session.trajectory;
    const cache = cacheRef.current;
    // Return the cached snapshot when references are unchanged (the common case
    // between mutations). Create a new snapshot only when the session mutated.
    if (cache !== null && cache.current === current && cache.trajectory === trajectory) {
      return cache.snapshot;
    }
    const snapshot: SessionSnapshot = { current, trajectory };
    cacheRef.current = { current, trajectory, snapshot };
    return snapshot;
  }

  return useSyncExternalStore(
    session.subscribe.bind(session),
    getSnapshot,
    getSnapshot,
  );
}
