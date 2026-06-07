import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee } from "../content/committees.js";

// SPEC-COMM-7: Chair capital persuasion.
// The Chair has a per-meeting persuasion budget derived from credibility.
// Spending capital on a member widens their compromise band for that meeting only —
// it is never stored in state (use-it-or-lose-it, refreshed each meeting).

/** Spend units to allocate per member: keys are member ids, values are capital units (non-negative). */
export type CapitalSpend = Readonly<Record<string, number>>;

/** Per-member widened compromise bands after applying Chair capital: keys are member ids, values are absolute band widths in [0, 0.5]. */
export type EffectiveBands = Readonly<Record<string, number>>;

export interface ChairCapitalParams {
  /** Minimum budget even at zero credibility (integer units). */
  readonly base_capital: number;
  /** Extra budget per credibility point (floored): budget += floor(weight * credibility). */
  readonly credibility_weight: number;
  /** Rate-unit widening per spent capital unit. */
  readonly band_widen_per_unit: number;
  /** Maximum capital units spendable on a single member per meeting. */
  readonly max_spend_per_member: number;
}

/**
 * Compute the Chair's persuasion budget for the current meeting.
 * Pure: no side effects, no randomness.
 * @param credibility — current credibility score in [0, 100].
 */
export function computeChairCapital(credibility: number, params: ChairCapitalParams): number {
  return params.base_capital + Math.floor(params.credibility_weight * credibility);
}

/**
 * Compute per-member effective compromise bands after applying capital spend.
 * Returns only the members who received positive spend (callers merge with the member's
 * original compromise_band via `effectiveBands?.[m.id] ?? m.compromise_band`).
 * Zero spend is a no-op (member absent from result); negative or over-limit spend throws.
 * Each member's result: `compromise_band + spend * band_widen_per_unit` (spend must be ≤ max_spend_per_member; over-limit throws).
 * Pure: does not mutate committee or params.
 * @throws {Error} if any capitalSpend key does not match a member id in the committee.
 * @throws {Error} if any spend value is negative.
 * @throws {Error} if any spend value exceeds max_spend_per_member (SPEC-COMM-7 hard budget).
 * @throws {Error} if the resulting widened band would exceed 0.5.
 */
export function computeEffectiveBands(
  capitalSpend: CapitalSpend,
  committee: Committee,
  params: ChairCapitalParams,
): EffectiveBands {
  const membersById = new Map(committee.members.map((m) => [m.id, m]));
  const result: Record<string, number> = {};
  for (const [id, raw] of Object.entries(capitalSpend)) {
    const m = membersById.get(id);
    if (!m) {
      throw new Error(
        `computeEffectiveBands: capitalSpend key "${id}" does not match any member id in committee "${committee.id}".`,
      );
    }
    if (raw < 0) {
      throw new Error(
        `computeEffectiveBands: capitalSpend for member "${id}" is negative (${raw}). Negative spend is not allowed.`,
      );
    }
    if (raw === 0) continue;
    if (raw > params.max_spend_per_member) {
      throw new Error(
        `computeEffectiveBands: capitalSpend for member "${id}" (${raw}) exceeds max_spend_per_member (${params.max_spend_per_member}). Reduce spend for this member.`,
      );
    }
    const widened = m.compromise_band + raw * params.band_widen_per_unit;
    if (widened > 0.5) {
      throw new Error(
        `computeEffectiveBands: effective compromise_band for member "${id}" would be ${widened.toFixed(4)}, which exceeds the maximum allowed value of 0.5. Reduce the spend or lower the content's compromise_band.`,
      );
    }
    result[id] = widened;
  }
  return result;
}

const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/chair-capital.schema.json");
const FILE_PATH = join(new URL(".", import.meta.url).pathname, "../../content/engine/chair-capital.json");

let _cachedChairCapitalParams: ChairCapitalParams | undefined;

export function loadChairCapitalParams(): ChairCapitalParams {
  if (_cachedChairCapitalParams !== undefined) return _cachedChairCapitalParams;
  try {
    _cachedChairCapitalParams = loadValidatedFile<ChairCapitalParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error("Failed to load chair capital params from content/engine/chair-capital.json", { cause: e });
  }
  return _cachedChairCapitalParams;
}

/** Test-only: clear the module-level params cache. */
export function _resetChairCapitalParamsCache(): void {
  _cachedChairCapitalParams = undefined;
}
