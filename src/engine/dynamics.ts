// SPEC-SIM-5 / SPEC-CRED-4 / SPEC-CRED-6 / SPEC-CRED-7: the monthly macro step.
//
// A single simultaneous update: inflation, unemployment, expectations_anchor, and
// credibility are all computed from the PRIOR month's vars, so the step is
// order-independent and matches the calibration harness (SPEC-CAL-2).
//
// The transmission is real-rate based: the policy rate bites on the economy only
// through the *real* rate (nominal minus expected inflation). In 1979 an 11% nominal
// rate against 11% expected inflation is ~0% real and barely restrictive; Volcker's
// 19% nominal against falling expectations was deeply restrictive. That real-rate gap
// drives a recession (unemployment up), which pulls inflation down via the Phillips
// curve, while sustained progress toward the mandate rebuilds credibility, which
// re-anchors expectations — historically about half the disinflation.
import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";
import { CRED_MIN, CRED_MAX } from "./credibility.js";

export interface MacroDynamicsParams {
  // --- inflation & unemployment (content/engine/dynamics.json) ---
  /** Weight on lagged inflation in the Phillips curve (0 = none, 1 = full momentum). */
  inflation_persistence: number;
  /** How much an unemployment gap below natural pushes inflation down per month. */
  phillips_slope: number;
  /** Long-run equilibrium unemployment (NAIRU). */
  unemployment_natural_rate: number;
  /** Real neutral rate r*: the real policy rate at which the economy is neither tightening nor easing. */
  real_neutral_rate: number;
  /** Okun sensitivity: extra equilibrium unemployment per unit of real-rate gap. */
  okun_coefficient: number;
  /** Speed unemployment mean-reverts toward its policy-implied equilibrium each month. */
  unemployment_adjustment_speed: number;

