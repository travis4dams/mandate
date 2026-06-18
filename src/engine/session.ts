import { join } from "node:path";
import { loadScenario } from "../content/scenarios.js";
import { loadReplay } from "../content/replays.js";
import { loadCommittee } from "../content/committees.js";
import { loadValidatedFile } from "../content/loader.js";
import { tick } from "./clock.js";
import { previewVote, loadCommitteeParams } from "./fomc.js";
import { computeChairCapital, computeEffectiveBands, loadChairCapitalParams, updateConsensusCapital } from "./chair-capital.js";
import type { CapitalSpend } from "./chair-capital.js";
import { applyIntermeetingDrift } from "./stance.js";
import { loadTraitCatalog } from "../content/traits.js";
import { applyMeetingOutcome, getCredibility } from "./credibility.js";
import { applyMacroDynamics, loadDynamicsParams } from "./dynamics.js";
import { loadClockCadenceParams, scaleParamsForTick } from "./cadence.js";
import { applyRateToOutputGap, loadLagParams } from "./lags.js";
import { applyTermStructure, loadTermStructureParams } from "./term-structure.js";
import { applyProductivityDrift, loadProductivityParams } from "./productivity.js";
import { applyFedFinances, loadFedFinancesParams } from "./fed-finances.js";
import { applyFragilityDynamics, loadFragilityParams } from "./fragility.js";
import { crisisProbability, applyFinancialCrisis, loadCrisisParams } from "./crisis.js";
import { applyCongressionalPressure, loadCongressParams } from "./congress.js";
import { divisionEffects, loadDivisionEffectsParams, type DivisionEffects } from "./division-effects.js";
import { applyCultureDrift, loadCultureParams } from "./culture.js";
import { onTarget, loadMandateParams } from "./mandate.js";
import { adoptDoctrine as _adoptDoctrine, abandonDoctrine as _abandonDoctrine, doctrineFlagKey } from "./doctrine.js";
import { loadDoctrineCatalog, getDoctrine, HOOK_HANDLERS, type DoctrineEntry } from "../content/doctrines.js";
import { applySupplyShock, loadShocksParams } from "./shocks.js";
import {
  applyInstitutionDynamics,
  loadInstitutionParams,
  loadDivisionCatalog,
  generateCandidates,
  hireStaff,
  fireStaff,
  institutionInvestment,
  staffedFlagKey,
  type Division,
  type Candidate,
} from "./institution.js";
import { loadEventCatalog, type GameEvent } from "../content/events.js";
import { eligibleEvents, eventFireProbability } from "./event-engine.js";
import { applyEffects } from "../content/effects.js";
import { nameForId, loadNamePools } from "./names.js";
import {
  termProgress,
  evaluateReappointment,
  computeLegacyScore,
  loadLegacyParams,
} from "./legacy.js";
import { mulberry32, fnv1a32, type SeededRng } from "./rng.js";
import { observe } from "./fog.js";
import type { GameState, GameStateSnapshot } from "./state.js";
import type { FomcVote, MemberVotePreview } from "./fomc.js";
import type { Replay } from "../content/replays.js";

// SPEC-SESSION-0: skeleton Session façade.
// Wraps tick + vote + applyMeetingOutcome with identity-stable getters and a subscribe protocol.

// SPEC-SESSION-1: FOMC meeting schedule gate.
const MEETING_SCHEDULE_SCHEMA = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/meeting-schedule.schema.json"
);
const MEETING_SCHEDULE_FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/meeting-schedule.json"
);

interface MeetingSchedule {
  meeting_months: readonly number[];
}

// Eager module-level load mirrors clock.ts: any malformed meeting-schedule.json
// fails fast at boot rather than the first proposeRate() call.
const MEETING_SCHEDULE: MeetingSchedule = loadValidatedFile<MeetingSchedule>(
  MEETING_SCHEDULE_SCHEMA,
  MEETING_SCHEDULE_FILE,
);

// SPEC-GUIDE-1: GuidanceParams loader and stance multiplier.
interface GuidanceParams {
  hawkish_multiplier: number;
  neutral_multiplier: number;
  dovish_multiplier: number;
  surprise_tolerance: number;
}
const GUIDANCE_SCHEMA = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/guidance.schema.json",
);
const GUIDANCE_FILE = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/guidance.json",
);
let _cachedGuidanceParams: GuidanceParams | undefined;
function loadGuidanceParams(): GuidanceParams {
  if (_cachedGuidanceParams !== undefined) return _cachedGuidanceParams;
  try {
    _cachedGuidanceParams = loadValidatedFile<GuidanceParams>(GUIDANCE_SCHEMA, GUIDANCE_FILE);
  } catch (e) {
    throw new Error(
      "Failed to load guidance params from content/engine/guidance.json",
      { cause: e },
    );
  }
  return _cachedGuidanceParams;
}

function stanceMultiplier(stance: ForwardGuidanceStance, p: GuidanceParams): number {
  switch (stance) {
    case "hawkish":
      return p.hawkish_multiplier;
    case "dovish":
      return p.dovish_multiplier;
    case "neutral":
      return p.neutral_multiplier;
    default: {
      const _exhaustive: never = stance;
      throw new Error(`stanceMultiplier: unknown stance "${String(_exhaustive)}".`);
    }
  }
}

export class NotMeetingMonthError extends Error {
  constructor(public readonly date: string) {
    super(`Session.proposeRate: ${date} is not a scheduled FOMC meeting month.`);
    this.name = "NotMeetingMonthError";
  }
}

// SPEC-GUIDE-1: The three forward-guidance stances the Chair can adopt.
// The stance scales the expectations re-anchoring pull (expectations_anchor_pull) via stanceMultiplier().
export type ForwardGuidanceStance = "hawkish" | "dovish" | "neutral";

// SPEC-GUIDE-2: markets are surprised when the decided rate's move contradicts the guided
// direction. A hawkish stance signals tightening, so an easing surprises; dovish signals easing,
// so a tightening surprises; neutral makes no directional commitment, so any move beyond
// `tolerance` (in either direction) surprises. A move within `tolerance` of the current rate is
// consistent with any stance. Strict inequalities: a move of exactly `tolerance` never surprises.
export function marketsSurprised(
  stance: ForwardGuidanceStance,
  currentRate: number,
  decidedRate: number,
  tolerance: number,
): boolean {
  const delta = decidedRate - currentRate;
  switch (stance) {
    case "hawkish":
      return delta < -tolerance;
    case "dovish":
      return delta > tolerance;
    case "neutral":
      return Math.abs(delta) > tolerance;
    default: {
      const _exhaustive: never = stance;
      throw new Error(`marketsSurprised: unknown stance "${String(_exhaustive)}".`);
    }
  }
}

// Required vars that every scenario must supply for the engine to function.
const REQUIRED_VARS = ["policy_rate", "inflation", "unemployment", "credibility", "expectations_anchor"] as const;

/**
 * SPEC-FEED-1: one entry in the Chair's activity log — a dated record of a notable
 * happening and its effect on the economy. Strings are localization keys (no display
 * text in engine code); the UI formats `deltas` into readable lines.
 */
export interface ActivityEntry {
  date: string;
  /** Localization key for the headline. */
  titleKey: string;
  /** Vars that moved as a result, with signed deltas (for the "what changed" line). */
  deltas: { var: string; delta: number }[];
}

