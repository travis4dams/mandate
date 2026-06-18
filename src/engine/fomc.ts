import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee, CommitteeMember } from "../content/committees.js";
import type { TraitEntry } from "../content/traits.js";
import type { GameState } from "./state.js";
import type { EffectiveBands } from "./chair-capital.js";
import { stanceKey, resolveStoredStance } from "./stance.js";
import type { CommitteeParams } from "./committee-types.js";

// FOMC vote engine — SPEC-COMM-2 + SPEC-COMM-3 + SPEC-COMM-5 + SPEC-COMM-7.
// SPEC-COMM-7 adds optional Chair capital effectiveBands that override the trait-computed band.
// Pure: returns a new FomcVote; never mutates state or committee.

export type { CommitteeParams } from "./committee-types.js";

export interface FomcVote {
  /** The enacted rate. Equals proposedRate when dissents < dissent_override_threshold; when the threshold
   *  is met, pulled toward the committee median: proposedRate + median_pull * (committeeMedian - proposedRate).
   *  SPEC-COMM-10. */
  decided: number;
  /** Count of members whose `|preferred - proposedRate| > effectiveBand`, where
   *  `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`
   *  unless overridden by an `effectiveBands` entry from Chair capital spend (SPEC-COMM-7).
   *  This count drives the median-pull override — see SPEC-COMM-10 and `FomcVote.decided`. */
  dissents: number;
  /** Arithmetic median of all members' preferred rates — always present regardless of whether the
   *  dissent override fires. Even-length committees average the two middle values. SPEC-COMM-10. */
  committeeMedian: number;
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
    super(`member "${memberId}" references unknown trait "${traitId}".`);
    this.name = "TraitNotFoundError";
  }
}

// SPEC-COMM-3: Taylor-rule preferred rate smoothed by per-member inertia. Empirical anchors: docs/research/2026-06-02-fomc-empirical-anchors.md.
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
  // leanShift is applied post-inertia as a constant additive. For a member with inertia=0.88,
  // the Taylor target only contributes 12% per period, but leanShift lands at full magnitude
  // every meeting — consistent with the SPEC ("additive shift to the member's preferred rate").
  return member.inertia * laggedRate + (1 - member.inertia) * taylor + leanShift;
}

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) throw new Error("computeMedian: empty values array");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** SPEC-COMM-10: build a FomcVote from already-computed previews, applying the median-pull override
 *  when dissents >= params.dissent_override_threshold. */
export function buildFomcVote(
  previews: readonly MemberVotePreview[],
  proposedRate: number,
  params: CommitteeParams,
): FomcVote {
  if (!Number.isFinite(params.median_pull) || params.median_pull <= 0 || params.median_pull > 1) {
    throw new Error(`buildFomcVote: invalid median_pull (${params.median_pull}); expected finite in (0, 1].`);
  }
  if (!Number.isInteger(params.dissent_override_threshold) || params.dissent_override_threshold < 1) {
    throw new Error(`buildFomcVote: invalid dissent_override_threshold (${params.dissent_override_threshold}); expected integer >= 1.`);
  }
  if (!Number.isFinite(proposedRate)) {
    throw new Error(`buildFomcVote: proposedRate ${proposedRate} is not finite.`);
  }
  if (previews.length === 0) {
    throw new Error("buildFomcVote: previews array is empty — committee must have at least one member.");
  }
  const dissents = previews.filter((p) => p.wouldDissent).length;
  const committeeMedian = computeMedian(previews.map((p) => p.preferred));
  const decided = dissents >= params.dissent_override_threshold
    ? proposedRate + params.median_pull * (committeeMedian - proposedRate)
    : proposedRate;
  return { decided, dissents, committeeMedian };
}

