import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import { clampCredibility } from "./credibility.js";
import type { GameState } from "./state.js";
import type { MemberVotePreview } from "./fomc.js";

// SPEC-DOCT-2: dot-plot doctrine effects — anchoring bonus + spread-exposure cost.

export interface DotPlotParams {
  /** Credibility gained per FOMC meeting while doctrine is adopted. */
  readonly anchoring_bonus: number;
  /** Credibility lost per percentage-point of preferred-rate spread when spread > spread_threshold. */
  readonly exposure_per_pp: number;
  /** Multiplier on exposure cost when at least one member dissents. */
  readonly dissent_multiplier: number;
  /** Minimum spread (decimal) below which no exposure cost applies. */
  readonly spread_threshold: number;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/dot-plot-params.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/dot-plot.json",
);

let _cache: DotPlotParams | undefined;

export function loadDotPlotParams(): DotPlotParams {
  if (_cache !== undefined) return _cache;
  try {
    _cache = loadValidatedFile<DotPlotParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load dot-plot params from content/engine/dot-plot.json", { cause: e });
  }
  return _cache;
}

export function _resetDotPlotParamsCache(): void {
  _cache = undefined;
}

/** Spread of preferred rates: max − min across all member previews. Returns 0 for empty input. */
export function computeVoteSpread(previews: readonly MemberVotePreview[]): number {
  if (previews.length === 0) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of previews) {
    if (p.preferred < lo) lo = p.preferred;
    if (p.preferred > hi) hi = p.preferred;
  }
  return hi - lo;
}

/**
 * Apply dot-plot doctrine effects after an FOMC vote.
 * When `adopted` is false, returns state unchanged.
 * Grants an anchoring bonus then deducts a spread-exposure cost when spread > threshold.
 * Pure: does not mutate inputs.
 */
export function applyDotPlotMeetingEffects(
  state: GameState,
  previews: readonly MemberVotePreview[],
  params: DotPlotParams,
  adopted: boolean,
): GameState {
  if (!adopted) return state;

  const spread = computeVoteSpread(previews);
  const dissents = previews.filter((p) => p.wouldDissent).length;

  let credDelta = params.anchoring_bonus;

  if (spread > params.spread_threshold) {
    const multiplier = dissents > 0 ? params.dissent_multiplier : 1.0;
    credDelta -= spread * 100 * params.exposure_per_pp * multiplier;
  }

  if (state.vars.credibility === undefined) {
    throw new Error(
      "applyDotPlotMeetingEffects: state.vars.credibility is missing. " +
      "All scenarios must initialise 'credibility' (it is in REQUIRED_VARS).",
    );
  }
  const current = state.vars.credibility;
  return {
    ...state,
    vars: {
      ...state.vars,
      credibility: clampCredibility(current + credDelta),
    },
  };
}
