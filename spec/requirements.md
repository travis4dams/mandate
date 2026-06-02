# MANDATE — Requirements Registry

The design vision lives in [DESIGN.md](./DESIGN.md). This file decomposes it into
small, addressable requirements with stable IDs. Tests reference these IDs in
comments (e.g. `// SPEC-CRED-1`), and `npm run spec:trace` fails CI if any
requirement tagged `[testable]` has no referencing test.

Tag meanings: `[testable]` = must be covered by an automated test;
`[design]` = narrative/UX intent, verified by review rather than tests.

## Simulation core
- **SPEC-SIM-1** `[testable]` The simulation is deterministic: same seed + inputs reproduce a run exactly. Engine code never calls `Math.random()` or reads the wall clock.
- **SPEC-SIM-2** `[design]` The full financial network is the single source of truth; all dashboards and the fractal-zoom map are read-only views derived from it.
- **SPEC-SIM-3** `[testable]` A pure `tick(state, months)` advances `state.date` by N months on the `YYYY-MM` calendar and maintains a bounded `state.history: GameStateSnapshot[]` (size from `content/engine/params.json#tick.history_size`). By convention `state.history` excludes the current state; `history[0]` is the most-recent prior snapshot (`date − 1 month` after a 1-month tick). The function returns a new `GameState` and does not mutate the input.
- **SPEC-SIM-4** `[testable]` A **replay** is a schema-governed content artifact under `content/replays/` capturing the **player's strategy** — a structured sequence of `{date, policy_rate, ...}` actions, with no engine-computed values. The engine-side runner `runReplay(replayId, months)` in `src/engine/replay.ts` applies the strategy to the engine via `tick` and returns an **in-memory** trajectory (not committed; engine-computed values stay in memory). Two consecutive `runReplay` calls produce bit-identical trajectories. Replay actions with dates outside the simulated `[0, months)` window are surfaced via `UnconsumedReplayActionsError` so author typos don't silently produce mis-aligned trajectories. At least one committed replay (`content/replays/1979_chair_tightening.json`, id `replay.1979_chair_tightening`) is loadable via `loadReplay`.

## Credibility & expectations
- **SPEC-CRED-1** `[testable]` Dissents and market surprises reduce credibility; on-target outcomes raise it; the value is clamped to [0, 100].
- **SPEC-CRED-2** `[testable]` Inflation expectations remain anchored only at or above a credibility threshold.
- **SPEC-CRED-3** `[testable]` Lower credibility increases the "pain multiplier" on policy moves (1x at full credibility up to 3x at zero).
- **SPEC-CRED-4** `[testable]` Once credibility is lost, de-anchored expectations create a self-reinforcing spiral over multiple periods. Concretely: each tick where `credibility < ANCHOR_THRESHOLD`, `state.vars.months_below_anchor` increments; once it reaches `params.consecutive_months`, `expectations_anchor` drifts further from target inflation by `params.drift_per_period` per month and does not mean-revert until credibility recovers. On recovery (`credibility >= ANCHOR_THRESHOLD`), `months_below_anchor` is **frozen, not reset**; `expectations_anchor` recovers toward target at `params.recovery_rate` per month.

## Content language
- **SPEC-COND-1** `[testable]` Conditions support all/any/not combinators, numeric variable comparisons, and boolean flag checks, evaluated against game state.
- **SPEC-COND-2** `[testable]` Effects are pure: applying them returns a new state and never mutates the input.

## Content integrity
- **SPEC-CONTENT-1** `[testable]` All shipped content (events, techs) validates against its JSON Schema before the engine loads it.
- **SPEC-CONTENT-2** `[design]` All player-facing strings are referenced by localization key; no display text appears in logic files.
- **SPEC-CONTENT-3** `[testable]` Named people in the game (committee members, characters) MUST use randomly-generated names. Content files MUST NOT contain ids whose slug matches a blocklist of real historical or famous public figures (e.g., FOMC chairs from any era, well-known economists). Enforced by `test/content-lint.test.ts` which walks `content/**/*.json` and asserts every id passes the blocklist.

## Institution & governance
- **SPEC-GOV-1** `[design]` The Chair cannot be removed except for cause; the soft continue-gate is 4-year reappointment, not firing.
- **SPEC-GOV-2** `[design]` The Board turns over slowly (one 14-year seat ~every two years); FOMC voters include a yearly-rotating subset of regional presidents.

## Scenarios
- **SPEC-SCEN-1** `[testable]` A scenario schema (`schemas/scenario.schema.json`) and loader (`src/content/scenarios.ts`) produce an initial `GameState` from a content file (`content/scenarios/*.json`). Loader accepts an optional `requiredVars: string[]` and throws `MissingVarsError` listing absent keys — preventing the silent-default-to-0 failure mode. Schema constrains `name`/`desc` to localization-key shape `^[a-z][a-z0-9_.]+$` so inline player-facing strings fail `npm run validate`. The `scen.1979_stagflation` scenario loads cleanly and has `date == "1979-08"`, `history: []`, and the slice-1 required vars present.

