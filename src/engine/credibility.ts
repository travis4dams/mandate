import type { GameState } from "./state.js";

// The credibility/expectations core: never spent, only earned or lost; both the score and the effectiveness multiplier.

export const CRED_MIN = 0;
export const CRED_MAX = 100;

export function clampCredibility(v: number): number {
  return Math.max(CRED_MIN, Math.min(CRED_MAX, v));
}

export interface MeetingOutcome {
  /** True if the decision diverged from prior forward guidance. */
  surprisedMarkets: boolean;
  /** True if the mandate is currently satisfied within tolerance. */
  onTarget: boolean;
}

// SPEC-CRED-1: market surprises erode credibility; on-target outcomes build it. Committee
// dissents do NOT affect credibility — FOMC dissents are not published in a way that damages
// the Chair's standing, and the continuous mission-tied channel (SPEC-CRED-6) is where economic
// outcomes move credibility. Consensus-building costs are a separate, future mechanic (issue #33).
export function applyMeetingOutcome(credibility: number, o: MeetingOutcome): number {
  let next = credibility;
  if (o.surprisedMarkets) next -= 5;
  if (o.onTarget) next += 3;
  return clampCredibility(next);
}

// SPEC-CRED-2: expectations stay anchored only at or above the credibility threshold.
export function expectationsAnchored(credibility: number, threshold: number): boolean {
  return credibility >= threshold;
}

// SPEC-CRED-3: lower credibility → higher pain multiplier (1.0x at full credibility, up to 3.0x at zero).
export function painMultiplier(credibility: number): number {
  return 1 + (CRED_MAX - clampCredibility(credibility)) / 50;
}

export function getCredibility(state: GameState): number {
  if (state.vars.credibility === undefined) {
    throw new Error(
      "getCredibility: state.vars.credibility is missing. " +
      "All scenarios must initialise 'credibility' (it is in REQUIRED_VARS).",
    );
  }
  return state.vars.credibility;
}
