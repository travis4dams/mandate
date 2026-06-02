import { loadScenario } from "../content/scenarios.js";
import { loadReplay } from "../content/replays.js";
import { loadCommittee } from "../content/committees.js";
import { tick } from "./clock.js";
import { vote, loadCommitteeParams } from "./fomc.js";
import { applyMeetingOutcome, getCredibility } from "./credibility.js";
import type { GameState, GameStateSnapshot } from "./state.js";
import type { FomcVote } from "./fomc.js";
import type { Replay } from "../content/replays.js";

// SPEC-SESSION-0: skeleton Session façade.
// Wraps tick + vote + applyMeetingOutcome with identity-stable getters and a subscribe protocol.
// SPEC-SESSION-1 will replace internals with the full macro-dynamics chain.

/**
 * The three forward-guidance stances the Chair can adopt.
 * Stored internally; GUIDE-1 wires the recovery-rate multiplier.
 */
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

  // Stored stance; wired to dynamics in GUIDE-1.
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

  // --- Mutators ---

  /**
   * Advance the session by `months` months.
   * For each month, applies any matching replay action then calls tick().
   * @throws {Error} if months <= 0.
   */
  advance(months: number): void {
    if (months <= 0) {
      throw new Error(`Session.advance: months must be > 0, got ${months}.`);
    }

    // Checkpoint for mid-loop rollback (SF4): capture mutable state before we begin.
    const checkpointState = this._state;
    const checkpointTrajectoryLength = this._trajectoryInternal.length;

    try {
      for (let i = 0; i < months; i++) {
        // Apply matching replay action before the tick, if this is a replay session.
        if (this._replay !== null) {
          const action = this._replay.actions.find((a) => a.date === this._state.date);
          if (action !== undefined) {
            this._state = {
              ...this._state,
              vars: { ...this._state.vars, policy_rate: action.policy_rate },
            };
          }
        }

        // Advance engine state by one month (pure — returns new state).
        this._state = tick(this._state, 1);

        // Push snapshot of state AFTER the tick so current reflects the advanced date.
        const snapshot = Session._snapshotOf(this._state);
        this._trajectoryInternal.push(snapshot);
      }
    } catch (err) {
      // Restore to pre-advance checkpoint so _state and _trajectoryInternal stay consistent.
      this._state = checkpointState;
      this._trajectoryInternal.length = checkpointTrajectoryLength;
      throw err;
    }

    this._rebuildCaches();
    this._notifyListeners();
  }

  /**
   * Propose a rate for the current month's FOMC meeting.
   * SESSION-0: every month is meeting-eligible (SESSION-1 wires the actual schedule).
   * Returns the FomcVote for the meeting.
   * @throws {Error} if rate is not finite.
   */
  proposeRate(rate: number): FomcVote {
    if (!Number.isFinite(rate)) {
      throw new Error(`Session.proposeRate: rate ${rate} is not finite.`);
    }

    const committee = loadCommittee(this._committeeId);
    const params = loadCommitteeParams();
    const fomcVote = vote(committee, rate, this._state, params);

    // Apply the decided rate and compute new credibility.
    // TODO(SPEC-SESSION-1): wire surprisedMarkets from forward-guidance-vs-decided delta; wire onTarget from mandate evaluator.
    // SESSION-0 limitation: surprisedMarkets and onTarget are both false until the meeting calendar
    // and mandate evaluator are implemented in SESSION-1; this permanently disables two of the three
    // SPEC-CRED-1 credibility levers for the current slice.
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

  /**
   * Store the forward-guidance stance.
   * SESSION-0: stored privately, no effect on dynamics. GUIDE-1 wires the multiplier.
   * Fires listeners.
   */
  setForwardGuidanceStance(stance: ForwardGuidanceStance): void {
    this._stance = stance;
    this._state = {
      ...this._state,
      vars: {
        ...this._state.vars,
        forward_guidance_stance: stance === "hawkish" ? 1 : stance === "dovish" ? -1 : 0,
      },
    };
    this._rebuildCaches();
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

  /** Fire all listeners synchronously. */
  private _notifyListeners(): void {
    for (const listener of this._listeners) {
      listener();
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