  // --- expectations & credibility (content/engine/credibility.json) ---
  /** Long-run inflation target. */
  target_inflation: number;
  /** Dual-mandate unemployment target (for the mission-distance credibility update). */
  unemployment_target: number;
  /** How fast expectations track realized inflation when credibility is low (adaptive). */
  expectations_adaptivity: number;
  /** How fast expectations are pulled to target when credibility is high (re-anchoring). */
  expectations_anchor_pull: number;
  /** Credibility gained per unit reduction in dual-mandate distance (mission progress). */
  credibility_mission_gain: number;
  /** Weight on the unemployment gap in the dual-mandate distance (<1 → inflation dominates). */
  credibility_unemployment_weight: number;
  /** Credibility below this counts as a month "below anchor" for the persistent-memory stat. */
  anchor_threshold: number;
  /** SPEC-CRED-7: credibility above this threshold incurs a monthly drain (prevents endgame pin). */
  credibility_soft_ceiling: number;
  /** SPEC-CRED-7: monthly drain per unit of credibility above credibility_soft_ceiling. */
  credibility_drain_rate: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// SPEC-SIM-5: all inputs except months_below_anchor are in Session.REQUIRED_VARS, so
// loadScenario's MissingVarsError catches any omission at scenario load time. Trust that
// boundary guard rather than injecting directional `?? 0` defaults. months_below_anchor is
// an informational counter that may legitimately be absent in hand-built test states, so it
// alone defaults to 0.
export function applyMacroDynamics(state: GameState, params: MacroDynamicsParams): GameState {
  const inflation = state.vars.inflation as number;
  const unemployment = state.vars.unemployment as number;
  const policyRate = state.vars.policy_rate as number;
  const anchor = state.vars.expectations_anchor as number;
  const credibility = state.vars.credibility as number;
  const monthsBelow = state.vars.months_below_anchor ?? 0;

  // Real-rate transmission.
  const realRate = policyRate - anchor;
  const realGap = realRate - params.real_neutral_rate;

  // Use lagged output_gap if available (SPEC-LAG-1), else fall back to the immediate realGap.
  const rawLaggedGap = state.vars.output_gap;
  if (rawLaggedGap !== undefined && !Number.isFinite(rawLaggedGap)) {
    throw new Error(`applyMacroDynamics: output_gap is not finite (${rawLaggedGap})`);
  }
  const laggedGap = rawLaggedGap ?? realGap;

  // Unemployment mean-reverts toward a policy-implied equilibrium.
  const uEquilibrium = params.unemployment_natural_rate + params.okun_coefficient * laggedGap;
  const newUnemployment = clamp(
    unemployment + params.unemployment_adjustment_speed * (uEquilibrium - unemployment),
    0,
    1,
  );

  // Expectations-augmented Phillips curve with momentum (slack measured on PRIOR unemployment).
  const slack = unemployment - params.unemployment_natural_rate;
  const newInflation = Math.max(
    0,
    params.inflation_persistence * inflation +
      (1 - params.inflation_persistence) * anchor -
      params.phillips_slope * slack,
  );

  // Expectations: adaptive when credibility is low, target-anchored when high (SPEC-CRED-4).
  // Floored at 0 to match inflation/unemployment — expectations can't go negative, and the floor
  // makes the invariant explicit so a future param change can't produce a negative real rate.
  const c = Math.min(credibility / CRED_MAX, 1);
  const newAnchor = Math.max(
    0,
    anchor +
      params.expectations_adaptivity * (1 - c) * (inflation - anchor) -
      params.expectations_anchor_pull * c * (anchor - params.target_inflation),
  );

  // Mission-tied credibility: rises as the economy moves toward the dual-mandate target,
  // falls as it moves away (SPEC-CRED-6).
  const distance = (i: number, u: number): number =>
    Math.abs(i - params.target_inflation) +
    params.credibility_unemployment_weight * Math.abs(u - params.unemployment_target);
  const distBefore = distance(inflation, unemployment);
  const distAfter = distance(newInflation, newUnemployment);
  // Soft-ceiling drain: prevents credibility from pinning at cred_max in a resolved-endgame
  // scenario where mission progress tapers to zero (SPEC-CRED-7).
  const softCeilingDrain =
    params.credibility_drain_rate * Math.max(0, credibility - params.credibility_soft_ceiling);
  const newCredibility = clamp(
    credibility + params.credibility_mission_gain * (distBefore - distAfter) - softCeilingDrain,
    CRED_MIN,
    CRED_MAX,
  );

  // Persistent-memory counter: increments while below threshold, frozen (not reset) on recovery.
  const newMonthsBelow =
    credibility < params.anchor_threshold ? monthsBelow + 1 : monthsBelow;

  return {
    ...state,
    vars: {
      ...state.vars,
      inflation: newInflation,
      unemployment: newUnemployment,
      expectations_anchor: newAnchor,
      credibility: newCredibility,
      months_below_anchor: newMonthsBelow,
    },
  };
}

const DYNAMICS_SCHEMA = join(new URL(".", import.meta.url).pathname, "../../schemas/dynamics.schema.json");
const DYNAMICS_FILE = join(new URL(".", import.meta.url).pathname, "../../content/engine/dynamics.json");
const CREDIBILITY_SCHEMA = join(new URL(".", import.meta.url).pathname, "../../schemas/credibility.schema.json");
const CREDIBILITY_FILE = join(new URL(".", import.meta.url).pathname, "../../content/engine/credibility.json");

type DynamicsFile = Pick<
  MacroDynamicsParams,
  | "inflation_persistence"
  | "phillips_slope"
  | "unemployment_natural_rate"
  | "real_neutral_rate"
  | "okun_coefficient"
  | "unemployment_adjustment_speed"
>;
type CredibilityFile = Pick<
  MacroDynamicsParams,
  | "target_inflation"
  | "unemployment_target"
  | "expectations_adaptivity"
  | "expectations_anchor_pull"
  | "credibility_mission_gain"
  | "credibility_unemployment_weight"
  | "anchor_threshold"
  | "credibility_soft_ceiling"
  | "credibility_drain_rate"
>;

// Exhaustiveness: DynamicsFile & CredibilityFile must cover all of MacroDynamicsParams.
// A field added to the interface but omitted from both Picks will fail here (TS2322), not
// silently produce undefined at runtime.
// NOTE: only catches omitted *required* fields; new optional fields in
// MacroDynamicsParams won't trigger this — add them to a Pick explicitly.
type _Exhaustive = DynamicsFile & CredibilityFile extends MacroDynamicsParams ? true : never;
const _check: _Exhaustive = true; void _check;

let _cachedParams: MacroDynamicsParams | undefined;

/** Lazy-loaded, cached merge of the macro (dynamics.json) and expectations/credibility
 *  (credibility.json) params — the full parameter set `applyMacroDynamics` consumes. */
export function loadDynamicsParams(): MacroDynamicsParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    const dyn = loadValidatedFile<DynamicsFile>(DYNAMICS_SCHEMA, DYNAMICS_FILE);
    const cred = loadValidatedFile<CredibilityFile>(CREDIBILITY_SCHEMA, CREDIBILITY_FILE);
    const candidate = { ...dyn, ...cred };
    if (candidate.credibility_soft_ceiling >= CRED_MAX) {
      throw new Error(
        `credibility_soft_ceiling (${candidate.credibility_soft_ceiling}) must be strictly less than cred_max (${CRED_MAX}) for the SPEC-CRED-7 drain to fire at the cap`,
      );
    }
    if (candidate.credibility_soft_ceiling <= CRED_MIN) {
      throw new Error(
        `credibility_soft_ceiling (${candidate.credibility_soft_ceiling}) must be strictly greater than cred_min (${CRED_MIN}) — a value at or below cred_min applies the drain at minimum credibility`,
      );
    }
    if (candidate.credibility_drain_rate <= 0) {
      throw new Error(
        `credibility_drain_rate (${candidate.credibility_drain_rate}) must be strictly positive — zero silently disables the SPEC-CRED-7 soft-ceiling drain`,
      );
    }
    if (candidate.credibility_drain_rate >= 1) {
      throw new Error(
        `credibility_drain_rate (${candidate.credibility_drain_rate}) must be strictly less than 1 — a value ≥ 1 breaks the 1-(1-r)^(1/n) cadence scaling (SPEC-SIM-6)`,
      );
    }
    _cachedParams = candidate;
  } catch (e) {
    throw new Error(
      `Failed to load macro dynamics params: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  return _cachedParams!;
}

/** Test-only: clear the cache so the next loadDynamicsParams() re-reads and re-validates. */
export function _resetDynamicsParamsCache(): void {
  _cachedParams = undefined;
}