// Vars worth surfacing in the activity feed when they move (others are internal).
const FEED_VARS = [
  "credibility", "political_capital", "independence", "bank_fragility",
  "inflation", "unemployment", "operating_budget", "output_gap",
] as const;

// Keep the activity log bounded — the Chair sees recent history, not all of it.
const ACTIVITY_LOG_CAP = 60;

/**
 * A pure Session façade that wraps the slice-1 engine functions.
 *
 * **React-render purity (SPEC-SESSION-0 contract):**
 * Mutators (`advance`, `proposeRate`, `reset`, `setForwardGuidanceStance`) MUST NOT
 * be called from React render code — only from event handlers, effects, or external
 * schedulers. A mid-render mutation flips the cached snapshot reference during React 18
 * concurrent commit, causing tearing.
 *
 * **Subscribe protocol:**
 * Call `useSyncExternalStore(session.subscribe.bind(session), () => session.current)`
 * in a React hook. The `subscribe` method returns an unsubscribe function.
 */
export class Session {
  // Private mutable engine state (current head).
  private _state: GameState;

  // Append-only session trajectory — full game history independent of state.history ring.
  private _trajectoryInternal: GameStateSnapshot[];

  // Referentially-stable cached values; rebuilt only on mutation.
  private _currentCache: GameStateSnapshot;
  private _trajectoryCache: readonly GameStateSnapshot[];

  // Replay to apply actions from (null when constructed from scenario only).
  private readonly _replay: Replay | null;

  // Committee id used by proposeRate; passed as a required factory argument.
  private readonly _committeeId: string;

  // SPEC-GUIDE-1: stored stance; scales `expectations_anchor_pull` passed to `applyMacroDynamics` via stanceMultiplier().
  private _stance: ForwardGuidanceStance = "neutral";

  // Subscriber set for the subscribe/unsubscribe protocol.
  private readonly _listeners: Set<() => void> = new Set();

  // Snapshot of the initial state so reset() can restore it without re-loading content.
  private readonly _initialState: GameState;

  // SPEC-SHOCK-1: seeded RNG for supply shocks; initialized from the seed parameter.
  // All randomness flows through this instance (SPEC-SIM-1 — never Math.random()).
  // _seed is stored so reset() can reinitialise _rng to the same starting state (SPEC-SIM-1).
  private readonly _seed: number;
  private _rng: SeededRng;

  // SPEC-EVENT-1/2: escalations the player must resolve, and the set of fires_once
  // events already spent. Session-level (not in state.vars) — rebuilt by reset().
  private _pendingEscalations: GameEvent[] = [];
  private _firedOnce: Set<string> = new Set();

  // SPEC-FEED-1: the Chair's activity log (most-recent-first via activityLog()).
  private _activityLog: ActivityEntry[] = [];

  // The `seed` parameter initialises `_rng` via mulberry32 (SPEC-SHOCK-1 / SPEC-SIM-1).
  private constructor(initialState: GameState, seed: number, replay: Replay | null, committeeId: string) {
    this._replay = replay;
    this._committeeId = committeeId;
    // SPEC-INST-1: seed the institutional resource vars from content defaults when a
    // scenario doesn't author them, so the state var, the getters, and hireStaff (which
    // reads state.vars directly) all agree from month 0 — and reset() restores them.
    // Build a fresh vars copy first: never mutate the caller-provided initialState
    // (engine purity — the caller's object must be left untouched).
    const instParams = loadInstitutionParams();
    const seededVars = { ...initialState.vars };
    if (seededVars.operating_budget === undefined) {
      seededVars.operating_budget = instParams.initial_operating_budget;
    }
    if (seededVars.political_capital === undefined) {
      seededVars.political_capital = instParams.initial_political_capital;
    }
    const seededInitial: GameState = { ...initialState, vars: seededVars };
    this._initialState = seededInitial;
    this._seed = seed;
    this._rng = mulberry32(seed);
    this._state = { ...seededInitial, vars: { ...seededVars }, flags: { ...initialState.flags }, history: [] };

    const snapshot = Session._snapshotOf(this._state);
    this._trajectoryInternal = [snapshot];
    this._currentCache = snapshot;
    this._trajectoryCache = Object.freeze([snapshot]);
  }

  /**
   * Construct a Session from a scenario content file.
   * seed initialises the mulberry32 RNG that drives per-month supply shocks in advance() (SPEC-SHOCK-1 / SPEC-SIM-1).
   * committeeId identifies the FOMC committee used by proposeRate (e.g. "comm.fomc_1979").
   * opts.varDeltas: optional additive adjustments applied to the scenario's
   * starting vars before play begins (e.g. confirmation-hearing state
   * modifiers). Each key must name a var present in the scenario; deltas must
   * be finite. Throws otherwise.
   */
  static fromScenario(
    scenarioId: string,
    seed: number,
    committeeId: string,
    opts?: { varDeltas?: Readonly<Record<string, number>> },
  ): Session {
    const state = loadScenario(scenarioId, [...REQUIRED_VARS]);
    if (opts?.varDeltas !== undefined) {
      for (const [key, delta] of Object.entries(opts.varDeltas)) {
        const base = state.vars[key];
        if (base === undefined) {
          throw new Error(
            `Session.fromScenario: varDeltas target "${key}" is not a var in scenario "${scenarioId}"`,
          );
        }
        if (!Number.isFinite(delta)) {
          throw new Error(`Session.fromScenario: varDeltas["${key}"] is not finite`);
        }
        state.vars[key] = base + delta;
      }
    }
    return new Session(state, seed, null, committeeId);
  }

  /**
   * Construct a Session from a replay strategy.
   * The replay's actions are applied inside `advance()` as each month plays forward.
   * committeeId identifies the FOMC committee used by proposeRate (e.g. "comm.fomc_1979").
   */
  static fromReplay(replayId: string, seed: number, committeeId: string): Session {
    const replay = loadReplay(replayId);
    const state = loadScenario(replay.scenario, [...REQUIRED_VARS]);
    return new Session(state, seed, replay, committeeId);
  }

  // --- Getters (identity-stable) ---

  /**
   * The current game state snapshot. Referentially stable across no-op reads.
   * Only changes reference after a mutator call.
   */
  get current(): GameStateSnapshot {
    return this._currentCache;
  }

  /**
   * The full session trajectory (append-only). Frozen array — callers must not mutate.
   * Referentially stable across no-op reads; changes reference after every mutation.
   */
  get trajectory(): readonly GameStateSnapshot[] {
    return this._trajectoryCache;
  }

  // --- SPEC-SESSION-1: FOMC schedule gate ---

  /**
   * Returns true iff the given date's month falls in the loaded meeting schedule.
   * When `date` is omitted, uses `this._state.date`. Parses the month via string
   * slicing — no `new Date(...)` constructor (engine purity).
   *
   * @param date Optional explicit YYYY-MM date. The format is strict: non-conforming
   *   strings throw rather than silently returning false, which prevents a typo like
   *   `"1979-8"` (no zero-pad) from misclassifying a real meeting month.
   * @throws {Error} when `date` is supplied but does not match `^\d{4}-\d{2}$`.
   */
  isMeetingMonth(date?: string): boolean {
    const d = date ?? this._state.date;
    if (!/^\d{4}-\d{2}$/.test(d)) {
      throw new Error(`Session.isMeetingMonth: expected YYYY-MM, got "${d}".`);
    }
    const month = parseInt(d.slice(5, 7), 10);
    return MEETING_SCHEDULE.meeting_months.includes(month);
  }

