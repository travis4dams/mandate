import { join } from "node:path";
import { loadScenario } from "../content/scenarios.js";
import { loadReplay } from "../content/replays.js";
import { loadCommittee } from "../content/committees.js";
import { loadValidatedFile } from "../content/loader.js";
import { tick } from "./clock.js";
import { vote, loadCommitteeParams } from "./fomc.js";
import { applyMeetingOutcome, applyMonthlySpiral, getCredibility, loadCredibilityParams } from "./credibility.js";
import { applyMacroDynamics, loadDynamicsParams } from "./dynamics.js";
import type { GameState, GameStateSnapshot } from "./state.js";
import type { FomcVote } from "./fomc.js";
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
// The stance scales the credibility-spiral recovery_rate via stanceMultiplier().
export type ForwardGuidanceStance = "hawkish" | "dovish" | "neutral";

// Required vars that every scenario must supply for the engine to function.
const REQUIRED_VARS = ["policy_rate", "inflation", "unemployment", "credibility"] as const;

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

  // Stored seed for future stochastic mechanics (SESSION-0: unused in dynamics).
  private readonly _seed: number;

  // Committee id used by proposeRate; passed as a required factory argument.
  private readonly _committeeId: string;

  // SPEC-GUIDE-1: stored stance; wired to the spiral recovery path in advance() via stanceMultiplier().
  private _stance: ForwardGuidanceStance = "neutral";

  // Subscriber set for the subscribe/unsubscribe protocol.
  private readonly _listeners: Set<() => void> = new Set();

  // Snapshot of the initial state so reset() can restore it without re-loading content.
  private readonly _initialState: GameState;

  private constructor(initialState: GameState, seed: number, replay: Replay | null, committeeId: string) {
    this._seed = seed;
    this._replay = replay;
    this._committeeId = committeeId;
    this._initialState = initialState;
    this._state = { ...initialState, vars: { ...initialState.vars }, flags: { ...initialState.flags }, history: [] };

    const snapshot = Session._snapshotOf(this._state);
    this._trajectoryInternal = [snapshot];
    this._currentCache = snapshot;
    this._trajectoryCache = Object.freeze([snapshot]);
  }

  /**
   * Construct a Session from a scenario content file.
   * The seed is stored for future stochastic use (SESSION-0: deterministic substrate only).
   * committeeId identifies the FOMC committee used by proposeRate (e.g. "comm.fomc_1979").
   */
  static fromScenario(scenarioId: string, seed: number, committeeId: string): Session {
    const state = loadScenario(scenarioId, [...REQUIRED_VARS]);
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
   * For each month, applies any matching replay action then calls tick().
   * @throws {Error} if months is not a positive integer.
   */
  advance(months: number): void {
    if (!Number.isInteger(months) || months <= 0) {
      throw new Error(`Session.advance: months must be a positive integer, got ${months}.`);
    }

    // Checkpoint for mid-loop rollback: capture mutable state before we begin.
    const checkpointState = this._state;
    const checkpointTrajectoryLength = this._trajectoryInternal.length;

    // SPEC-GUIDE-1: loaders + effectiveParams are loop-invariant — both are cached
    // singletons and the stance is fixed for the duration of advance(). Hoisting
    // makes that obvious to readers and removes any hint of per-month re-resolution.
    const credParams = loadCredibilityParams();
    const guidanceP = loadGuidanceParams();
    const dynamicsParams = loadDynamicsParams();
    const effectiveParams = {
      ...credParams,
      recovery_rate: credParams.recovery_rate * stanceMultiplier(this._stance, guidanceP),
    };

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
        this._state = applyMonthlySpiral(this._state, effectiveParams);
        this._state = applyMacroDynamics(this._state, dynamicsParams);

        const snapshot = Session._snapshotOf(this._state);
        this._trajectoryInternal.push(snapshot);
      }
    } catch (err) {
      this._state = checkpointState;
      this._trajectoryInternal.length = checkpointTrajectoryLength;
      this._rebuildCaches();
      throw err;
    }

    this._rebuildCaches();
    this._notifyListeners();
  }

  /**
   * Propose a rate for the current month's FOMC meeting.
   * SESSION-1 gates this on `isMeetingMonth()` — calling `proposeRate` in a month
   * that is not on the loaded FOMC schedule throws `NotMeetingMonthError` before
   * any rate-validity check runs.
   * Returns the FomcVote for the meeting.
   * @throws {NotMeetingMonthError} if the current month is not a scheduled meeting month.
   * @throws {Error} if `rate` is not finite (only checked once the meeting-month gate passes).
   */
  proposeRate(rate: number): FomcVote {
    if (!this.isMeetingMonth()) {
      throw new NotMeetingMonthError(this._state.date);
    }
    if (!Number.isFinite(rate)) {
      throw new Error(`Session.proposeRate: rate ${rate} is not finite.`);
    }

    const committee = loadCommittee(this._committeeId);
    const params = loadCommitteeParams();
    const fomcVote = vote(committee, rate, this._state, params);

    // Apply the decided rate and compute new credibility.
    // TODO: wire surprisedMarkets from forward-guidance-vs-decided delta and onTarget from
    // a mandate evaluator in a future spec. SESSION-0 limitation: both are pinned to false,
    // which permanently disables two of the three SPEC-CRED-1 credibility levers for this slice.
    const newCredibility = applyMeetingOutcome(
      getCredibility(this._state),
      {
        dissents: fomcVote.dissents,
        surprisedMarkets: false,
        onTarget: false,
      },
    );

    this._state = {
      ...this._state,
      vars: {
        ...this._state.vars,
        policy_rate: fomcVote.decided,
        credibility: newCredibility,
      },
    };

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

  // SPEC-GUIDE-1: Store the forward-guidance stance; wired to the spiral recovery path via stanceMultiplier().
  // The value is NOT written into state.vars; the stance is a Session-level concern, not a var.
  // Fires listeners (downstream UI may want to reflect the stored stance).
  setForwardGuidanceStance(stance: ForwardGuidanceStance): void {
    this._stance = stance;
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
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Session: one or more listeners threw during notification.");
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