## Data fog
- **SPEC-FOG-1** `[testable]` A pure `observe(state, seriesId, rng)` returns a fogged view of the true state variable, with `noise_scale` and `lag_months` parameters from `content/engine/params.json#fog[seriesId]` (validated by `schemas/engine-params.schema.json`). Lag indexing: `lag_months === 0` reads the current `state.vars[seriesId]`; `lag_months >= 1` reads `state.history[lag_months - 1].vars[seriesId]`; out-of-range falls back to the current value. Same seed + state → same observation.

## Committee
*`SPEC-COMM-1` and `SPEC-COMM-2` are one committee concern split into two PRs for review size; a future `SPEC-COMM-3` is reserved for genuinely-new committee work, not for further sub-splitting.*

- **SPEC-COMM-1** `[testable]` A committee schema (`schemas/committee.schema.json`) and content (`content/committees/1979.json`) define members as `{ id, name (loc key), lean: "hawkish"|"dovish"|"neutral", competence: number in [0,1] }`. `name` is constrained to localization-key shape `^[a-z][a-z0-9_.]+$`. `npm run validate` accepts `content/committees/1979.json`. No engine changes in this SPEC.
- **SPEC-COMM-2** `[testable]` A pure `vote(committee, proposedRate, state, params): { decided, dissents }` simulates an FOMC vote: each member's preferred rate derives from their lean + current `inflation`/`unemployment`; `dissents` counts members where `|preferred - proposedRate| > params.dissent_tolerance`; `decided` is `proposedRate` for slice 1 (the committee has no override power yet). `params` is required — callers resolve via `loadCommitteeParams()` (lazy-cached from `content/engine/params.json#committee`), keeping the engine function pure of hidden I/O. Missing or non-finite `proposedRate`, `state.vars.inflation`, or `state.vars.unemployment` throws (no silent default-to-zero, no silent NaN-zeros-dissents). Dissents output is consumed by the existing `applyMeetingOutcome` in `src/engine/credibility.ts` without modification.

## Engine params
- **SPEC-PARAMS-1** `[testable]` Engine-tunable params are split into per-section content files (`content/engine/tick.json`, `content/engine/fog.json`, `content/engine/credibility.json`, `content/engine/committee.json`) each validated by a corresponding per-section schema (`schemas/tick.schema.json`, `schemas/fog.schema.json`, `schemas/credibility.schema.json`, `schemas/committee-params.schema.json`). The umbrella `schemas/engine-params.schema.json` and `content/engine/params.json` are deleted. A new `loadValidatedFile(schemaPath, filePath)` helper in `src/content/loader.ts` validates a single JSON file and caches the compiled AJV `ValidateFunction` in a module-level `Map` keyed by `schemaPath` so the same schema is compiled at most once per process. Callsites updated: `src/engine/clock.ts`, `src/engine/fog.ts`, `src/engine/credibility.ts`, `src/engine/fomc.ts`, and `tools/validate-content.ts`.

## Engine session
- **SPEC-SESSION-0** `[testable]` A pure Session façade wraps tick + vote + applyMeetingOutcome with identity-stable getters and a subscribe protocol consumed by useSyncExternalStore in the future web UI. Skeleton in slice 2; the successor spec fully wires the macro dynamics. `Session.fromScenario(scenarioId, seed, committeeId)` and `Session.fromReplay(replayId, seed, committeeId)` are the two static factories; `committeeId` identifies the FOMC committee content file used by `proposeRate`. `advance(months)`, `proposeRate(rate)`, `reset()`, and `setForwardGuidanceStance(stance)` are the mutators. `get current(): GameStateSnapshot` and `get trajectory(): readonly GameStateSnapshot[]` return referentially-stable values that change reference only on mutation. `subscribe(listener)` returns an unsubscribe function; listeners fire synchronously after each mutation but never on getter reads.
- **SPEC-SESSION-1** `[testable]` `Session.proposeRate()` is gated to scheduled FOMC meeting months defined in `content/engine/meeting-schedule.json` (schema-governed). `Session.isMeetingMonth(date?: string): boolean` returns true iff the given date's month falls in the schedule. Calling `proposeRate()` outside a meeting month throws `NotMeetingMonthError` (with `public readonly date: string`).
- **SPEC-GUIDE-1** `[testable]` `Session.setForwardGuidanceStance(stance)` wires the forward-guidance stance into the credibility-spiral recovery path. When `credibility >= anchor_threshold`, `expectations_anchor` recovers toward `target_inflation` at `recovery_rate * stance_multiplier` per month, where `stance_multiplier` is `hawkish_multiplier`, `neutral_multiplier`, or `dovish_multiplier` from `content/engine/guidance.json` (schema-governed). `applyMonthlySpiral` is called once per month inside `Session.advance()`.

## Calibration
- **SPEC-CAL-1** `[testable]` Real FRED data for 1979-08 through 1986-12 is committed as `content/calibration/fred_1979_1986.json` and a calibration harness `tools/calibrate.ts` runs the canned 1979 chair-tightening replay through the engine and emits a CSV comparing engine output to FRED. A `npm run calibrate` script produces the comparison. Engine outputs that ship with slice 1 (true policy_rate per the replay; inflation/credibility/expectations_anchor are constants until forward-guidance/Phillips-curve work in slice 2) are compared without claiming convergence; the test only asserts the FRED data is loaded correctly and the harness runs deterministically.