  // --- Mutators ---

  /**
   * Advance the session by `months` months.
   * For each month: applies any matching replay action, calls tick(), then calls
   * applyMacroDynamics() to evolve all macro variables (inflation, unemployment,
   * expectations_anchor, output_gap, etc.) with the forward-guidance stance applied,
   * then applyIntermeetingDrift() (SPEC-COMM-6), then applyTermStructure().
   * @throws {Error} if months is not a positive integer.
   */
  advance(months: number): void {
    if (!Number.isInteger(months) || months <= 0) {
      throw new Error(`Session.advance: months must be a positive integer, got ${months}.`);
    }

    // Checkpoint for mid-loop rollback: capture the current state reference and RNG position.
    // Safe because all tick/spiral/dynamics functions are pure (CLAUDE.md) — they
    // return new GameState objects and never mutate in place, so this ref stays valid.
    // The RNG checkpoint is required for SPEC-SIM-1: if the loop throws mid-way, draws
    // already consumed by applySupplyShock must be rolled back so the next advance() call
    // sees the same RNG stream as if the failed attempt never happened.
    // _currentCache / _trajectoryCache are snapshotted so a double _rebuildCaches failure
    // can be force-restored from the known-good checkpoint rather than left in a torn state.
    // _pendingEscalations / _activityLog are length-checkpointed because both are mutated
    // inside the try block (event pushes + crisis log entry) and must be truncated on rollback.
    // _firedOnce is not mutated inside advance() today, but is copied defensively so a future
    // fires_once handler added to the loop cannot silently bypass rollback.
    const checkpointState = this._state;
    const checkpointCache = this._currentCache;
    const checkpointTrajectoryCache = this._trajectoryCache;
    const checkpointTrajectoryLength = this._trajectoryInternal.length;
    const checkpointEscalationsLength = this._pendingEscalations.length;
    const checkpointActivityLength = this._activityLog.length;
    const checkpointFiredOnce = new Set(this._firedOnce);
    const checkpointRng = this._rng.snapshot();

    // SPEC-GUIDE-1 / SPEC-SIM-5 / SPEC-SIM-6: loaders + effectiveParams are loop-invariant.
    // The stance multiplier scales expectations_anchor_pull before tick scaling, so hawkish/
    // dovish guidance and sub-monthly cadence compose correctly.
    const guidanceP = loadGuidanceParams();
    const dynamicsParams = loadDynamicsParams();
    // SPEC-LAG-1: lag params are a cached singleton; hoisted for the same reason.
    const lagParams = loadLagParams();
    // SPEC-SHOCK-1: shocks params are a cached singleton; hoisted for the same reason.
    const shocksParams = loadShocksParams();
    // SPEC-TERM-1: term-structure params are a cached singleton; hoisted for the same reason.
    const termStructureParams = loadTermStructureParams();
    // SPEC-PROD-1: productivity params are a cached singleton; hoisted for the same reason.
    const productivityParams = loadProductivityParams();
    // SPEC-FED-1: fed-finances params are a cached singleton; hoisted for the same reason.
    const fedFinancesParams = loadFedFinancesParams();
    // SPEC-INST-1: institution params are a cached singleton; hoisted for the same reason.
    const institutionParams = loadInstitutionParams();
    // PR A: institution-depth params + the division catalog are loop-invariant.
    const fragilityParams = loadFragilityParams();
    const crisisParams = loadCrisisParams();
    const congressParams = loadCongressParams();
    const divisionEffectsParams = loadDivisionEffectsParams();
    const cultureParams = loadCultureParams();
    const divisionCatalog = loadDivisionCatalog();
    // SPEC-EVENT-1: the event catalog is loop-invariant.
    const eventCatalog = loadEventCatalog();
    // SPEC-LEGACY-1: mandate params are loop-invariant (cached singleton).
    const mandateParams = loadMandateParams();
    const effectiveParams = {
      ...dynamicsParams,
      expectations_anchor_pull:
        dynamicsParams.expectations_anchor_pull * stanceMultiplier(this._stance, guidanceP),
    };
    // SPEC-COMM-6: hoist loop-invariant loads to avoid per-month disk reads.
    // loadCommitteeParams() is memoized; loadCommittee() scans the content directory
    // once per advance() call. Both are outside the try block intentionally — if either
    // throws before the loop starts, this._state is unchanged and no rollback is needed.
    const committee = loadCommittee(this._committeeId);
    const committeeParams = loadCommitteeParams();

    // SPEC-SIM-6: scale monthly params down to per-tick params. Identity when ticks_per_month=1.
    const ticksPerMonth = loadClockCadenceParams().ticks_per_month;
    const scaledParams = scaleParamsForTick(effectiveParams, ticksPerMonth);

    try {
      for (let i = 0; i < months; i++) {
        if (this._replay !== null) {
          const action = this._replay.actions.find((a) => a.date === this._state.date);
          if (action !== undefined) {
            this._state = {
              ...this._state,
              vars: { ...this._state.vars, policy_rate: action.policy_rate },
            };
          }
        }

        this._state = tick(this._state, 1);

        // SPEC-DIV-1: resolve what the staffed divisions are doing this month (stable
        // within the month — staffing only changes via hire()). Used to damp external
        // shocks now and to mitigate fragility later in the step.
        const effects: DivisionEffects = divisionEffects(this._state, divisionCatalog, divisionEffectsParams);

        // SPEC-LAG-1: update output_gap from trajectory before applying macro dynamics.
        // Ordering invariant: applyRateToOutputGap reads _trajectoryInternal BEFORE the new
        // snapshot is pushed — this month's rate enters the lag kernel next month.
        this._state = applyRateToOutputGap(
          this._state,
          this._trajectoryInternal,
          lagParams,
          dynamicsParams.real_neutral_rate,
        );

        if (ticksPerMonth === 1) {
          // Monthly path (fast): single applyMacroDynamics call with unscaled params.
          this._state = applyMacroDynamics(this._state, scaledParams);
        } else {
          // SPEC-SIM-6 sub-monthly path: run n scaled sub-ticks, then overwrite
          // months_below_anchor with the calendar-month-correct value.
          //
          // tick() is var-pure (clock.ts copies vars verbatim, only advancing the date).
          // Capturing credibility and months_below_anchor here is equivalent to
          // reading them at pre-tick start-of-month credibility.
          const monthsBelowBefore = (this._state.vars.months_below_anchor ?? 0) as number;
          const credRaw = this._state.vars.credibility;
          if (typeof credRaw !== "number" || !Number.isFinite(credRaw)) {
            throw new Error(
              `Session.advance: credibility var is missing or non-finite at ${this._state.date} (got ${String(credRaw)}). Ensure the scenario sets all REQUIRED_VARS.`,
            );
          }
          const credAtMonthStart = credRaw;

          for (let t = 0; t < ticksPerMonth; t++) {
            try {
              this._state = applyMacroDynamics(this._state, scaledParams);
            } catch (subErr) {
              throw new Error(
                `Session.advance: applyMacroDynamics failed at ${this._state.date} sub-tick ${t + 1}/${ticksPerMonth}`,
                { cause: subErr },
              );
            }
          }

          // months_below_anchor counts calendar months, not sub-ticks. Overwrite with the
          // calendar-month-correct value (0 or 1 increment based on start-of-month credibility).
          // Using effectiveParams.anchor_threshold makes explicit that anchor_threshold is not
          // a per-tick quantity — scaleParamsForTick does not change it.
          const correctMonthsBelow =
            credAtMonthStart < effectiveParams.anchor_threshold
              ? monthsBelowBefore + 1
              : monthsBelowBefore;
          this._state = {
            ...this._state,
            vars: { ...this._state.vars, months_below_anchor: correctMonthsBelow },
          };
        }

        // SPEC-SHOCK-1: apply seeded supply shock after macro dynamics each month.
        // SPEC-DIV-1: a staffed International Finance division dampens the supply-shock
        // sigma (externalShockDamp ∈ (0,1]) — fewer/smaller imported shocks.
        const scaledShocks = {
          ...shocksParams,
          supply_shock_sigma: shocksParams.supply_shock_sigma * effects.externalShockDamp,
        };
        this._state = applySupplyShock(this._state, this._rng, scaledShocks);

        // SPEC-COMM-6: evolve per-member stances toward Taylor target each month.
        const prevStateRef = this._state;
        this._state = applyIntermeetingDrift(this._state, committee, committeeParams);
        // applyIntermeetingDrift returns the same reference when required vars are missing.
        // This should never occur in a live session — throw so the rollback above surfaces it.
        if (this._state === prevStateRef) {
          throw new Error(
            `Session.advance: applyIntermeetingDrift skipped at ${this._state.date} — ` +
            `inflation/unemployment/policy_rate is missing or non-finite.`,
          );
        }

        // SPEC-TERM-1: update long_rate via EWMA toward policy_rate, after macro dynamics.
        this._state = applyTermStructure(this._state, termStructureParams);

        // SPEC-FED-1: update portfolio yield, net income, and deferred asset after term structure.
        this._state = applyFedFinances(this._state, fedFinancesParams);

        // SPEC-PROD-1: drift productivity after macro dynamics each month.
        this._state = applyProductivityDrift(this._state, productivityParams);

        // SPEC-INST-1: evolve institution resources (budget growth, political-capital
        // mean-reversion) after macro dynamics each month.
        this._state = applyInstitutionDynamics(this._state, institutionParams);

        // SPEC-CULTURE-1: drift institutional culture toward the staffed cohort (lags + persists).
        this._state = applyCultureDrift(this._state, divisionCatalog, cultureParams);

        // SPEC-FRAG-1: evolve banking fragility. Loose policy + a lax supervisory culture
        // build it; a well-staffed Supervision + Financial Stability shop mitigates it.
        const currRate = this._state.vars.policy_rate as number;
        const expAnchor = (this._state.vars.expectations_anchor ?? 0) as number;
        const realGap = currRate - expAnchor - dynamicsParams.real_neutral_rate;
        const prevSnap = this._trajectoryInternal[this._trajectoryInternal.length - 1];
        const prevRate = (prevSnap?.vars.policy_rate ?? currRate) as number;
        const easingSpeed = prevRate - currRate; // positive when the rate is being cut
        const supervisoryRigor = (this._state.vars["culture.supervisory_rigor"] ?? 0) as number;
        this._state = applyFragilityDynamics(
          this._state,
          {
            realGap,
            easingSpeed,
            supervisoryRigor,
            // Supervision mitigates directly; Financial Stability mitigates via early detection.
            fragilityMitigation: effects.fragilityMitigation + effects.fragilityVisibility,
          },
          fragilityParams,
        );

        // SPEC-CRISIS-1: a seeded Bernoulli draw on fragility can erupt into a crisis.
        // The crisis stream is DERIVED (fnv1a32 over seed+date), not the session supply-shock
        // RNG, so adding crises never perturbs the supply-shock sequence (SPEC-CAL-2 stability).
        const cooldown = (this._state.vars.crisis_cooldown ?? 0) as number;
        if (cooldown > 0) {
          this._state = {
            ...this._state,
            vars: { ...this._state.vars, crisis_cooldown: cooldown - 1 },
            flags: { ...this._state.flags, crisis: false },
          };
        } else {
          const fragility = (this._state.vars.bank_fragility ?? 0) as number;
          const p = crisisProbability(fragility, crisisParams);
          // The Bernoulli threshold draw and applyFinancialCrisis's jitter draws INTENTIONALLY
          // share this one derived stream — the spec does not require them to be independent, and
          // a single stream keeps the crisis path deterministic. Do NOT split into two derived
          // seeds "to decouple" them; that would silently change the crisis trajectory.
          const crisisRng = mulberry32(fnv1a32(`${this._seed}|crisis|${this._state.date}`));
          if (crisisRng() < p) {
            const beforeCrisis = this._snapshotFeedVars();
            this._state = applyFinancialCrisis(this._state, effects.crisisSeverityReduction, crisisParams, crisisRng);
            this._state = {
              ...this._state,
              vars: { ...this._state.vars, crisis_cooldown: crisisParams.cooldown_months },
              flags: { ...this._state.flags, crisis: true },
            };
            // SPEC-FEED-1: a crisis is a headline event with felt macro consequences.
            this._logActivity("ui.feed.crisis", beforeCrisis);
          } else {
            this._state = { ...this._state, flags: { ...this._state.flags, crisis: false } };
          }
        }

        // SPEC-CONGRESS-1: a sustained Fed loss (deferred asset) draws Congressional
        // pressure on political capital and independence.
        this._state = applyCongressionalPressure(this._state, congressParams);

        // SPEC-EVENT-1: surface escalations. For each eligible event, draw a DERIVED seeded
        // RNG keyed by (seed, date, eventId) — never the session supply-shock/crisis streams,
        // so events can't perturb the macro calibration. A fired event joins the pending queue
        // (deduped by id) for the player to resolve via resolveEscalation().
        const pendingIds = new Set(this._pendingEscalations.map((e) => e.id));
        for (const event of eligibleEvents(this._state, eventCatalog, this._firedOnce)) {
          if (pendingIds.has(event.id)) continue;
          const p = eventFireProbability(event, this._state);
          const evRng = mulberry32(fnv1a32(`${this._seed}|event|${this._state.date}|${event.id}`));
          if (evRng() < p) {
            this._pendingEscalations.push(event);
            pendingIds.add(event.id);
          }
        }

        // SPEC-LEGACY-1: accumulate months_on_target — counts calendar months the Chair
        // is on mandate. Placed after all monthly state updates (shocks, crises, congressional
        // pressure) so the fully-settled state for the month determines on-target status.
        // IMPORTANT: months_on_target is an accumulation-only counter managed exclusively
        // here. Content effects (applyEffects, resolveEscalation) must never target this
        // var — doing so would corrupt the running total. resolveEscalation() enforces this
        // at runtime; the event option schema has no enum restriction on target names, so
        // content reviews must also check event option effect targets manually.
        const motRaw = this._state.vars.months_on_target;
        if (motRaw !== undefined && (typeof motRaw !== "number" || !Number.isFinite(motRaw))) {
          throw new Error(
            `Session.advance: months_on_target is corrupted at ${this._state.date} (got ${String(motRaw)})`,
          );
        }
        if (onTarget(this._state, mandateParams)) {
          const mot = motRaw ?? 0;
          this._state = {
            ...this._state,
            vars: { ...this._state.vars, months_on_target: mot + 1 },
          };
        }

        const snapshot = Session._snapshotOf(this._state);
        this._trajectoryInternal.push(snapshot);
      }
    } catch (err) {
      this._state = checkpointState;
      this._trajectoryInternal.length = checkpointTrajectoryLength;
      this._pendingEscalations.length = checkpointEscalationsLength;
      this._activityLog.length = checkpointActivityLength;
      this._firedOnce = checkpointFiredOnce;
      this._rng.restore(checkpointRng);
      try {
        this._rebuildCaches();
      } catch (secondaryErr) {
        // Both the forward path and the rollback _rebuildCaches failed.
        // Force-restore caches from checkpoint so they are never left in a torn state.
        // Log the secondary error; the original err is re-thrown below.
        console.error(
          `Session.advance: _rebuildCaches failed during rollback (force-restoring from checkpoint). ` +
          `Original error: ${String(err)}. Secondary error:`,
          secondaryErr,
        );
        this._currentCache = checkpointCache;
        this._trajectoryCache = checkpointTrajectoryCache;
      }
      throw err;
    }

    this._rebuildCaches();
    this._notifyListeners();
  }

