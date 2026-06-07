import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { Committee } from "../content/committees.js";

// SPEC-COMM-7: Chair capital persuasion.
// The Chair has a per-meeting persuasion budget derived from credibility.
// Spending capital on a member widens their compromise band for that meeting only —
// it is never stored in state (use-it-or-lose-it, refreshed each meeting).

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
 * Returns only the members who received spend > 0 (callers merge with the member's
 * original compromise_band via `effectiveBands?.[m.id] ?? m.compromise_band`).
 * Spend is capped at params.max_spend_per_member per member.
 * Pure: does not mutate committee or params.
 */
export function computeEffectiveBands(
  capitalSpend: Readonly<Record<string, number>>,
  committee: Committee,
  params: ChairCapitalParams,
): Readonly<Record<string, number>> {
  const knownIds = new Set(committee.members.map((m) => m.id));
  for (const key of Object.keys(capitalSpend)) {
    if (!knownIds.has(key)) {
      throw new Error(
        `computeEffectiveBands: capitalSpend key "${key}" does not match any member id in committee "${committee.id}".`,
      );
    }
  }
  const result: Record<string, number> = {};
  for (const m of committee.members) {
    const raw = capitalSpend[m.id] ?? 0;
    if (raw < 0) {
      throw new Error(
        `computeEffectiveBands: capitalSpend for member "${m.id}" is negative (${raw}). Negative spend is not allowed.`,
      );
    }
    if (raw === 0) continue;
    const capped = Math.min(raw, params.max_spend_per_member);
    const widened = m.compromise_band + capped * params.band_widen_per_unit;
    if (widened > 0.5) {
      throw new Error(
        `computeEffectiveBands: effective compromise_band for member "${m.id}" would be ${widened.toFixed(4)}, which exceeds the maximum allowed value of 0.5. Reduce the spend or lower the content's compromise_band.`,
      );
    }
    result[m.id] = widened;
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

/** Test-only: clear the module-level cache. */
export function _resetChairCapitalCache(): void {
  _cachedChairCapitalParams = undefined;
}
