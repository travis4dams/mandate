import type { GameState } from "./state.js";

// The credibility/expectations core. This is the emotional engine of the game:
// credibility is never spent, only earned or lost, and it is both the score and
// an effectiveness multiplier.

export const CRED_MIN = 0;
export const CRED_MAX = 100;
export const ANCHOR_THRESHOLD = 60;

export function clampCredibility(v: number): number {
  return Math.max(CRED_MIN, Math.min(CRED_MAX, v));
}

export interface MeetingOutcome {
  /** Number of dissenting votes recorded at the meeting. */
  dissents: number;
  /** True if the decision diverged from prior forward guidance. */
  surprisedMarkets: boolean;
  /** True if the mandate is currently satisfied within tolerance. */
  onTarget: boolean;
}

// SPEC-CRED-1: dissents and surprises erode credibility; on-target outcomes build it.
export function applyMeetingOutcome(credibility: number, o: MeetingOutcome): number {
  let next = credibility;
  next -= o.dissents * 2;
  if (o.surprisedMarkets) next -= 5;
  if (o.onTarget) next += 3;
  return clampCredibility(next);
}

// SPEC-CRED-2: expectations stay anchored only above a credibility threshold.
export function expectationsAnchored(credibility: number): boolean {
  return credibility >= ANCHOR_THRESHOLD;
}

// SPEC-CRED-3: the lower the credibility, the more "pain" a given policy move costs
// (1.0x at full credibility, rising to 3.0x at zero). This is the multiplier that
// makes a strong reputation let you "talk softly and carry a big stick".
export function painMultiplier(credibility: number): number {
  return 1 + (CRED_MAX - clampCredibility(credibility)) / 50;
}

export function getCredibility(state: GameState): number {
  return state.vars.credibility ?? 50;
}