  /**
   * SPEC-WEB-9: fogged observation of a series at a trajectory point.
   * Applies SPEC-FOG-1 `observe()` (content-driven lag + noise) using a derived
   * RNG seeded via FNV-1a over `(session seed, snapshot date, seriesId)`. The
   * derived stream means observations are deterministic — identical inputs give
   * identical values, and a historical point's observation never changes as play
   * continues — and side-effect-free: `this._rng` is never consumed, so reading
   * observations cannot perturb a subsequent `advance()`.
   * @param seriesId — a series declared in content/engine/fog.json.
   * @param index — trajectory index to observe (default: the latest point).
   * @throws {Error} if index is out of range or seriesId is unknown to fog content.
   */
  observed(seriesId: string, index?: number): number {
    const traj = this._trajectoryInternal;
    const i = index ?? traj.length - 1;
    const snap = traj[i];
    if (snap === undefined) {
      throw new Error(
        `Session.observed: trajectory index ${i} out of range [0, ${traj.length - 1}]`,
      );
    }
    // Rebuild the history view observe() expects: most recent prior point first.
    const history: GameStateSnapshot[] = [];
    for (let k = i - 1; k >= 0; k--) {
      const prior = traj[k];
      if (prior !== undefined) history.push(prior);
    }
    const pseudo: GameState = { date: snap.date, vars: snap.vars, flags: snap.flags, history };
    const rng = mulberry32(fnv1a32(`${this._seed}|${snap.date}|${seriesId}`));
    return observe(pseudo, seriesId, rng);
  }

