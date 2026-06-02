import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee, CommitteeMember } from "../content/committees.js";
import type { GameState } from "./state.js";

// FOMC vote engine — SPEC-COMM-2. Pure: returns a new FomcVote; never mutates state or committee.

export interface FomcVote {
  /** The enacted rate. Always equals proposedRate in slice 1 (the committee has no override power yet); a future slice may add majority-override. */
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

// Thrown when vote() is called against a state whose required vars are missing or non-finite.
// Defaulting to 0 (or accepting NaN/Infinity through the dissent arithmetic) silently corrupts the dissent count.
export class VoteMissingVarError extends Error {
  constructor(
    public readonly seriesId: string,
    public readonly reason: "missing" | "non_finite",
  ) {
    super(`vote: state.vars["${seriesId}"] is ${reason === "missing" ? "missing" : "not finite"} — refusing to compute dissents.`);
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

/** Per-member preview of how an FOMC vote would land. Lets UIs (SPEC-WEB-4) surface
 *  WHO would dissent and by how much, instead of only the aggregate dissent count.
 *  Pure: returns a fresh array; does not mutate the committee or state. */
export interface MemberVotePreview {
  readonly memberId: string;
  readonly nameKey: string;
  readonly lean: "hawkish" | "dovish" | "neutral";
  readonly preferred: number;
  readonly wouldDissent: boolean;
}

export function previewVote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams,
): { previews: MemberVotePreview[]; gapInflation: number; gapUnemployment: number } {
  if (!Number.isFinite(proposedRate)) {
    throw new Error(`previewVote: proposedRate ${proposedRate} is not finite.`);
  }
  const inflation = state.vars.inflation;
  const unemployment = state.vars.unemployment;
  if (inflation === undefined) throw new VoteMissingVarError("inflation", "missing");
  if (unemployment === undefined) throw new VoteMissingVarError("unemployment", "missing");
  if (!Number.isFinite(inflation)) throw new VoteMissingVarError("inflation", "non_finite");
  if (!Number.isFinite(unemployment)) throw new VoteMissingVarError("unemployment", "non_finite");
  const gapInflation = inflation - params.target_inflation;
  const gapUnemployment = unemployment - params.target_unemployment;
  const previews = committee.members.map((m) => {
    const preferred = memberPreferred(m, proposedRate, gapInflation, gapUnemployment, params);
    return {
      memberId: m.id,
      nameKey: m.name,
      lean: m.lean,
      preferred,
      wouldDissent: Math.abs(preferred - proposedRate) > params.dissent_tolerance,
    };
  });
  return { previews, gapInflation, gapUnemployment };
}

/** Pure FOMC vote simulation. decided === proposedRate for slice 1. params is required; callers resolve via loadCommitteeParams() at call site (symmetric with applyMonthlySpiral / observe). */
export function vote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams,
): FomcVote {
  if (!Number.isFinite(proposedRate)) {
    throw new Error(`vote: proposedRate ${proposedRate} is not finite — refusing to compute dissents.`);
  }
  const inflation = state.vars.inflation;
  const unemployment = state.vars.unemployment;
  if (inflation === undefined) throw new VoteMissingVarError("inflation", "missing");
  if (unemployment === undefined) throw new VoteMissingVarError("unemployment", "missing");
  if (!Number.isFinite(inflation)) throw new VoteMissingVarError("inflation", "non_finite");
  if (!Number.isFinite(unemployment)) throw new VoteMissingVarError("unemployment", "non_finite");
  const gapInflation = inflation - params.target_inflation;
  const gapUnemployment = unemployment - params.target_unemployment;

  const dissents = committee.members.filter((m) => {
    const preferred = memberPreferred(m, proposedRate, gapInflation, gapUnemployment, params);
    return Math.abs(preferred - proposedRate) > params.dissent_tolerance;
  }).length;

  return { decided: proposedRate, dissents };
}

// Lazy-cached loader — mirrors loadCredibilityParams pattern.
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/committee-params.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/committee.json");

let _cachedCommitteeParams: CommitteeParams | undefined;

/** Lazy-loaded cached params from content/engine/committee.json. */
export function loadCommitteeParams(): CommitteeParams {
  if (_cachedCommitteeParams !== undefined) return _cachedCommitteeParams;
  try {
    _cachedCommitteeParams = loadValidatedFile<CommitteeParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load committee params from content/engine/committee.json", { cause: e });
  }
  return _cachedCommitteeParams;
}

/** Test-only: clear the module-level cache so a subsequent loadCommitteeParams() re-reads from disk. */
export function _resetCommitteeParamsCache(): void {
  _cachedCommitteeParams = undefined;
}
