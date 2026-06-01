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
- **SPEC-SIM-4** `[testable]` A **replay** is a schema-governed content artifact under `content/replays/` capturing the **player's strategy** — a structured sequence of `{date, policy_rate, ...}` actions, with no engine-computed values. A test-side runner `runReplay(replayId, months)` applies the strategy to the engine via `tick` and returns an **in-memory** trajectory (not committed; engine-computed values stay in memory). Two consecutive `runReplay` calls produce bit-identical trajectories. At least one committed replay (`content/replays/1979_volcker_chair_strategy.json`) is loadable via `loadReplay`.

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

## Institution & governance
- **SPEC-GOV-1** `[design]` The Chair cannot be removed except for cause; the soft continue-gate is 4-year reappointment, not firing.
- **SPEC-GOV-2** `[design]` The Board turns over slowly (one 14-year seat ~every two years); FOMC voters include a yearly-rotating subset of regional presidents.

## Scenarios
- **SPEC-SCEN-1** `[testable]` A scenario schema (`schemas/scenario.schema.json`) and loader (`src/content/scenarios.ts`) produce an initial `GameState` from a content file (`content/scenarios/*.json`). Loader accepts an optional `requiredVars: string[]` and throws `MissingVarsError` listing absent keys — preventing the silent-default-to-0 failure mode. Schema constrains `name`/`desc` to localization-key shape `^[a-z][a-z0-9_.]+$` so inline player-facing strings fail `npm run validate`. The 1979 Volcker scenario loads cleanly and has `date == "1979-08"`, `history: []`, and the slice-1 required vars present.

## Data fog
- **SPEC-FOG-1** `[testable]` A pure `observe(state, seriesId, rng)` returns a fogged view of the true state variable, with `noise_scale` and `lag_months` parameters from `content/engine/params.json#fog[seriesId]` (validated by `schemas/engine-params.schema.json`). Lag indexing: `lag_months === 0` reads the current `state.vars[seriesId]`; `lag_months >= 1` reads `state.history[lag_months - 1].vars[seriesId]`; out-of-range falls back to the current value. Same seed + state → same observation.

## Committee
*`SPEC-COMM-1` and `SPEC-COMM-2` are one committee concern split into two PRs for review size; a future `SPEC-COMM-3` is reserved for genuinely-new committee work, not for further sub-splitting.*

- **SPEC-COMM-1** `[design]` A committee schema (`schemas/committee.schema.json`) and content (`content/committees/1979.json`) define members as `{ id, name (loc key), lean: "hawkish"|"dovish"|"neutral", competence: number in [0,1] }`. `name` is constrained to localization-key shape `^[a-z][a-z0-9_.]+$`. `npm run validate` accepts `content/committees/1979.json`. No engine changes in this SPEC. *(Slice-1 Phase 6: implementing PR upgrades to testable.)*
- **SPEC-COMM-2** `[design]` A pure `vote(committee, proposedRate, state): { decided, dissents }` simulates an FOMC vote: each member's preferred rate derives from their lean + current `inflation`/`unemployment`; `dissents` counts members where `|preferred - proposedRate| > params.committee.dissent_tolerance`; `decided` is `proposedRate` for slice 1 (the Chair sets it). Dissents output is consumed by the existing `applyMeetingOutcome` in `src/engine/credibility.ts` without modification to that function. *(Slice-1 Phase 7: implementing PR upgrades to testable.)*
