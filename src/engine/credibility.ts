import { join } from "node:path";
import { loadValidated } from "../content/loader.js";
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

// SPEC-CRED-4: parameters for the de-anchoring spiral mechanic.
// Values live in content/engine/params.json#credibility; this interface
// is the runtime shape consumed by applyMonthlySpiral.
export interface CredibilityParams {
  /** Ticks below ANCHOR_THRESHOLD required before the spiral activates. */
  consecutive_months: number;
  /** Per-month widening of the expectations gap once the spiral is active. */
  drift_per_period: number;
  /** Per-month recovery of expectations_anchor toward target_inflation once credibility recovers. */
  recovery_rate: number;
  /** Long-run inflation target that expectations_anchor converges to on recovery. */
  target_inflation: number;
}

// SPEC-CRED-4: pure monthly update to the de-anchoring spiral.
//
// Below ANCHOR_THRESHOLD: increments months_below_anchor each tick; once the
// counter reaches consecutive_months the expectations_anchor drifts AWAY from
// target_inflation by drift_per_period per month (direction determined by which
// side of target the anchor is already on — it always moves further away).
//
// At or above ANCHOR_THRESHOLD: months_below_anchor is FROZEN (not reset) —
// this models persistent inflationary memory (Tradeoff #5 in the plan).
// expectations_anchor recovers toward target_inflation by recovery_rate per month,
// clamped so it never overshoots the target.
//
// Pure: returns new state, never mutates input.
export function applyMonthlySpiral(
  state: GameState,
  params: CredibilityParams
): GameState {
  const cred = getCredibility(state);
  const monthsBelow = state.vars.months_below_anchor ?? 0;
  const anchor = state.vars.expectations_anchor ?? params.target_inflation;
  const target = params.target_inflation;

  if (cred < ANCHOR_THRESHOLD) {
    const nextMonths = monthsBelow + 1;
    let nextAnchor = anchor;
    if (nextMonths >= params.consecutive_months) {
      // Drift away from target: if anchor >= target it drifts up (further above);
      // if anchor < target it drifts down (further below).
      const direction = anchor >= target ? 1 : -1;
      nextAnchor = anchor + direction * params.drift_per_period;
    }
    return {
      ...state,
      vars: {
        ...state.vars,
        months_below_anchor: nextMonths,
        expectations_anchor: nextAnchor,
      },
    };
  }

  // Credibility recovered — months_below_anchor is FROZEN (not reset).
  // expectations_anchor recovers toward target by recovery_rate, clamped (no overshoot).
  const gap = target - anchor;
  let nextAnchor: number;
  if (Math.abs(gap) <= params.recovery_rate) {
    nextAnchor = target;
  } else {
    nextAnchor = anchor + Math.sign(gap) * params.recovery_rate;
  }
  return {
    ...state,
    vars: {
      ...state.vars,
      expectations_anchor: nextAnchor,
      // months_below_anchor intentionally unchanged (frozen)
    },
  };
}

// Partial shape — full schema: schemas/engine-params.schema.json
interface CredibilityParamsSection {
  credibility: CredibilityParams;
}

// cwd-safe path resolution — mirrors src/engine/fog.ts pattern.
const PARAMS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/engine-params.schema.json"
);

/**
 * Load credibility spiral params from content/engine/params.json.
 * Validates against schemas/engine-params.schema.json before returning.
 */
export function loadCredibilityParams(): CredibilityParams {
  let loaded: CredibilityParamsSection[];
  try {
    loaded = loadValidated<CredibilityParamsSection>(SCHEMA_PATH, PARAMS_DIR);
  } catch (e) {
    throw new Error(
      "Failed to load credibility params from content/engine/params.json",
      { cause: e }
    );
  }
  if (!loaded[0] || !loaded[0].credibility) {
    throw new Error(
      "Engine params content/engine/params.json missing credibility section"
    );
  }
  return loaded[0].credibility;
}
