// Real-time-with-pause game clock. Time flows automatically while "playing";
// the Chair pauses to think and act. Two things interrupt the flow:
//  - a pending escalation HARD-blocks advancement (you must decide first), and
//  - a scheduled FOMC meeting month pauses ONCE so you can set the rate (resume to hold).
// The engine calendar is monthly, so each real-time tick advances one month at the
// chosen speed — the Paradox-style clock feel without a calendar rewrite.
//
// Design note: between-meeting turns carry no required decision — the clock
// advances them automatically. Players are never asked to "click through" a non-meeting
// month. The only pauses are (a) FOMC meeting months (rate-setting opportunity) and
// (b) escalations that must be resolved before time can continue. This is the intended
// design per DESIGN.md §"Core loop & the day-to-day": "Time flows continuously; you
// pause to think and act."

import { useEffect, useRef, useState } from "react";
import type { Session } from "../../src/engine/session";

export type ClockSpeed = "slow" | "normal" | "fast";

// Milliseconds between auto-advances at each speed.
export const SPEED_MS: Record<ClockSpeed, number> = {
  slow: 2500,
  normal: 1100,
  fast: 400,
};

export interface GameClock {
  playing: boolean;
  speed: ClockSpeed;
  /** True when advancement is blocked by a pending escalation (resolve to continue). */
  blockedByEscalation: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(s: ClockSpeed): void;
}

export function useGameClock(session: Session): GameClock {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ClockSpeed>("normal");
  // Track which meeting month we've already paused for, so resuming advances past it
  // instead of re-pausing on the same month forever.
  const handledMeeting = useRef<string | null>(null);
  const blockedByEscalation = session.escalations().length > 0;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      // Hard interrupt: unresolved escalations must be decided before time moves.
      if (session.escalations().length > 0) {
        setPlaying(false);
        return;
      }
      const date = session.current.date;
      // Pause once per meeting month so the Chair can convene the FOMC (or resume to hold).
      if (session.isMeetingMonth(date) && handledMeeting.current !== date) {
        handledMeeting.current = date;
        setPlaying(false);
        return;
      }
      try {
        session.advance(1);
      } catch {
        setPlaying(false);
      }
    }, SPEED_MS[speed]);
    return () => clearInterval(id);
  }, [playing, speed, session]);

  return {
    playing,
    speed,
    blockedByEscalation,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed,
  };
}
