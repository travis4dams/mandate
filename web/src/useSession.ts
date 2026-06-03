// SPEC-WEB-2: thin React hook backed by useSyncExternalStore that subscribes to a
// Session. The hook returns the Session instance so callers can read current /
// trajectory and call mutators (advance, proposeRate, reset, setForwardGuidanceStance).
// Reference stability of session.current / session.trajectory is what makes the
// Session/React boundary tear-free under React 18.3 concurrent commit.

// IMPORTANT: engine-content MUST be imported before any engine module so its
// module-load side-effect populates the content registry before Session's
// transitive imports (clock.ts, fomc.ts, etc.) run their eager loadValidatedFile
// calls at module top.
import "./engine-content";
import { useRef, useSyncExternalStore } from "react";
import { Session } from "../../src/engine/session";
import type { GameStateSnapshot } from "../../src/engine/state";

export function useSession(
  scenarioId: string,
  seed: number,
  committeeId: string,
): { session: Session; current: GameStateSnapshot; trajectory: readonly GameStateSnapshot[] } {
  // useRef so the Session is created once per mount and never discarded when
  // scenarioId/seed/committeeId identity changes (e.g. parent re-renders with
  // new literals). useMemo would silently drop accumulated history on re-render.
  const sessionRef = useRef<Session | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = Session.fromScenario(scenarioId, seed, committeeId);
  }
  const session = sessionRef.current;

  // Bind once and stash in a ref so `subscribe` is referentially stable across
  // renders. Re-binding per render would make useSyncExternalStore unsubscribe
  // and resubscribe on every commit, briefly missing notifications and tripping
  // React 18 strict-mode warnings.
  const subscribeRef = useRef<(listener: () => void) => () => void>(undefined);
  if (subscribeRef.current === undefined) {
    subscribeRef.current = session.subscribe.bind(session);
  }
  const subscribe = subscribeRef.current;
  // useSyncExternalStore requires identity-stable getSnapshot return values across
  // no-op reads. Session.current and Session.trajectory are referentially stable
  // (rebuilt only on mutation), which is the SPEC-SESSION-0 contract.
  const current = useSyncExternalStore(
    subscribe,
    () => session.current,
    () => session.current,
  );
  const trajectory = useSyncExternalStore(
    subscribe,
    () => session.trajectory,
    () => session.trajectory,
  );

  return { session, current, trajectory };
}