  /**
   * SPEC-WEB-9: whether the economy currently satisfies the mandate
   * (delegates to the SPEC-MANDATE-1 evaluator with content-loaded params).
   */
  mandateOnTarget(): boolean {
    return onTarget(this._state, loadMandateParams());
  }

  // --- SPEC-NAME-1: NPC names ---

  /**
   * The deterministic generated display name for an NPC id (committee member,
   * division head, ...). Seeded by the session seed so a given (seed, npcId)
   * always yields the same name and distinct ids draw independently. This is the
   * canonical display-name source — UI code uses it instead of hardcoded
   * localization name values.
   */
  npcName(npcId: string): string {
    return nameForId(this._seed, npcId, loadNamePools()).full;
  }

  // --- SPEC-INST-1: institution resources ---

  /** Current operating budget (defaults to the content initial value when absent). */
  operatingBudget(): number {
    return this._state.vars.operating_budget ?? loadInstitutionParams().initial_operating_budget;
  }

  /** Current political capital (defaults to the content initial value when absent). */
  politicalCapital(): number {
    return this._state.vars.political_capital ?? loadInstitutionParams().initial_political_capital;
  }

  // --- SPEC-INST-2: divisions & staffing ---

  /** The full division catalog (content-defined). */
  divisionCatalog(): readonly Division[] {
    return loadDivisionCatalog();
  }

  /**
   * The deterministic candidate slate for a division, seeded by the session seed.
   * Stable across calls and play (same seed + division → same slate).
   */
  candidatesFor(divisionId: string): readonly Candidate[] {
    // SPEC-INST-5: the talent market turns over — the slate refreshes each time the
    // post is vacated (a dismissal bumps refresh.<id>) and every candidate_refresh_months.
    const params = loadInstitutionParams();
    const monthsElapsed = this._trajectoryInternal.length - 1;
    const dismissals = (this._state.vars[`refresh.${divisionId}`] ?? 0) as number;
    const refreshIndex = dismissals + Math.floor(monthsElapsed / params.candidate_refresh_months);
    return generateCandidates(divisionId, this._seed, loadNamePools(), params, refreshIndex);
  }

  /** Whether a division currently has a staffed head. */
  isStaffed(divisionId: string): boolean {
    return this._state.flags[staffedFlagKey(divisionId)] === true;
  }

  /** Aggregate institutional investment from staffed divisions (feeds forecast quality). */
  institutionInvestment(): number {
    return institutionInvestment(this._state, loadDivisionCatalog());
  }

  /**
   * Hire the candidate at `candidateIndex` from `divisionId`'s slate.
   * Deducts the division's hire_cost from political capital and marks it staffed.
   * Fires listeners on success.
   * @throws {Error} if divisionId is unknown or candidateIndex is out of range.
   * @throws {InsufficientBudgetError} if the operating budget is below the hire cost.
   * @throws {DivisionAlreadyStaffedError} if the division is already staffed.
   */
  hire(divisionId: string, candidateIndex: number): void {
    const division = loadDivisionCatalog().find((d) => d.id === divisionId);
    if (division === undefined) {
      throw new Error(`Session.hire: unknown division "${divisionId}".`);
    }
    const slate = this.candidatesFor(divisionId);
    const candidate = slate[candidateIndex];
    if (candidate === undefined) {
      throw new Error(
        `Session.hire: candidate index ${candidateIndex} out of range [0, ${slate.length - 1}] for division "${divisionId}".`,
      );
    }
    // hireStaff is pure and throws before producing state, so this._state is
    // unchanged on failure — no checkpoint needed.
    this._state = hireStaff(this._state, division, candidate);
    this._rebuildCaches();
    this._notifyListeners();
  }

  /**
   * SPEC-STAFF-3: dismiss the head of a division, clearing the appointment so a fresh
   * candidate slate can be hired. No refund. Fires listeners.
   * @throws {Error} if divisionId is unknown.
   */
  fire(divisionId: string): void {
    const division = loadDivisionCatalog().find((d) => d.id === divisionId);
    if (division === undefined) {
      throw new Error(`Session.fire: unknown division "${divisionId}".`);
    }
    this._state = fireStaff(this._state, division);
    // SPEC-INST-5: dismissing a director turns over the talent market for that post,
    // so candidatesFor offers a fresh slate next time.
    const dismissals = (this._state.vars[`refresh.${divisionId}`] ?? 0) as number;
    this._state = {
      ...this._state,
      vars: { ...this._state.vars, [`refresh.${divisionId}`]: dismissals + 1 },
    };
    this._rebuildCaches();
    this._notifyListeners();
  }

