// SPEC-DIV-1: per-division function-effects resolver.
// Maps staffed division effectiveness to economic channel outputs.
// Pure: reads state but never mutates it (SPEC-SIM-1). No Math.random() / Date.now().

import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";
import { type Division, staffedFlagKey } from "./institution.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** SPEC-DIV-1: the six economic channel outputs produced by staffed divisions. */
export interface DivisionEffects {
  /** 1 = full fog (no research); lower = better observations. Clamped to (0, 1]. */
  fogFactor: number;
  /** 0 = no transmission softening; higher = less credibility penalty from surprises. */
  transmission: number;
  /** 0 = no fragility visibility; higher = better early-warning signal. */
  fragilityVisibility: number;
  /** 0 = no fragility mitigation; higher = more supervisory decay of bank_fragility. */
  fragilityMitigation: number;
  /** 0 = no crisis severity reduction; higher = smaller unemployment hit per crisis. */
  crisisSeverityReduction: number;
  /** 1 = full external shock exposure; lower = dampened supply-shock sigma. Clamped to (0, 1]. */
  externalShockDamp: number;
  /**
   * SPEC-STAFF-2: signed forecast bias contributed by the Research head's hidden
   * disposition — positive when a hawkish research director skews forecasts toward
   * higher inflation, negative when dovish. 0 when Research is unstaffed.
   */
  forecastBias: number;
}

/** Per-channel maximum contribution when a division director has eff = 1.0. */
export interface ChannelStrengths {
  fog: number;
  transmission: number;
  fragility_visibility: number;
  fragility_mitigation: number;
  crisis_severity: number;
  external_shock: number;
  org: number;
  political: number;
  oversight: number;
}

/** SPEC-DIV-1: content/engine/division-effects.json shape. */
export interface DivisionEffectsParams {
  /** Maximum contribution per channel at eff = 1.0. */
  effect_strength: ChannelStrengths;
  /**
   * Effectiveness below this threshold underperforms: contribution =
   * effect_strength[channel] * (eff - competence_floor), which may be
   * slightly negative when eff < floor.
   */
  competence_floor: number;
  /**
   * SPEC-STAFF-2: how strongly a director's hidden disposition colors their
   * channel. The per-channel adjustment is `disposition_influence * disposition`
   * (disposition ∈ [-1,1]), so the magnitude never exceeds this value — a nudge,
   * never a dominator of the skill-based effectiveness.
   */
  disposition_influence: number;
}

// ---------------------------------------------------------------------------
// Content loader
// ---------------------------------------------------------------------------

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/division-effects.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/division-effects.json",
);

let _cachedParams: DivisionEffectsParams | undefined;

/**
 * Load and validate content/engine/division-effects.json.
 * Result is module-cached after the first successful call.
 */
export function loadDivisionEffectsParams(): DivisionEffectsParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<DivisionEffectsParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error(
      "Failed to load division-effects params from content/engine/division-effects.json",
      { cause: e },
    );
  }
  return _cachedParams;
}

