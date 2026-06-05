import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee, CommitteeMember } from "../content/committees.js";
import type { TraitEntry } from "../content/traits.js";
import type { GameState } from "./state.js";

// FOMC vote engine — SPEC-COMM-2 + SPEC-COMM-3.
// Pure: returns a new FomcVote; never mutates state or committee.

export interface FomcVote {
  /** The enacted rate. Always equals proposedRate in slice 1 (the committee has no override power yet); a future slice may add majority-override. */
  decided: number;
  /** Count of members whose `|preferred - proposedRate| > effectiveBand`, where
   *  `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`. */
  dissents: number;
}

export interface CommitteeParams {
  /** Anchor for every member's preferred-rate computation — the rate the committee would set at target inflation and natural unemployment. */
  neutral_rate: number;
  /** Long-run inflation target used to compute the inflation gap. */
  target_inflation: number;
  /** Natural rate of unemployment used to compute the unemployment gap. */
  target_unemployment: number;
  /** Scales how much a member's conviction narrows their effective compromise band.
   *  effective_band = compromise_band * (1 - conviction * conviction_band_factor). SPEC-COMM-5. */
  conviction_band_factor: number;
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

// Thrown when a member references a trait id not present in the supplied catalog. SPEC-COMM-5.
export class TraitNotFoundError extends Error {
  constructor(
    public readonly memberId: string,
    public readonly traitId: string,
  ) {
    super(`previewVote: member "${memberId}" references unknown trait "${traitId}".`);
    this.name = "TraitNotFoundError";
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
  leanShift: number,
): number {
  const taylor =
    params.neutral_rate +
    member.inflation_coef * gapInflation -
    member.output_coef * gapUnemployment;
  return member.inertia * laggedRate + (1 - member.inertia) * taylor + leanShift;
}

export interface MemberVotePreview {
  readonly memberId: string;
  readonly nameKey: string;
  readonly preferred: number;
  /** True iff `|preferred - proposedRate| > effectiveBand` for the `proposedRate`
   *  passed to the previewVote() call that produced this preview, where
   *  `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`.
   *  Re-evaluating with a different proposed rate requires a fresh previewVote(). */
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

// SPEC-COMM-5: resolve always-on trait effects for a member against the catalog.
// Signal-reactive hooks are dormant — skipped regardless of state.vars content.
function resolveTraitEffects(
  member: CommitteeMember,
  catalog: readonly TraitEntry[],
): { leanShift: number; bandMod: number } {
  const memberTraits = member.traits ?? [];
  if (memberTraits.length === 0) return { leanShift: 0, bandMod: 0 };

  const catalogMap = new Map(catalog.map((t) => [t.id, t]));
  let leanShift = 0;
  let bandMod = 0;
  for (const traitId of memberTraits) {
    const trait = catalogMap.get(traitId);
    if (trait === undefined) throw new TraitNotFoundError(member.id, traitId);
    leanShift += trait.effects.preferred_rate_shift ?? 0;
    bandMod += trait.effects.band_modifier ?? 0;
  }
  return { leanShift, bandMod };
}

export function previewVote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams,
  traitCatalog: readonly TraitEntry[],
): { previews: MemberVotePreview[]; gapInflation: number; gapUnemployment: number } {
  if (!Number.isFinite(proposedRate)) {
    throw new Error(`previewVote: proposedRate ${proposedRate} is not finite.`);
  }
  if (!Number.isFinite(params.conviction_band_factor) || params.conviction_band_factor < 0 || params.conviction_band_factor > 1) {
    throw new Error(`previewVote: invalid conviction_band_factor (${params.conviction_band_factor}); expected finite in [0,1].`);
  }
  const { laggedRate, gapInflation, gapUnemployment } = readGuardedVars(state, params);
  const previews = committee.members.map((m) => {
    if (!Number.isFinite(m.compromise_band) || m.compromise_band < 0 || m.compromise_band > 0.5) {
      throw new Error(
        `previewVote: member "${m.id}" has invalid compromise_band (${m.compromise_band}); expected a finite number in [0, 0.5].`,
      );
    }
    if (!Number.isFinite(m.conviction) || m.conviction < 0 || m.conviction > 1) {
      throw new Error(
        `previewVote: member "${m.id}" has invalid conviction (${m.conviction}); expected a finite number in [0, 1].`,
      );
    }
    // SPEC-COMM-5: resolve trait lean shift and band modifier; signal hooks stay dormant.
    const { leanShift, bandMod } = resolveTraitEffects(m, traitCatalog);
    if (1 + bandMod <= 0) {
      throw new Error(`member "${m.id}" trait band_modifier sum (${bandMod}) causes effectiveBand ≤ 0; reduce band_modifier magnitudes in the trait catalog.`);
    }
    const preferred = memberPreferred(m, laggedRate, gapInflation, gapUnemployment, params, leanShift);
    // conviction narrows the base band; trait band_modifier adjusts further; floor at 0.
    const effectiveBand = Math.max(
      0,
      m.compromise_band * (1 - m.conviction * params.conviction_band_factor) * (1 + bandMod),
    );
    return {
      memberId: m.id,
      nameKey: m.name,
      preferred,
      wouldDissent: Math.abs(preferred - proposedRate) > effectiveBand,
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
  traitCatalog: readonly TraitEntry[],
): FomcVote {
  const { previews } = previewVote(committee, proposedRate, state, params, traitCatalog);
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
