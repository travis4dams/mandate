import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

// The credibility/expectations core: never spent, only earned or lost; both the score and the effectiveness multiplier.

// SPEC-CRED-5: bounds and meeting-outcome weights are content, not code.
// cwd-safe path resolution — mirrors src/engine/fog.ts.
// Subset of the credibility.json fields: the expectations/dynamics params in the same
// file are consumed by src/engine/dynamics.ts, which loads it independently.
interface CredibilityMeetingParams {
  cred_min: number;
  cred_max: number;
  surprise_penalty: number;
  on_target_gain: number;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/credibility.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/credibility.json");

const params = loadValidatedFile<CredibilityMeetingParams>(SCHEMA_PATH, FILE_PATH);

// JSON Schema cannot compare two properties, so the range invariant is enforced here:
// an inverted range would make clampCredibility return cred_max for every input.
if (params.cred_min >= params.cred_max) {
  throw new Error(
    `content/engine/credibility.json: cred_min (${params.cred_min}) must be < cred_max (${params.cred_max})`,
  );
}

export const CRED_MIN = params.cred_min;
export const CRED_MAX = params.cred_max;

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
// SPEC-CRED-5: the weights live in content/engine/credibility.json.
export function applyMeetingOutcome(credibility: number, o: MeetingOutcome): number {
  let next = credibility;
  if (o.surprisedMarkets) next -= params.surprise_penalty;
  if (o.onTarget) next += params.on_target_gain;
  return clampCredibility(next);
}

// SPEC-CRED-2: expectations stay anchored only at or above the credibility threshold.
export function expectationsAnchored(credibility: number, threshold: number): boolean {
  return credibility >= threshold;
}

// SPEC-CRED-3: lower credibility → higher pain multiplier (1.0x at CRED_MAX, 3.0x at CRED_MIN).
// Expressed in terms of the content-driven range so retuning cred_min/cred_max preserves the
// 1x–3x guarantee instead of silently rescaling it.
export function painMultiplier(credibility: number): number {
  return 1 + (2 * (CRED_MAX - clampCredibility(credibility))) / (CRED_MAX - CRED_MIN);
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
