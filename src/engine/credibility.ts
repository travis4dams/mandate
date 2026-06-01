import { join } from "node:path";
import { loadValidated } from "../content/loader.js";
import type { GameState } from "./state.js";

// The credibility/expectations core: never spent, only earned or lost; both the score and the effectiveness multiplier.

export const CRED_MIN = 0;
export const CRED_MAX = 100;

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

// SPEC-CRED-2: expectations stay anchored only at or above the credibility threshold.
// Threshold lives in content/engine/params.json#credibility.anchor_threshold (SPEC-CRED-4).
export function expectationsAnchored(credibility: number, threshold: number): boolean {
  return credibility >= threshold;
}

// SPEC-CRED-3: lower credibility → higher pain multiplier (1.0x at full credibility, up to 3.0x at zero).
export function painMultiplier(credibility: number): number {
  return 1 + (CRED_MAX - clampCredibility(credibility)) / 50;
}

export function getCredibility(state: GameState): number {
  return state.vars.credibility ?? 50;
}

// SPEC-CRED-4: parameters for the de-anchoring spiral mechanic (sourced from content).
export interface CredibilityParams {
  /** Credibility level (in [0, 100]) at or above which expectations remain anchored. */
  anchor_threshold: number;
  /** Ticks below anchor_threshold required before the spiral activates. */
  consecutive_months: number;
  /** Per-month widening of the expectations gap once the spiral is active. */
  drift_per_period: number;
  /** Per-month recovery of expectations_anchor toward target_inflation once credibility recovers. */
  recovery_rate: number;
  /** Long-run inflation target that expectations_anchor converges to on recovery. */
  target_inflation: number;
}

// SPEC-CRED-4: pure monthly update. Frozen counter on recovery = persistent inflationary memory (Tradeoff #5).
export function applyMonthlySpiral(
  state: GameState,
  params: CredibilityParams,
): GameState {
  const cred = getCredibility(state);
  const monthsBelow = state.vars.months_below_anchor ?? 0;
  const anchor = state.vars.expectations_anchor ?? params.target_inflation;
  const target = params.target_inflation;

  if (cred < params.anchor_threshold) {
    const nextMonths = monthsBelow + 1;
    let nextAnchor = anchor;
    if (nextMonths >= params.consecutive_months) {
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

const PARAMS_DIR = join(new URL(".", import.meta.url).pathname, "../../content/engine");
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/engine-params.schema.json");

let _cachedCredibilityParams: CredibilityParams | undefined;

/** Lazy-loaded cached params from content/engine/params.json#credibility. */
export function loadCredibilityParams(): CredibilityParams {
  if (_cachedCredibilityParams !== undefined) return _cachedCredibilityParams;
  let loaded: CredibilityParamsSection[];
  try {
    loaded = loadValidated<CredibilityParamsSection>(SCHEMA_PATH, PARAMS_DIR);
  } catch (e) {
    throw new Error("Failed to load credibility params from content/engine/params.json", { cause: e });
  }
  if (!loaded[0] || !loaded[0].credibility) {
    throw new Error("Engine params content/engine/params.json missing credibility section");
  }
  _cachedCredibilityParams = loaded[0].credibility;
  return _cachedCredibilityParams;
}