  // --- SPEC-LEGACY-1: tenure & legacy ---

  /** Term-clock progress derived from elapsed months (trajectory length − 1). */
  termProgress(): ReturnType<typeof termProgress> {
    return termProgress(this._trajectoryInternal.length - 1, loadLegacyParams());
  }

  /** Whether current credibility clears the reappointment threshold. */
  reappointmentOutlook(): ReturnType<typeof evaluateReappointment> {
    return evaluateReappointment(this._state, loadLegacyParams());
  }

  /** The Chair's current legacy score. */
  legacyScore(): number {
    return computeLegacyScore(this._state, loadLegacyParams());
  }

  // --- PR A: banking stability, Fed finances, independence, division effects, culture ---

  /** SPEC-FRAG-1: current banking-fragility composite ∈ [0,1] (defaults from content). */
  bankFragility(): number {
    return this._state.vars.bank_fragility ?? loadFragilityParams().initial_fragility;
  }

  /** SPEC-FED-1: current SOMA balance-sheet size (defaults from content). */
  balanceSheet(): number {
    return this._state.vars.balance_sheet ?? loadFedFinancesParams().initial_balance_sheet;
  }

  /** SPEC-FED-1: latest monthly net income (carry on the balance sheet). */
  netIncome(): number {
    return this._state.vars.net_income ?? 0;
  }

  /** SPEC-FED-1: outstanding deferred asset (cumulative unremitted loss). */
  deferredAsset(): number {
    return this._state.vars.deferred_asset ?? loadFedFinancesParams().initial_deferred_asset;
  }

  /** SPEC-CONGRESS-1: institutional independence ∈ [0,100] (the fiscal-dominance axis). */
  independence(): number {
    return this._state.vars.independence ?? loadCongressParams().initial_independence;
  }

  /** SPEC-DIV-1: the live economic channel contributions of the staffed divisions. */
  divisionEffects(): DivisionEffects {
    return divisionEffects(this._state, loadDivisionCatalog(), loadDivisionEffectsParams());
  }

  /** SPEC-CULTURE-1: the institution's accreted culture. */
  culture(): { policyLean: number; supervisoryRigor: number } {
    return {
      policyLean: this._state.vars["culture.policy_lean"] ?? 0,
      supervisoryRigor:
        this._state.vars["culture.supervisory_rigor"] ?? loadCultureParams().initial_supervisory_rigor,
    };
  }

  // --- SPEC-EVENT-1/2: escalations ---

  /** The events awaiting the Chair's decision, in arrival order. */
  escalations(): readonly GameEvent[] {
    return this._pendingEscalations;
  }

  /** SPEC-FEED-1: the Chair's activity log, most recent first. */
  activityLog(): readonly ActivityEntry[] {
    return [...this._activityLog].reverse();
  }

  /** Snapshot the feed-relevant vars so a subsequent change can be diffed. */
  private _snapshotFeedVars(): Record<string, number> {
    const snap: Record<string, number> = {};
    for (const v of FEED_VARS) snap[v] = (this._state.vars[v] ?? 0) as number;
    return snap;
  }

  /** Append an activity entry capturing which feed vars moved since `before`. */
  private _logActivity(titleKey: string, before: Record<string, number>): void {
    const deltas: { var: string; delta: number }[] = [];
    for (const v of FEED_VARS) {
      const delta = ((this._state.vars[v] ?? 0) as number) - (before[v] ?? 0);
      if (Math.abs(delta) > 1e-9) deltas.push({ var: v, delta });
    }
    this._activityLog.push({ date: this._state.date, titleKey, deltas });
    if (this._activityLog.length > ACTIVITY_LOG_CAP) {
      this._activityLog.splice(0, this._activityLog.length - ACTIVITY_LOG_CAP);
    }
  }

  /**
   * Resolve a pending escalation by applying the chosen option's effects.
   * Removes the escalation from the queue, records it in the fired-once set when
   * `fires_once`, and enqueues any `trigger_event` follow-ups as new escalations.
   * Fires listeners.
   * @throws {Error} if the event is not pending or the option id is unknown.
   */
  resolveEscalation(eventId: string, optionId: string): void {
    const idx = this._pendingEscalations.findIndex((e) => e.id === eventId);
    if (idx === -1) {
      throw new Error(`Session.resolveEscalation: no pending escalation "${eventId}".`);
    }
    const event = this._pendingEscalations[idx]!;
    const option = event.options.find((o) => o.id === optionId);
    if (option === undefined) {
      throw new Error(`Session.resolveEscalation: event "${eventId}" has no option "${optionId}".`);
    }
    const before = this._snapshotFeedVars();
    const { state, queuedEvents } = applyEffects(option.effects, this._state);
    // Guard: months_on_target is managed exclusively by advance(). A content effect that
    // targets this var would silently corrupt the running total even if the value is finite.
    if (state.vars.months_on_target !== this._state.vars.months_on_target) {
      throw new Error(
        `Session.resolveEscalation: event "${eventId}" illegally modified months_on_target. ` +
        `This var is managed exclusively by Session.advance().`,
      );
    }
    this._state = state;
    // SPEC-FEED-1: record the decision and its felt effect on the economy.
    this._logActivity(event.title, before);
    if (event.fires_once === true) this._firedOnce.add(event.id);
    // Remove the resolved escalation.
    this._pendingEscalations = this._pendingEscalations.filter((e) => e.id !== eventId);
    // A trigger_event effect enqueues the referenced event as a new escalation.
    if (queuedEvents.length > 0) {
      const catalog = loadEventCatalog();
      const pendingIds = new Set(this._pendingEscalations.map((e) => e.id));
      for (const qid of queuedEvents) {
        if (pendingIds.has(qid)) continue;
        const queued = catalog.find((e) => e.id === qid);
        if (queued !== undefined) {
          this._pendingEscalations.push(queued);
          pendingIds.add(qid);
        }
      }
    }
    this._rebuildCaches();
    this._notifyListeners();
  }

  /**
   * Returns the Chair's persuasion budget for the current meeting.
   * SPEC-COMM-7: computed from credibility; refreshed each meeting, never banked.
   * SPEC-COMM-9: also includes the consensus term from the stored consensus_capital var.
   */
  chairCapital(): number {
    const credibility = getCredibility(this._state);
    const consensusCapital = (this._state.vars.consensus_capital ?? 0) as number;
    return computeChairCapital(credibility, loadChairCapitalParams(), consensusCapital);
  }

  /**
   * Preview how the committee would vote at the given proposed rate without committing.
   * Returns per-member preferred rates + dissent status, inflation/unemployment gaps, and
   * the content targets so the UI can render dynamic gap labels.
   * Pure: does not mutate any session state.
   * SPEC-COMM-7: optional capitalSpend widens targeted members' bands for this preview.
   * @throws {Error} if proposedRate is not finite.
   * @throws {Error} if any capitalSpend entry is not a non-negative finite number (SPEC-COMM-7).
   * @throws {Error} if any capitalSpend entry exceeds max_spend_per_member (SPEC-COMM-7).
   * @throws {Error} if total capitalSpend exceeds chairCapital() budget (SPEC-COMM-7).
   * @throws {Error} if a capitalSpend key does not match any member id in the loaded committee,
   *   or if the resulting widened band would exceed 0.5 (propagated from computeEffectiveBands).
   * @throws {VoteMissingVarError} if state vars (inflation, unemployment, policy_rate) are missing or non-finite
   *   (propagated from previewVote()).
   */
  committeeBriefing(proposedRate: number, capitalSpend?: CapitalSpend): {
    previews: readonly MemberVotePreview[];
    gapInflation: number;
    gapUnemployment: number;
    inflationTarget: number;
    unemploymentTarget: number;
  } {
    const committee = loadCommittee(this._committeeId);
    const params = loadCommitteeParams();
    const traits = loadTraitCatalog();
    const effectiveBands = this._resolveEffectiveBands(committee, capitalSpend, "committeeBriefing");
    const { previews, gapInflation, gapUnemployment } = previewVote(committee, proposedRate, this._state, params, traits, effectiveBands);
    return {
      previews,
      gapInflation,
      gapUnemployment,
      inflationTarget: params.target_inflation,
      unemploymentTarget: params.target_unemployment,
    };
  }

