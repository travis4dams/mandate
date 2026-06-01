import { join } from "node:path";
import { loadValidated } from "../content/loader.js";
import type { Committee, CommitteeMember } from "../content/committees.js";
import type { GameState } from "./state.js";

// FOMC vote engine — SPEC-COMM-2. Pure: returns a new FomcVote; never mutates state or committee.

export interface FomcVote {
  /** The enacted rate. In slice 1 this always equals proposedRate (Chair sets it); a future slice may let the committee override. */
  decided: number;
  /** Count of members preferring a rate outside the dissent tolerance band. */
  dissents: number;
}

export interface CommitteeParams {
  /** |preferred - proposed| > this → member dissents. */
  dissent_tolerance: number;
  /** Hawks weight inflation deviation by this factor (raises rate when inflation > target). */
  hawkish_inflation_weight: number;
  /** Doves weight unemployment deviation by this factor (lowers rate when unemployment > target). */
  dovish_unemployment_weight: number;
  /** Inflation's weight (0..1) in the neutral blend; the unemployment-gap term is subtracted with weight (1 - neutral_blend). */
  neutral_blend: number;
  /** Long-run inflation target. */
  target_inflation: number;
  /** Natural rate of unemployment the committee compares against. */
  target_unemployment: number;
}

// Thrown when vote() is called against a state that omits a required var.
// Defaulting to 0 silently corrupts the dissent count (mirrors fog.ts's
// missing-series guard).
export class VoteMissingVarError extends Error {
  constructor(public readonly seriesId: string) {
    super(`vote: required state.vars["${seriesId}"] is missing — refusing to default to 0.`);
    this.name = "VoteMissingVarError";
  }
}

function memberPreferred(
  member: CommitteeMember,
  proposedRate: number,
  gapInflation: number,
  gapUnemployment: number,
  params: CommitteeParams,
): number {
  switch (member.lean) {
    case "hawkish":
      return proposedRate + params.hawkish_inflation_weight * gapInflation;
    case "dovish":
      return proposedRate - params.dovish_unemployment_weight * gapUnemployment;
    case "neutral":
      return (
        proposedRate +
        params.neutral_blend * gapInflation -
        (1 - params.neutral_blend) * gapUnemployment
      );
    default: {
      // Exhaustiveness guard: widening CommitteeMember.lean without updating the switch becomes a loud runtime error.
      const _exhaustive: never = member.lean;
      throw new Error(`vote: unhandled CommitteeMember.lean value ${JSON.stringify(_exhaustive)}.`);
    }
  }
}

/** Pure FOMC vote simulation. decided === proposedRate for slice 1. */
export function vote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams = loadCommitteeParams(),
): FomcVote {
  const inflation = state.vars.inflation;
  const unemployment = state.vars.unemployment;
  if (inflation === undefined) throw new VoteMissingVarError("inflation");
  if (unemployment === undefined) throw new VoteMissingVarError("unemployment");
  const gapInflation = inflation - params.target_inflation;
  const gapUnemployment = unemployment - params.target_unemployment;

  const dissents = committee.members.filter((m) => {
    const preferred = memberPreferred(m, proposedRate, gapInflation, gapUnemployment, params);
    return Math.abs(preferred - proposedRate) > params.dissent_tolerance;
  }).length;

  return { decided: proposedRate, dissents };
}

// Lazy-cached loader — mirrors loadCredibilityParams pattern.
interface CommitteeParamsSection {
  committee: CommitteeParams;
}

const PARAMS_DIR = join(new URL(".", import.meta.url).pathname, "../../content/engine");
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/engine-params.schema.json");

let _cachedCommitteeParams: CommitteeParams | undefined;

/** Lazy-loaded cached params from content/engine/params.json#committee. */
export function loadCommitteeParams(): CommitteeParams {
  if (_cachedCommitteeParams !== undefined) return _cachedCommitteeParams;
  let loaded: CommitteeParamsSection[];
  try {
    loaded = loadValidated<CommitteeParamsSection>(SCHEMA_PATH, PARAMS_DIR);
  } catch (e) {
    throw new Error("Failed to load committee params from content/engine/params.json", { cause: e });
  }
  if (!loaded[0] || !loaded[0].committee) {
    throw new Error("Engine params content/engine/params.json missing committee section");
  }
  _cachedCommitteeParams = loaded[0].committee;
  return _cachedCommitteeParams;
}

/** Test-only: clear the module-level cache so a subsequent loadCommitteeParams() re-reads from disk. */
export function _resetCommitteeParamsCache(): void {
  _cachedCommitteeParams = undefined;
}