/** Test-only: clear the module-level params cache. */
export function _resetDivisionEffectsParamsCache(): void {
  _cachedParams = undefined;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Smallest positive value fogFactor and externalShockDamp are clamped to. */
const FLOOR_POSITIVE = 0.01;

/**
 * Compute a single division's contribution to its channel.
 *
 * When eff >= competence_floor the contribution is:
 *   effect_strength[channel] * eff
 *
 * When eff < competence_floor the director underperforms; contribution is:
 *   effect_strength[channel] * (eff - competence_floor)
 * which may be slightly negative — modelling a poorly-fit hire that creates
 * marginal friction rather than improvement.
 */
function channelContribution(
  strength: number,
  eff: number,
  floor: number,
): number {
  if (eff >= floor) {
    return strength * eff;
  }
  // Below floor: reduced/slightly-negative contribution.
  return strength * (eff - floor);
}

// ---------------------------------------------------------------------------
// SPEC-DIV-1: main resolver
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate economic channel outputs from all staffed divisions.
 *
 * Identity when nothing is staffed:
 *   { fogFactor:1, transmission:0, fragilityVisibility:0,
 *     fragilityMitigation:0, crisisSeverityReduction:0, externalShockDamp:1 }
 *
 * For each division in `catalog` whose `staffed.<id>` flag is true:
 *   - reads state.vars["staff.<id>.eff"] (default 0 when absent)
 *   - computes channelContribution(effect_strength[channel], eff, competence_floor)
 *   - accumulates into the matching output field
 *
 * fogFactor  = clamp(1 − Σfog_contributions,       FLOOR_POSITIVE, 1)
 * externalShockDamp = clamp(1 − Σshock_contributions, FLOOR_POSITIVE, 1)
 * Additive outputs (transmission, fragilityVisibility, etc.) are floored at 0.
 *
 * Pure: never mutates state (SPEC-SIM-1).
 */
export function divisionEffects(
  state: GameState,
  catalog: Division[],
  params: DivisionEffectsParams,
): DivisionEffects {
  const { effect_strength, competence_floor, disposition_influence } = params;

  let fogSum = 0;
  let transmissionSum = 0;
  let fragilityVisibilitySum = 0;
  let fragilityMitigationSum = 0;
  let crisisSeveritySum = 0;
  let externalShockSum = 0;
  let forecastBiasSum = 0;

  for (const division of catalog) {
    if (!state.flags[staffedFlagKey(division.id)]) continue;

    const eff = state.vars[`staff.${division.id}.eff`] ?? 0;
    // SPEC-STAFF-2: the hidden disposition (hawk +1 … dove −1) nudges this division's
    // channel by at most `disposition_influence`. A nudge, never a dominator.
    const disp = state.vars[`staff.${division.id}.disposition`] ?? 0;
    const dispNudge = disposition_influence * disp;

    switch (division.channel) {
      case "fog":
        fogSum += channelContribution(effect_strength.fog, eff, competence_floor);
        // A hawkish research head skews forecasts toward higher inflation; dovish, lower.
        forecastBiasSum += dispNudge;
        break;
      case "transmission":
        transmissionSum += channelContribution(effect_strength.transmission, eff, competence_floor);
        break;
      case "fragility_visibility":
        fragilityVisibilitySum += channelContribution(effect_strength.fragility_visibility, eff, competence_floor);
        // A hawkish financial-stability head is more vigilant — better risk visibility.
        fragilityVisibilitySum += dispNudge;
        break;
      case "fragility_mitigation":
        fragilityMitigationSum += channelContribution(effect_strength.fragility_mitigation, eff, competence_floor);
        // A hawkish supervision head supervises harder; a dovish one is lighter-touch.
        fragilityMitigationSum += dispNudge;
        break;
      case "crisis_severity":
        crisisSeveritySum += channelContribution(effect_strength.crisis_severity, eff, competence_floor);
        break;
      case "external_shock":
        externalShockSum += channelContribution(effect_strength.external_shock, eff, competence_floor);
        break;
      case "org":
      case "political":
      case "oversight":
        // Informational channels — tracked for future use, do not feed primary outputs.
        break;
    }
  }

  // fogFactor and externalShockDamp use the complement-of-sum pattern; clamp to (0, 1].
  const fogFactor = Math.min(1, Math.max(FLOOR_POSITIVE, 1 - fogSum));
  const externalShockDamp = Math.min(1, Math.max(FLOOR_POSITIVE, 1 - externalShockSum));

  // Additive outputs: floor at 0 so a slightly-negative contribution from a
  // poorly-fit hire doesn't produce a nonsensical negative readout.
  const transmission = Math.max(0, transmissionSum);
  const fragilityVisibility = Math.max(0, fragilityVisibilitySum);
  const fragilityMitigation = Math.max(0, fragilityMitigationSum);
  const crisisSeverityReduction = Math.max(0, crisisSeveritySum);

  return {
    fogFactor,
    transmission,
    fragilityVisibility: Math.max(0, fragilityVisibility),
    fragilityMitigation,
    crisisSeverityReduction,
    externalShockDamp,
    // SPEC-STAFF-2: signed — a hawkish research head biases forecasts up, dovish down.
    forecastBias: forecastBiasSum,
  };
}