  /**
   * Propose a rate for the current month's FOMC meeting.
   * SPEC-SESSION-1 gates this on `isMeetingMonth()` — calling `proposeRate` in a month
   * that is not on the loaded FOMC schedule throws `NotMeetingMonthError` before
   * any rate-validity check runs.
   * Returns the FomcVote for the meeting.
   * SPEC-COMM-7: optional capitalSpend widens targeted members' bands for this meeting.
   * The spend is ephemeral — it is not written to state and does not carry over.
   * @throws {NotMeetingMonthError} if the current month is not a scheduled meeting month.
   * @throws {Error} if `rate` is not finite (only checked once the meeting-month gate passes).
   * @throws {Error} if any capitalSpend entry is not a non-negative finite number (SPEC-COMM-7).
   * @throws {Error} if any capitalSpend entry exceeds max_spend_per_member (SPEC-COMM-7).
   * @throws {Error} if total capitalSpend exceeds chairCapital() budget (SPEC-COMM-7).
   * @throws {Error} if a capitalSpend key does not match any member id, or the resulting widened
   *   band would exceed 0.5 (propagated from computeEffectiveBands).
   * @throws {VoteMissingVarError} if state vars (inflation, unemployment, policy_rate) are missing or non-finite (propagated from previewVote()).
   */
  proposeRate(rate: number, capitalSpend?: CapitalSpend): FomcVote {
    if (!this.isMeetingMonth()) {
      throw new NotMeetingMonthError(this._state.date);
    }
    if (!Number.isFinite(rate)) {
      throw new Error(`Session.proposeRate: rate ${rate} is not finite.`);
    }
    const committee = loadCommittee(this._committeeId);
    const params = loadCommitteeParams();
    const traits = loadTraitCatalog();
    const effectiveBands = this._resolveEffectiveBands(committee, capitalSpend, "proposeRate");
    // SPEC-DOCT-2: use previewVote directly so member previews are available for dot-plot spread.
    const { previews } = previewVote(committee, rate, this._state, params, traits, effectiveBands);
    const fomcVote: FomcVote = { decided: rate, dissents: previews.filter((p) => p.wouldDissent).length };

    // Apply the decided rate and compute new credibility.
    // SPEC-CRED-1 (issue #33): dissents no longer affect credibility, so fomcVote.dissents is
    // reported back to the caller but not fed here.
    // SPEC-GUIDE-2: markets are surprised when the decided rate contradicts the guidance stance,
    // measured against the pre-meeting policy rate.
    // previewVote() above already guaranteed policy_rate is present and finite (VoteMissingVarError),
    // so the cast mirrors the codebase's required-var convention rather than masking a real gap.
    // Capturing it here (immediately after vote) keeps that guarantee visible.
    const guidanceP = loadGuidanceParams();
    const preMeetingRate = this._state.vars.policy_rate as number;
    const surprisedMarkets = marketsSurprised(
      this._stance,
      preMeetingRate,
      fomcVote.decided,
      guidanceP.surprise_tolerance,
    );
    const newCredibility = applyMeetingOutcome(
      getCredibility(this._state),
      {
        surprisedMarkets,
        onTarget: onTarget(this._state, loadMandateParams()),
      },
    );

    // SPEC-DOCT-2: apply meeting-hook effects generically over all adopted doctrines.
    // No content IDs are hardcoded in engine code — the HOOK_HANDLERS registry in
    // src/content/doctrines.ts maps each hook name to its handler. To add a new
    // meeting hook: add the string to DoctrineHook + schema enum, implement a handler,
    // and register it in HOOK_HANDLERS — no changes to this file needed.
    // SPEC-COMM-9: update consensus_capital from the vote outcome.
    // Zero dissents → add consensus_gain; above threshold dissents → subtract consensus_penalty (clamped ≥ 0).
    const ccParams = loadChairCapitalParams();
    const prevConsensusCap = (this._state.vars.consensus_capital ?? 0) as number;
    const nextConsensusCap = updateConsensusCapital(prevConsensusCap, fomcVote.dissents, ccParams);

    // Vote outcome committed before the hook loop so a hook error never rolls back
    // the player's rate decision — only hook effects are restored on failure.
    let stateAfterMeeting: GameState = {
      ...this._state,
      vars: { ...this._state.vars, policy_rate: fomcVote.decided, credibility: newCredibility, consensus_capital: nextConsensusCap },
    };
    this._state = stateAfterMeeting;
    const hookCheckpoint = this._state;
    try {
      const catalog = loadDoctrineCatalog();
      for (const doctrine of catalog) {
        if (doctrine.meeting_hook === undefined) continue;
        if (stateAfterMeeting.flags[doctrineFlagKey(doctrine.id)] !== true) continue;
        stateAfterMeeting = HOOK_HANDLERS[doctrine.meeting_hook](stateAfterMeeting, previews);
      }
      this._state = stateAfterMeeting;
    } catch (err) {
      this._state = hookCheckpoint;
      this._rebuildCaches();
      throw err;
    }

    this._rebuildCaches();
    this._notifyListeners();
    return fomcVote;
  }

  /**
   * Reset the session to its initial state.
   * Trajectory is cleared to the single initial snapshot.
   * Fires listeners.
   */
  reset(): void {
    this._stance = "neutral";
    this._rng = mulberry32(this._seed);
    this._pendingEscalations = [];
    this._firedOnce = new Set();
    this._activityLog = [];
    this._state = {
      ...this._initialState,
      vars: { ...this._initialState.vars },
      flags: { ...this._initialState.flags },
      history: [],
    };
    const snapshot = Session._snapshotOf(this._state);
    this._trajectoryInternal = [snapshot];
    this._rebuildCaches();
    this._notifyListeners();
  }

  // SPEC-GUIDE-1: Store the forward-guidance stance; scales `expectations_anchor_pull` passed to `applyMacroDynamics` via stanceMultiplier().
  // The value is NOT written into state.vars; the stance is a Session-level concern, not a var.
  // Fires listeners (downstream UI may want to reflect the stored stance).
  setForwardGuidanceStance(stance: ForwardGuidanceStance): void {
    this._stance = stance;
    this._notifyListeners();
  }

