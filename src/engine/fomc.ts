import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee, CommitteeMember } from "../content/committees.js";
import type { GameState } from "./state.js";

// FOMC vote engine — SPEC-COMM-2 + SPEC-COMM-3.
// Pure: returns a new FomcVote; never mutates state or committee.

export interface FomcVote {
  /** The enacted rate. Always equals proposedRate in slice 1 (the committee has no override power yet); a future slice may add majority-override. */
  decided: number;
  /** Count of members preferring a rate outside the dissent tolerance band. */
  dissents: number;
}

export interface CommitteeParams {
  /** |preferred - proposed| > this → member dissents. */
  dissent_tolerance: number;
  /** Anchor for every member's preferred-rate computation — the rate the committee would set at target inflation and natural unemployment. */
  neutral_rate: number;
  /** Long-run inflation target used to compute the inflation gap. */
  target_inflation: number;
  /** Natural rate of unemployment used to compute the unemployment gap. */
  target_unemployment: number;
}

// Thrown when vote() is called against a state whose required vars are missing or non-finite.
export class VoteMissingVarError extends Error {
  constructor(
    public readonly seriesId: string,
    public readonly reason: "missing" | "non_finite",
  ) {
    super(`vote: state.vars["${seriesId}"] is ${reason === "missing" ? "missing" : "not finite"} — refusing to compute dissents.`);
    this.name = "VoteMissingVarError";
  }
}

// SPEC-COMM-3: per-member preferred rate via a Taylor-rule reaction function with
// member-specific coefficients (inflation_coef, output_coef) anchored at neutral_rate,
// smoothed by per-member inertia against the lagged policy rate. Empirically, FOMC
// participants' Taylor-rule prescriptions cluster within ~150bp at the 1-2y horizon
// thanks to high inertia (~0.85-0.92); the old trichotomy produced 1500bp spreads
// at the 1979 starting state, which is roughly an order of magnitude too wide.
function memberPreferred(
  member: CommitteeMember,
  laggedRate: number,
  gapInflation: number,
  gapUnemployment: number,
  params: CommitteeParams,
): number {
  const taylor =
    params.neutral_rate +
    member.inflation_coef * gapInflation -
    member.output_coef * gapUnemployment;
  return member.inertia * laggedRate + (1 - member.inertia) * taylor;
}

/** Per-member preview of how an FOMC vote would land. Pure; returns fresh objects. */
export interface MemberVotePreview {
  readonly memberId: string;
  readonly nameKey: string;
  readonly preferred: number;
  readonly wouldDissent: boolean;
}

function readGuardedVars(state: GameState, params: CommitteeParams): {
  inflation: number;
  unemployment: number;
  laggedRate: number;
  gapInflation: number;
  gapUnemployment: number;
} {
  const inflation = state.vars.inflation;
  const unemployment = state.vars.unemployment;
  const laggedRate = state.vars.policy_rate;
  if (inflation === undefined) throw new VoteMissingVarError("inflation", "missing");
  if (unemployment === undefined) throw new VoteMissingVarError("unemployment", "missing");
  if (laggedRate === undefined) throw new VoteMissingVarError("policy_rate", "missing");
  if (!Number.isFinite(inflation)) throw new VoteMissingVarError("inflation", "non_finite");
  if (!Number.isFinite(unemployment)) throw new VoteMissingVarError("unemployment", "non_finite");
  if (!Number.isFinite(laggedRate)) throw new VoteMissingVarError("policy_rate", "non_finite");
  return {
    inflation,
    unemployment,
    laggedRate,
    gapInflation: inflation - params.target_inflation,
    gapUnemployment: unemployment - params.target_unemployment,
  };
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
  const { laggedRate, gapInflation, gapUnemployment } = readGuardedVars(state, params);
  const previews = committee.members.map((m) => {
    const preferred = memberPreferred(m, laggedRate, gapInflation, gapUnemployment, params);
    return {
      memberId: m.id,
      nameKey: m.name,
      preferred,
      wouldDissent: Math.abs(preferred - proposedRate) > params.dissent_tolerance,
    };
  });
  return { previews, gapInflation, gapUnemployment };
}

/** Pure FOMC vote simulation. decided === proposedRate for slice 1. */
export function vote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams,
): FomcVote {
  const { previews } = previewVote(committee, proposedRate, state, params);
  return { decided: proposedRate, dissents: previews.filter((p) => p.wouldDissent).length };
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/committee-params.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/committee.json");

let _cachedCommitteeParams: CommitteeParams | undefined;

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