export interface MemberVotePreview {
  readonly memberId: string;
  readonly nameKey: string;
  readonly preferred: number;
  /** True iff `|preferred - proposedRate| > effectiveBand` for the `proposedRate`
   *  passed to the previewVote() call that produced this preview, where
   *  `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`
   *  unless overridden by an `effectiveBands` entry from Chair capital spend (SPEC-COMM-7).
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

// SPEC-COMM-5: resolve always-on trait effects for a member against the catalog map.
// Signal-reactive hooks are dormant — skipped regardless of state.vars content.
// catalogMap is built once in previewVote and passed in to avoid rebuilding per member.
function resolveTraitEffects(
  member: CommitteeMember,
  catalogMap: ReadonlyMap<string, TraitEntry>,
): { leanShift: number; bandMod: number } {
  const memberTraits = member.traits ?? [];
  if (memberTraits.length === 0) return { leanShift: 0, bandMod: 0 };

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
  /** SPEC-COMM-7: optional per-member effective band overrides from Chair capital spend.
   *  Keys are member ids; when present for a member, the override replaces the
   *  trait-computed effectiveBand for that member (leanShift still applies).
   *  Absent entries fall through to the trait-computed band.
   *  Note: an entry of `0` is a valid override (zero-tolerance band) — it is not a no-op.
   *  Use `computeEffectiveBands` (which skips zero-spend entries) rather than constructing
   *  this map manually if no-op behaviour for zero is desired. */
  effectiveBands?: EffectiveBands,
): { previews: MemberVotePreview[]; gapInflation: number; gapUnemployment: number } {
  if (!Number.isFinite(proposedRate)) {
    throw new Error(`previewVote: proposedRate ${proposedRate} is not finite.`);
  }
  if (effectiveBands) {
    const memberIds = new Set(committee.members.map((m) => m.id));
    for (const key of Object.keys(effectiveBands)) {
      if (!memberIds.has(key)) {
        throw new Error(
          `previewVote: effectiveBands key "${key}" does not match any member id in committee "${committee.id}".`,
        );
      }
    }
  }
  if (!Number.isFinite(params.conviction_band_factor) || params.conviction_band_factor < 0 || params.conviction_band_factor > 1) {
    throw new Error(`previewVote: invalid conviction_band_factor (${params.conviction_band_factor}); expected finite in [0,1].`);
  }
  const { laggedRate: globalLaggedRate, gapInflation, gapUnemployment } = readGuardedVars(state, params);
  // Build the catalog map once per previewVote call rather than once per member. SPEC-COMM-5.
  const catalogMap: ReadonlyMap<string, TraitEntry> = new Map(traitCatalog.map((t) => [t.id, t]));
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
    const { leanShift, bandMod } = resolveTraitEffects(m, catalogMap);
    if (1 + bandMod <= 0) {
      // bandMod <= -1: the (1 + bandMod) factor would flip the band's sign, which is
      // nonsensical. Throw rather than silently flooring — this is a content authoring
      // error, not a normal game state. Math.max(0,...) below handles the legitimate
      // conviction=1/factor=1 case where the band naturally reaches 0.
      throw new Error(`previewVote: member "${m.id}" trait band_modifier sum (${bandMod}) causes effectiveBand ≤ 0; reduce band_modifier magnitudes in the trait catalog.`);
    }
    // SPEC-COMM-6: use the member's drifted intermeeting stance if present; fall back to globalLaggedRate (current policy_rate).
    const laggedRate = resolveStoredStance(state.vars[stanceKey(m.id)], globalLaggedRate);
    const preferred = memberPreferred(m, laggedRate, gapInflation, gapUnemployment, params, leanShift);
    // SPEC-COMM-7: when Chair capital has been spent on this member, the override band
    // (computed by computeEffectiveBands) replaces the trait-computed band. Validate it.
    const capitalBand = effectiveBands?.[m.id];
    if (capitalBand !== undefined) {
      if (!Number.isFinite(capitalBand) || capitalBand < 0 || capitalBand > 0.5) {
        throw new Error(
          `previewVote: effectiveBands override for member "${m.id}" is invalid (${capitalBand}); expected a finite number in [0, 0.5].`,
        );
      }
    }
    // conviction narrows the base band; trait band_modifier scales further; floor at 0
    // guards the conviction=1/factor=1 case where the product reaches exactly 0.
    // Chair capital override supersedes the trait-computed band when present.
    const effectiveBand = capitalBand ?? Math.max(
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

/** Pure FOMC vote simulation. SPEC-COMM-10: decided equals proposedRate when dissents < threshold; otherwise pulled toward the committee median. */
export function vote(
  committee: Committee,
  proposedRate: number,
  state: GameState,
  params: CommitteeParams,
  traitCatalog: readonly TraitEntry[],
  /** SPEC-COMM-7: optional per-member effective band overrides from Chair capital spend. */
  effectiveBands?: EffectiveBands,
): FomcVote {
  const { previews } = previewVote(committee, proposedRate, state, params, traitCatalog, effectiveBands);
  return buildFomcVote(previews, proposedRate, params);
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