  /**
   * Adopt a doctrine by id. Applies standing effects to state immediately.
   * @throws {DoctrineAlreadyAdoptedError} if already adopted.
   * @throws {DoctrineNotFoundError} if id not in catalog.
   * @throws {Error} if a standing_effect target var is absent from state.
   * @throws {Error} if the doctrine catalog cannot be loaded (I/O or schema failure).
   */
  adoptDoctrine(doctrineId: string, catalog?: DoctrineEntry[]): void {
    let resolvedCatalog: DoctrineEntry[];
    try {
      resolvedCatalog = catalog ?? loadDoctrineCatalog();
    } catch (e) {
      throw new Error(`Session.adoptDoctrine: failed to load doctrine catalog`, { cause: e });
    }
    const doctrine = getDoctrine(doctrineId, resolvedCatalog);
    const checkpointState = this._state;
    const checkpointCache = this._currentCache;
    const checkpointTrajectory = this._trajectoryCache;
    this._state = _adoptDoctrine(this._state, doctrine);
    try {
      this._rebuildCaches();
    } catch (err) {
      // Restore checkpoint: reset state first, then rebuild caches from it.
      this._state = checkpointState;
      try {
        this._rebuildCaches();
      } catch (secondaryErr) {
        // Both forward and rollback _rebuildCaches failed; force-restore caches from checkpoint
        // and propagate secondaryErr so callers have full diagnostic context.
        this._currentCache = checkpointCache;
        this._trajectoryCache = checkpointTrajectory;
        throw new Error(
          `Session.adoptDoctrine: cache rebuild failed during rollback (force-restored from checkpoint); original error: ${String(err)}`,
          { cause: secondaryErr },
        );
      }
      throw err;
    }
    this._notifyListeners();
  }

  /**
   * Abandon a doctrine by id. Reverses standing effects and deducts flip-flop credibility cost.
   * @throws {DoctrineNotAdoptedError} if not currently adopted.
   * @throws {DoctrineNotFoundError} if id not in catalog.
   * @throws {Error} if a standing_effect target var is absent from state.
   * @throws {Error} if credibility var is absent when flip_flop_cost > 0.
   * @throws {Error} if the doctrine catalog cannot be loaded (I/O or schema failure).
   */
  abandonDoctrine(doctrineId: string, catalog?: DoctrineEntry[]): void {
    let resolvedCatalog: DoctrineEntry[];
    try {
      resolvedCatalog = catalog ?? loadDoctrineCatalog();
    } catch (e) {
      throw new Error(`Session.abandonDoctrine: failed to load doctrine catalog`, { cause: e });
    }
    const doctrine = getDoctrine(doctrineId, resolvedCatalog);
    const checkpointState = this._state;
    const checkpointCache = this._currentCache;
    const checkpointTrajectory = this._trajectoryCache;
    this._state = _abandonDoctrine(this._state, doctrine);
    try {
      this._rebuildCaches();
    } catch (err) {
      // Restore checkpoint: reset state first, then rebuild caches from it.
      this._state = checkpointState;
      try {
        this._rebuildCaches();
      } catch (secondaryErr) {
        // Both forward and rollback _rebuildCaches failed; force-restore caches from checkpoint
        // and propagate secondaryErr so callers have full diagnostic context.
        this._currentCache = checkpointCache;
        this._trajectoryCache = checkpointTrajectory;
        throw new Error(
          `Session.abandonDoctrine: cache rebuild failed during rollback (force-restored from checkpoint); original error: ${String(err)}`,
          { cause: secondaryErr },
        );
      }
      throw err;
    }
    this._notifyListeners();
  }

  /**
   * Subscribe to session mutations.
   * @param listener - Called synchronously after each mutation.
   * @returns An unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  // --- Private helpers ---

  /** Rebuild the referentially-stable caches after every mutation. */
  private _rebuildCaches(): void {
    this._currentCache = Session._snapshotOf(this._state);
    this._trajectoryCache = Object.freeze([...this._trajectoryInternal]);
  }

  /**
   * Fire all listeners synchronously.
   * Snapshots the listener set first so that a listener that calls subscribe()
   * during notification doesn't fire in the same tick. Errors from individual
   * listeners are collected and re-thrown as an AggregateError once every
   * listener has been invoked — a throwing listener must not starve later ones.
   */
  private _notifyListeners(): void {
    const snapshot = [...this._listeners];
    const errors: unknown[] = [];
    for (const listener of snapshot) {
      try {
        listener();
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0]!;
    if (errors.length > 1) throw new AggregateError(errors, "Session: one or more listeners threw during notification.");
  }

  /**
   * Resolve the per-member effectiveBands from an optional capitalSpend map.
   * Runs `_assertWithinBudget` then `computeEffectiveBands`; returns `undefined` when
   * no spend is provided. Shared by `committeeBriefing` and `proposeRate` to ensure both
   * entry points run identical validation and cannot drift independently. (SPEC-COMM-7)
   */
  private _resolveEffectiveBands(
    committee: import("../content/committees.js").Committee,
    capitalSpend: CapitalSpend | undefined,
    caller: string,
  ): Readonly<Record<string, number>> | undefined {
    if (!capitalSpend) return undefined;
    const chairCapitalParams = loadChairCapitalParams();
    Session._assertWithinBudget(capitalSpend, this.chairCapital(), chairCapitalParams.max_spend_per_member, caller);
    return computeEffectiveBands(capitalSpend, committee, chairCapitalParams);
  }

  /**
   * Throw a descriptive error if any capitalSpend entry is invalid or if the total exceeds
   * the budget. Also throws if any single member's spend exceeds max_spend_per_member —
   * over-allocating one member wastes budget silently, which contradicts the "hard persuasion
   * budget" contract (SPEC-COMM-7).
   *
   * Intentional two-layer split: this method validates spend values and the total budget;
   * unknown-key and post-widen band overflow checks are delegated to `computeEffectiveBands`
   * (called by `_resolveEffectiveBands` immediately after this returns).
   *
   * Validation order:
   *  1. Budget: must be a non-negative finite number (guards against corrupt credibility / NaN).
   *  2. Per-entry: must be a non-negative finite number.
   *  3. Per-entry: must not exceed max_spend_per_member (over-allocation fails loudly).
   *  4. Total: sum must not exceed budget.
   */
  private static _assertWithinBudget(
    capitalSpend: CapitalSpend,
    budget: number,
    maxPerMember: number,
    caller: string,
  ): void {
    if (!Number.isFinite(budget) || budget < 0) {
      throw new Error(
        `Session.${caller}: chairCapital() returned a non-finite budget (${budget}); this indicates a corrupt credibility value in state.`,
      );
    }
    for (const [id, v] of Object.entries(capitalSpend)) {
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(
          `Session.${caller}: capitalSpend["${id}"] must be a non-negative finite number, got ${v}.`,
        );
      }
      if (v > maxPerMember) {
        throw new Error(
          `Session.${caller}: capitalSpend["${id}"] (${v}) exceeds max_spend_per_member (${maxPerMember}). Reduce spend for this member.`,
        );
      }
    }
    const total = Object.values(capitalSpend).reduce((sum, v) => sum + v, 0);
    if (total > budget) {
      throw new Error(
        `Session.${caller}: total capitalSpend (${total}) exceeds chairCapital() budget (${budget}). Reduce spend to stay within the Chair's persuasion budget.`,
      );
    }
  }

  /** Extract a GameStateSnapshot from a GameState. */
  private static _snapshotOf(state: GameState): GameStateSnapshot {
    return {
      date: state.date,
      vars: { ...state.vars },
      flags: { ...state.flags },
    };
  }
}
