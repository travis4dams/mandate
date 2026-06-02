# Consensus Plan: MANDATE — Vertical Slice 2 (Rich engine + React inspector UI)

**Source spec:** `.omc/specs/deep-interview-mandate-slice-2-engine-and-react-ui.md`
**Mode:** `--consensus --direct` (RALPLAN-DR short mode)
**Status:** **consensus approved — pending execution approval** (Planner → Architect ×2 → Critic ×2, 2 iterations, max 5).

---

## RALPLAN-DR Summary

### Principles (5)

1. **Engine purity carries from slice 1.** No `Math.random()` / `Date.now()` in `src/**`; stochastic shocks via `mulberry32(seed)`. New tunables in **per-section content files** (`content/engine/phillips.json` etc.) — schema-governed. Engine functions return new state.
2. **Spec-first TDD continues.** Every SPEC: amend `spec/requirements.md` `[design]→[testable]` → failing test cites `// SPEC-XXX-N` → implementation → green PR. `tools/spec-trace.ts` is the heartbeat.
3. **Inspector, not UX.** Slice-2 web UI is a functional inspector that *exposes the engine enough to see it working*. Polish (typography, layout, animation, real four-question UX) is a follow-up slice using the `/frontend-design` skill.
4. **Deterministic verifier dominates.** `Session(seed)` → bit-identical trajectory. Calibration RMSE bounds are soft signals (warn); user's session demo is the hard gate.
5. **Consumer-driven Session API + parallel UI scaffold.** Engine and UI overlap: `SESSION-0` skeleton + UI scaffold (WEB-1/2) land early, in parallel with engine deepening. Engine SPECs update SESSION-0's internals; UI doesn't churn. (Synthesis-A — adopted from Architect antithesis.)

### Decision Drivers (top 3)

1. **Coherent macro dynamics + readouts.** Slice-2 done-test = engine produces directionally-correct trajectories under canned Volcker (CAL RMSE check) AND the player can advance time / propose rates / read state in a browser.
2. **Avoid UI starvation.** 9 engine SPECs sequentially would push the first visual render to month ~7. Synthesis-A (scaffold UI against `SESSION-0` skeleton in parallel) keeps the visual loop alive from week 2.
3. **AI-reviewer rhythm + user demo are the gates.** No `--admin` overrides. Per-PR claude-review APPROVE + `npm run check` green; user demo seals AC-DEMO.

### Viable Options

| | Option A (chosen, Synthesis-A) | Option B (pure parallel) | Option C (trim to Standard) |
|---|---|---|---|
| **Approach** | `PARAMS-1` (split content) + `SESSION-0` (skeleton) ship first → engine SPECs ∥ UI scaffold ∥ engine deepening → SESSION-1 wires the full integration → UI views consume Session → demo. | Both engine and UI churn against an ever-changing Session stub; UI re-renders on every engine PR. | Cut Rich to Phillips + Okun + CRED-4 only; ship UI sooner; polish in slice 3. |
| **Pros** | Engine-first contract clarity AND early UI feedback. Session API designed for the consumer (UI). No stub drift — `SESSION-0` is concrete, just sparse. Engine SPECs touch disjoint per-section content files (no serialization lock). | Faster nominal start. | Faster wall-clock. |
| **Cons** | Adds 2 pre-Phase-1 SPECs (PARAMS-1 + SESSION-0). | Stub drift → every engine PR re-touches UI files; reviews become noise. | User explicitly rejected this in deep-interview Round 6. |

**Why Synthesis-A:** Architect's antithesis identified UI starvation as a real cost of the original engine-first ordering. Synthesis-A keeps engine-first ordering for the deep dynamics while shipping a skeleton Session + UI scaffold immediately — UI consumes engine state from day-one, even when the engine state is sparse. Per-section content files (PARAMS-1) dissolve the `content/engine/params.json` serialization bottleneck.

---

## Requirements Summary

Take MANDATE from slice 1 (deterministic substrate + canned-Volcker constants) to **Vertical Slice 2: a player can browse to a single-screen React inspector, advance through the 1979 Volcker scenario one month at a time, propose rates at FOMC meetings, and watch the engine respond with directionally-correct inflation / unemployment / credibility dynamics on lags.** Engine adds Phillips + Okun + distributed lags + stochastic shocks + productivity + term structure + forward-guidance (engine-only). UI is a functional inspector via Vite + React 18.3 + TS.

**In scope:** 2 pre-phase SPECs (PARAMS-1, SESSION-0) + 9 engine SPECs (incl. SESSION-1 integration) + 6 UI SPECs + 2 calibration SPECs (CAL-2, CAL-3) + soft calibration thresholds in content. Deployment: build artifact only.

**Out of scope:** UI polish, design system, animation, mobile, multi-scenario, save/load, multiplayer, auth, telemetry, the three DESIGN.md open forks.

---

## Acceptance Criteria

### Section A — Pinned SPECs (19 total: 2 pre-phase + 9 engine + 6 UI + 2 calibration)

Every PR claude-review `VERDICT: APPROVE`; `npm run check` green (now includes `web/` typecheck); `spec:trace` covers every `[testable]` SPEC.

**Pre-Phase-1 SPECs (architectural plumbing, ship first):**

- **SPEC-PARAMS-1** *split engine params into per-section content files*. Refactor `content/engine/params.json` → 4 files at `content/engine/tick.json`, `content/engine/fog.json`, `content/engine/credibility.json`, `content/engine/committee.json`. The umbrella `engine-params.schema.json` is replaced by per-section schemas (`tick.schema.json`, `fog.schema.json`, `credibility.schema.json`, `committee.schema.json`); the umbrella schema file is deleted. **Migration enumeration (Critic MAJOR #1):**
  - `src/content/loader.ts`: today's `loadValidated(schemaPath, dir)` reads every `.json` in `dir`; post-split it would return 4 entries and every callsite does `loaded[0]` → guaranteed regression. Add a new helper `loadValidatedFile(schemaPath, filePath)` that validates a single file. **AJV cache (Architect pass 2 N3):** maintain a module-level `Map<schemaPath, ValidateFunction>` so the second call with the same schema does not re-invoke `ajv.compile`. Existing `loadValidated` keeps its directory-scan semantics for per-domain content (events, tech, scenarios, replays, committees, calibration).
  - `src/engine/clock.ts:11-37` (`loadHistorySize()`): switch to `loadValidatedFile("schemas/tick.schema.json", "content/engine/tick.json")`.
  - `src/engine/fog.ts:17-36` (module-level params load): switch to `loadValidatedFile("schemas/fog.schema.json", "content/engine/fog.json")`.
  - `src/engine/credibility.ts:108-127` (`loadCredibilityParams()`): switch to `loadValidatedFile("schemas/credibility.schema.json", "content/engine/credibility.json")`.
  - `src/engine/fomc.ts:95-122` (`loadCommitteeParams()`): switch to `loadValidatedFile("schemas/committee-params.schema.json", "content/engine/committee.json")`. **Naming (Architect pass 2 N1):** the engine-params committee section uses `schemas/committee-params.schema.json` (new file). The existing `schemas/committee.schema.json` for committee CONTENT (members, leans, competence) is unchanged and unrelated — no rename needed there.
  - `tools/validate-content.ts:28-41` (hardcoded single-file engine-params block): replace with a loop over the 4 new per-section files, validating each against its schema.
  - `tools/calibrate.ts`: does NOT touch engine-params today; no change needed.
  - **AC:** all 91 existing tests pass; `npm run check` green; spec-trace 15/15; `npm run validate` reports `✓ tick: 1 valid`, `✓ fog: 1 valid`, `✓ credibility params: 1 valid`, `✓ committee params: 1 valid` (4 new validate entries). Add a single new test `test/engine-params-loaders.test.ts` that (a) calls each loader once + asserts the loaded value matches the corresponding content file directly, and (b) **(Critic pass 2 MINOR-A)** asserts via `vi.spyOn(Ajv.prototype, 'compile')` that two `loadValidatedFile` invocations with the same schema path invoke `compile` exactly once (no timing-based fallback).
- **SPEC-SESSION-0** *skeleton Session façade*. New `src/engine/session.ts`: `class Session` with static factories (`Session.fromScenario(scenarioId, seed)`, `Session.fromReplay(replayId, seed)`), internal append-only `_trajectory: GameStateSnapshot[]`, `advance(months: number): void` (mutates `_trajectory`), `proposeRate(rate: number): FomcVote | null` (returns null when not on a meeting month), `reset(): void`, `setForwardGuidanceStance(stance: "hawkish"|"dovish"|"neutral"): void` (internal use until GUIDE-1 wires it; called by SESSION-1's integration test). Getters: `get current(): GameStateSnapshot` and `get trajectory(): readonly GameStateSnapshot[]`. Skeleton wraps existing `tick` + `vote` + `applyMeetingOutcome` from slice 1 — no new dynamics yet; engine SPECs flesh out internals between SESSION-0 and SESSION-1.

  **Getter identity contract (Critic MAJOR #2):** `current` and `trajectory` MUST return **referentially-stable** values: identity changes only when `advance()` / `proposeRate()` / `reset()` mutates state; consecutive calls with no mutation return the same object reference. This is the React 18 `useSyncExternalStore` contract: `getSnapshot` must be referentially stable across no-op reads or React warns `"getSnapshot should be cached"` and may cause tearing. Implementation: cache the current snapshot in a private field; rebuild only on mutation.

  **Subscribe protocol:** Session exposes `subscribe(listener: () => void): () => void` (returns unsubscribe). `useSession` React hook calls `useSyncExternalStore(session.subscribe.bind(session), () => session.current)`. Documented inline in `src/engine/session.ts`. **React-render purity (Architect pass 2 N5):** Session mutators (`advance`, `proposeRate`, `reset`, `setForwardGuidanceStance`) MUST NOT be called from React render code — only from event handlers, effects, or external schedulers. A mid-render mutation can flip the cached snapshot reference during commit, causing tearing under React 18 concurrent rendering. Document this as a contract in the JSDoc on `Session` itself.

  **Scenario seed contract (Critic MAJOR #4):** Seed is a constructor argument only. Scenarios never declare a `default_seed` in their content files. `Session(seed)` is the single source of stochastic determinism.

  **AC:** 
  - `Session.fromScenario("scen.1979_volcker", 42)` × 2 runs → identical `trajectory` arrays (deep-equal).
  - Identity-stability: call `s.current` twice with no `advance`; assert `===` (referentially equal). Call `s.trajectory` twice; assert `===`. After `s.advance(1)`, both references change.
  - Integration test plays a scripted 12-month session (`s.advance(12)`); asserts `s.trajectory.length === 12`, `s.current.date === "1980-08"`.
  - `s.subscribe()` listener fires on `advance`/`proposeRate`/`reset`; does NOT fire on getter reads.

**Engine deepening SPECs:**

- **SPEC-SIM-5** *output-gap state var + engine-vars registry + enforcement test*. `state.vars.output_gap` (signed number, default 0); `tick` updates it via a content-driven AR(1)-ish dynamic (per `content/engine/sim.json`, new). Per-section schema `schemas/sim.schema.json` (with `output_gap_ar1_coefficient` numeric in [0, 1] etc.).

  **Engine-vars registry (Critic MAJOR #3 + Architect pass 2 N2):** `docs/engine-vars.md` catalogues every `state.vars[*]` key with columns: `key | type | range | writers | readers | spec_id`. The dominant write pattern in this engine is the spread literal `{ ...state, vars: { ...state.vars, output_gap: x } }` — grep alone would yield false negatives. **Source-of-truth approach:** every engine module exports a `const KEYS = ["output_gap", ...] as const` tuple; SIM-5 introduces a new `src/engine/var-keys.ts` exporting `export type EngineVarKey = "credibility" | "expectations_anchor" | "months_below_anchor" | "policy_rate" | "inflation" | "unemployment" | "output_gap" | ...` (union of all known keys) plus a `EngineVarRegistry: readonly EngineVarKey[]` constant. The test `test/engine-vars-registry.test.ts` (a) imports the `EngineVarRegistry` constant, (b) parses `docs/engine-vars.md` table rows, (c) asserts the two sets match. New engine SPECs MUST extend the union AND the markdown table; TS itself fails the build if a module writes to a `state.vars[X]` key not in the union. Each subsequent engine SPEC's AC includes the line `"src/engine/var-keys.ts EngineVarKey extended for <new_key> + docs/engine-vars.md table row added."`

  **AC for SIM-5:** registry test passes; `output_gap` listed; given `output_gap = 0` and constant policy_rate, tick advances output_gap toward 0 (steady state).
- **SPEC-LAG-1** *distributed lag kernel*. `content/engine/lags.json` (new) with `policy_to_output_gap` weights summing to 1. `applyRateToOutputGap(state, rateHistory, params)` consumes recent rate history → updates output_gap. AC: 6-month half-life convergence test. Depends on SIM-5.
- **SPEC-PHILLIPS-1** *Phillips curve*. `applyPhillipsCurve(state, params): GameState`. `inflation_t+1 = expectations_anchor + α·output_gap + supply_shock + ε`. Content: `content/engine/phillips.json`. Depends on SIM-5 only (consumes output_gap; LAG-1 not a dependency — Architect F1 correction). AC: zero-gap + anchored expectations → inflation stable at target.
- **SPEC-OKUN-1** *Okun's law*. `applyOkun(state, params): GameState`. `unemployment_t+1 = natural_rate − γ·output_gap`. Content: `content/engine/okun.json`. Depends on SIM-5 + PROD-1 (natural_rate from productivity). AC: zero-gap → unemployment at natural rate.
- **SPEC-PROD-1** *productivity drift*. `state.vars.productivity` (default 1.0) drifts each tick by `drift_rate` from `content/engine/productivity.json`. Feeds Okun's `natural_rate = base_natural_rate + γ_prod × (productivity − 1.0)`. AC: with `drift_rate = 0.0006/month` (≈0.7%/year), productivity at month 89 is ≥ 1.05 and ≤ 1.07 (the strawman ~5% drift over 7 years claim is testable). `docs/engine-vars.md` updated for `productivity`. Parallel-able with SIM-5/LAG-1 batch (independent state var).
- **SPEC-TERM-1** *term structure*. `state.vars.long_rate` (default = `policy_rate`) follows `policy_rate` via EWMA: `long_rate_t+1 = α × policy_rate + (1 − α) × long_rate_t` with α from `content/engine/term.json` (suggest α=0.05/month → ~14-month half-life). AC: holding `policy_rate = 0.10` constant for 60 months, `long_rate` converges to within ±0.001 of 0.10; holding `policy_rate = 0.20` constant from `long_rate = 0.05` start, `long_rate` reaches midpoint by ~14 months. `docs/engine-vars.md` updated for `long_rate`. Parallel-able after SIM-5.
- **SPEC-SHOCK-1** *stochastic shocks*. Seeded supply-shock term feeding Phillips. Reuses `mulberry32`. Content: `content/engine/shocks.json`. **Depends on PHILLIPS-1 because it injects into PHILLIPS-1's signature** (the supply-shock term in `inflation_t+1 = expectations_anchor + α·output_gap + supply_shock + ε`). Not in the SIM-5 parallel batch for this reason. AC: same seed → same shock sequence (1000-tick deterministic test); long-run variance ≈ content `variance` ±10% across 10000 ticks. `docs/engine-vars.md` does not gain new keys (shocks affect inflation, which is already registered).
- **SPEC-GUIDE-1** *forward-guidance stance*. `state.vars.forward_guidance_stance ∈ {hawkish, dovish, neutral}`. Biases CRED-4 spiral's `recovery_rate` multiplicatively (content-driven `guidance_recovery_multiplier`). Content: extend `content/engine/credibility.json` (post PARAMS-1 split). **Must land before SESSION-1** (Architect F2): SESSION-1's integration test asserts hawkish-stance produces faster anchor recovery. AC: hawkish + recovering credibility → expectations re-anchor faster than neutral.
- **SPEC-SESSION-1** *Session fully wired*. SESSION-0 internals replaced with full month-tick chain: apply policy → LAG-1 (consume rateHistory) → output_gap → PHILLIPS-1 + OKUN-1 → CRED-4 spiral (modulated by GUIDE-1) → SHOCK-1 inject → fog applies on demand. AC: scripted hawkish-vs-neutral session shows faster recovery under hawkish stance; deterministic across two runs at same seed.

**UI SPECs (gated on SESSION-0 only — can begin in parallel with engine deepening):**

- **SPEC-WEB-1** *Vite + React 18.3 + TS scaffolding*. New `web/` subdirectory at repo root with its **own** `package.json` (not converted to npm workspaces — keep root simple). `web/package.json` declares React 18.3.x, react-dom 18.3.x, @observablehq/plot, @vitejs/plugin-react, vite 5.x, typescript 5.x, vitest 2.x. `web/vite.config.ts` + `web/tsconfig.json`. Root `package.json` gains script proxies: `web:install` → `cd web && npm ci`, `web:dev` → `cd web && npm run dev`, `web:build` → `cd web && npm run build` (Critic MINOR #8). Root `npm run check` extended (Architect F5): `tsc --noEmit && (cd web && tsc --noEmit) && npm run validate && npm run spec:trace && npm test`. **Install separated from check (Architect pass 2 N4):** `npm run check` does NOT run `npm install` in `web/` — it expects `web/node_modules` to exist; if missing, the `tsc --noEmit` step fails clearly and the runbook documents `npm run web:install` as the explicit setup step. CI runs `npm ci && npm run web:install` once before `npm run check`. AC: `npm run web:build` produces `web/dist/index.html` ≤ 500KB total bundle size; renders "MANDATE" placeholder; `npm run check` includes web typecheck and fails if web has type errors. `web/dist/` and `web/node_modules/` are gitignored.
- **SPEC-WEB-2** *Dashboard layout + Session adapter*. `<Dashboard />` React component. Single page: top half `<ChartsPanel />`, bottom half `<MeetingPanel />` + `<ControlBar />`. **Session adapter:** thin `useSession(scenarioId, seed)` React hook backed by `useSyncExternalStore` (Architect F4: Session owns trajectory; UI subscribes). Depends on SESSION-0.
- **SPEC-WEB-3** *Time-series charts*. `<ChartsPanel />` renders 4 series (inflation, unemployment, policy_rate, credibility) via `@observablehq/plot`. Fog overlay (gray band ± noise_scale). AC: snapshot test against the *chart data* (the array passed to Plot), not the SVG (Architect F9). Depends on WEB-2.
- **SPEC-WEB-4** *FOMC meeting panel*. `<MeetingPanel />` shows current committee, proposed-rate `<input>`, vote button. On click: `session.proposeRate(value)` → display dissents + credibility delta. AC: vitest-jsdom click test. Depends on WEB-2.
- **SPEC-WEB-5** *Control bar*. `<ControlBar />` exposes "advance 1 month" / "advance to next meeting" buttons + session reset. AC: click test. Depends on WEB-2.
- **SPEC-WEB-6** *Four-question tooltip (sparse)*. `<Tooltip>` wraps any number; on focus or hover shows 4 plain-text placeholder strings (what / how / levers / trust). Slice-2 strings are sparse (literally `"TODO: explain X"` is acceptable). AC: vitest-jsdom test renders an instrumented number (e.g., the inflation readout), fires `focus` event, asserts all 4 placeholder strings appear in the DOM tree under the tooltip. Polish slice replaces strings via `/frontend-design`. Depends on WEB-3+WEB-4.

**Calibration SPECs (split from monolithic Phase 2 per Architect F8):**

- **SPEC-CAL-2** *calibration thresholds content type + schema*. New `schemas/calibration-thresholds.schema.json` + `content/engine/calibration_thresholds.json` (initial values: policy_rate 0.005, inflation 0.03, unemployment 0.025). Register in `tools/validate-content.ts`. AC: schema + validate green. Doesn't touch the harness.
- **SPEC-CAL-3** *RMSE emit + soft gate*. Extend `tools/calibrate.ts` to compute three RMSEs against FRED data and emit them via stderr alongside the existing CSV. If any threshold breaches, print `WARN: <metric> RMSE <value> exceeds threshold <threshold>` but still exit 0. Depends on CAL-2 + SESSION-1 (uses `Session.fromReplay("replay.1979_volcker_chair_strategy", 42)` rather than calling `runReplay` directly — keeps tooling cleanly above the engine boundary).

### Section B — Calibration RMSE thresholds (soft)

Under canned Volcker via `Session.fromReplay`:
- `policy_rate` RMSE ≤ 0.005 (essentially exact; catches replay-machinery regressions)
- `inflation` RMSE ≤ 0.03 (directional, not predictive)
- `unemployment` RMSE ≤ 0.025

Soft: `npm run calibrate` exits 0 with `WARN:` on breach. User demo is hard gate.

### Section C — User demo + sign-off

After A + B green: user runs `npm run web:dev`, plays a complete Volcker session, posts approval. Ralph parks until this.

---

## Implementation Steps

### Phase 0 — Pre-phase plumbing (sequential, 2 PRs)

1. **SPEC-PARAMS-1** — split `content/engine/params.json` into per-section files. ~150 LoC change spread across loaders + validate-content + schemas. Tests still green.
2. **SPEC-SESSION-0** — skeleton Session class. ~120 LoC. Existing slice-1 engine logic unchanged; Session is a façade.

### Phase 1 — Engine deepening + UI scaffold (parallel within engine; UI in parallel after SESSION-0)

**Engine track (no serialization lock thanks to PARAMS-1):**

3. **SPEC-SIM-5** *(includes engine-vars registry — Architect F6)*
4. **Parallel batch (after SIM-5):** SPEC-LAG-1 ∥ SPEC-PHILLIPS-1 ∥ SPEC-OKUN-1 ∥ SPEC-PROD-1 ∥ SPEC-TERM-1 ∥ SPEC-GUIDE-1
   - PHILLIPS-1 needs SIM-5 only (Architect F1: not LAG-1).
   - OKUN-1 needs SIM-5 + PROD-1.
   - GUIDE-1 must merge before SESSION-1 (Architect F2).
5. **SPEC-SHOCK-1** — after PHILLIPS-1.
6. **SPEC-SESSION-1** — after all engine deepening SPECs. Replaces SESSION-0 internals.

**UI track (in parallel with engine after SESSION-0 lands):**

7. **SPEC-WEB-1** — scaffolding + `npm run check` extension to web typecheck.
8. **SPEC-WEB-2** — dashboard + Session adapter (consumes SESSION-0).
9. **Parallel batch after WEB-2:** SPEC-WEB-3 ∥ SPEC-WEB-4 ∥ SPEC-WEB-5
10. **SPEC-WEB-6** — wraps WEB-3/WEB-4 components.

**Convergence:** when SESSION-1 lands, the UI automatically picks up the deeper dynamics via its hook (no UI PR needed — the adapter doesn't care about engine internals).

### Phase 2 — Calibration extension (2 small PRs)

11. **SPEC-CAL-2** — thresholds content type + schema.
12. **SPEC-CAL-3** — RMSE emit + soft gate (uses `Session.fromReplay`).

### Phase 3 — Demo + sign-off

13. User plays `npm run web:dev`; posts approval; ralph cancels.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Engine calibration misses RMSE thresholds | High | Medium | Soft gate; content-tunable; user demo is hard gate. Slice-2 engine is simplification, not research-grade. |
| 19-SPEC elapsed time spirals | High | High | Per-SPEC 3-retry budget; checkpoint after every 3 PRs; parallelism dissolves serialization. |
| `web/` subdir conflicts with root `tsc` | Medium | Medium | WEB-1 explicitly extends root `npm run check` to web (Architect F5). |
| Stochastic shocks make tests flaky | Medium | High | All shocks via `mulberry32(seed)`; tests pin seeds. |
| Stub-drift in SESSION-0 (Architect antithesis concern) | Low | Medium | SESSION-0 is *concrete* (wraps existing engine), not a stub. Engine SPECs update its internals; UI never touches Session source. |
| Forward guidance overcommits architecturally | Medium | Low | GUIDE-1 biases CRED-4 spiral recovery rate only; not a transmission channel. Content-tunable. UI exposes post-slice. |
| User demo fails after 19 SPECs | Medium | High | Soft RMSE thresholds catch directional bugs before demo. CAL-3 + SESSION-1 land before user demo, so the calibration CSV is current. |
| Distributed lag kernel ships wrong-shape | Medium | Medium | LAG-1 ships with content-driven default (6-month half-life strawman); user re-tunes without code change. Documented as strawman, not calibrated. |
| Snapshot tests on Plot SVG flaky | High | Low | WEB-3 snapshots the *data* passed to Plot, not the SVG (Architect F9). |
| `useSyncExternalStore` boilerplate in Session adapter | Low | Low | ~15 LoC for the hook; React 18.3 has it built-in. |
| React version drift | Low | Low | Pin React 18.3.x explicitly in WEB-1 (Architect F7). |
| Engine-vars registry forgotten (cross-SPEC coordination gap) | Medium | Low | Folded into SIM-5's AC (Architect F6); each subsequent engine SPEC's AC includes "registry updated for new keys." |
| Session integration test seed unspecified | Medium | Medium | SESSION-0 constructor takes seed; SESSION-1 AC explicitly pins seed=42 for the integration test (Architect F10). |

---

## Verification Steps

1. **Per PR**: `gh pr checks N` shows all 4 jobs green; claude-review APPROVE.
2. **After SESSION-0**: `npm run check` green; integration test plays 12-month session deterministically.
3. **After WEB-1**: `npm run check` includes `(cd web && tsc --noEmit)`; `npm run web:build` produces artifact < 500KB.
4. **After SESSION-1**: integration test passes; chart panels in `npm run web:dev` show non-constant inflation/unemployment when canned Volcker plays out.
5. **After CAL-3**: `npm run calibrate` emits three RMSEs; any breach prints `WARN:` and the calibration CSV.
6. **End-of-slice**: `spec:trace` 34 testable / 34 covered (15 slice-1 + 19 slice-2).

---

## Tradeoff Tensions (acknowledged)

1. **Inspector vs polished UX.** Sparse tooltips, minimal styling. Polish slice uses `/frontend-design`. Trap: agents over-investing in CSS during slice 2; spec forbids.
2. **Rich engine fidelity vs slice length.** User signed up for Rich. Mitigation: parallelism + checkpoint re-assessment.
3. **Soft vs hard calibration gate.** Soft warns; user demo seals.
4. **Per-section content files vs single params.json debuggability.** Per-section files dissolve serialization lock at the cost of multiple files to eyeball when calibrating; tradeoff judged favorable for slice 2's parallel structure.
5. **Snapshot tests vs visual regression for Plot.** Data-snapshot is fast and stable; SVG snapshots are flaky. Slice 2 picks data-snapshot.
6. **Session as React store vs plain class.** Session is a *plain class*; React adapter (`useSession` hook) is the only thing that knows about React. Engine code never touches React.
7. **Engine-first vs UI-first.** Synthesis-A: engine-first ordering preserved, but UI scaffold runs in parallel against SESSION-0 from week 1. Best of both.
8. **19 SPECs vs slice scope.** PARAMS-1 + SESSION-0 + the CAL split add 4 SPECs over the original 15 (total 19); parallelism nets out to similar or shorter wall-clock.

---

## ADR-0002 — Slice 2: Rich engine + React inspector UI (Synthesis-A)

- **Status:** Accepted (consensus via Planner → Architect ×2 → Critic ×2, 2 iterations).
- **Date:** 2026-06-01
- **Authors:** Travis Adams (Chair), consensus from deep-interview-slice-2 + slice-2 omc-plan agents.
- **Source spec:** `.omc/specs/deep-interview-mandate-slice-2-engine-and-react-ui.md`

### Decision

Slice 2 ships **Rich macro-engine dynamics + a functional React inspector UI** in a single slice via **Synthesis-A**: pre-Phase plumbing (`PARAMS-1` splits engine params into per-section content files; `SESSION-0` ships a skeleton Session class with identity-stable getters and a `subscribe` protocol) lands first, then engine deepening (SIM-5 → LAG-1 ∥ PHILLIPS-1 ∥ OKUN-1 ∥ PROD-1 ∥ TERM-1 ∥ GUIDE-1, then SHOCK-1, then SESSION-1) runs in **parallel** with UI scaffold (WEB-1 → WEB-2 → WEB-3 ∥ WEB-4 ∥ WEB-5 → WEB-6) on top of SESSION-0. Calibration RMSE thresholds extend CAL-1 as a **soft gate** (warn, not fail); user demo is the hard gate. **19 SPECs total.**

### Drivers

1. **Coherent macro dynamics + readouts** — engine produces directionally-correct trajectories under canned Volcker (CAL RMSE check); player advances time, proposes rates, reads state in a browser.
2. **Avoid UI starvation** — UI scaffold lands against SESSION-0 in parallel with engine deepening; no 9-week "no visual" window.
3. **AI-reviewer rhythm + user demo are the gates** — per-PR claude-review APPROVE + `npm run check` green; user demo seals AC-DEMO; no `--admin` overrides.

### Alternatives considered

- **Option A (chosen, Synthesis-A):** engine-first ordering preserved, but UI scaffold runs in parallel against SESSION-0. PARAMS-1 dissolves the `content/engine/params.json` serialization lock via per-section files. ~19 SPECs.
- **Option B (pure parallel against stub Session):** rejected. Architect pass 1 antithesis flagged it as appealing; Critic + Architect pass 2 confirmed that without SESSION-0 as a concrete skeleton, UI work would churn on every engine PR (stub drift). Synthesis-A captures B's UI-feedback win without B's churn.
- **Option C (trim Rich to Standard, ship UI sooner):** explicitly rejected by user in deep-interview Round 6.

### Why chosen

Synthesis-A is the only path that (a) honors the user's explicit "Rich engine + functional UI in one slice" commitment, (b) avoids UI starvation, and (c) preserves engine-first contract clarity. The added pre-phase plumbing (PARAMS-1 + SESSION-0) is the explicit cost of doing A right — Architect pass 2 confirmed this is "the cost of doing A right, not a signal to switch."

### Consequences

- **Pre-phase plumbing burden:** PARAMS-1 + SESSION-0 ship before any visible engine deepening. ~270 LoC + 2 new test files + new schemas before SIM-5 even starts.
- **Soft calibration gate:** RMSE thresholds warn but don't fail. The trap (calibration-chasing) is avoided; the downside (two coherent-failing PRs could land before user catches them) is bounded by the 3-retry budget + user demo gate.
- **Per-section content files:** the `loadValidated` directory-scan stays for per-domain content; `loadValidatedFile` is the new helper for per-section engine params. Six existing callsites migrate.
- **TS source-of-truth registry:** new `src/engine/var-keys.ts` exports `EngineVarKey` union + `EngineVarRegistry` const; the engine-vars-registry test cross-checks against `docs/engine-vars.md`. New engine SPECs must extend both.
- **No npm workspaces:** `web/` is a self-contained subdir with its own `package.json`. `npm run check` does NOT run `npm install` in `web/` — `npm run web:install` is the explicit setup step.
- **Slice 2 wall-clock is large.** 19 SPECs × N review rounds is the explicit user commitment. Per-SPEC 3-retry budget + checkpoint-every-3-PRs caps the blast radius.
- **UI is functional, not polished.** `/frontend-design` skill applies in a follow-up slice.
- **Forward guidance UI lever** deferred to polish slice; engine models the stance internally (GUIDE-1).
- **Three DESIGN.md open forks** still deferred (banking-network granularity, FSOC peer mechanics, reappointment stakes).

### Follow-ups (post-slice-2, not gating)

- **Polish slice (uses `/frontend-design:frontend-design`):** typography, layout, color, animation, real four-question tooltip UX, mobile, multi-scenario picker.
- **`SPEC-CRED-5`** — move `CRED_MIN`/`CRED_MAX` + meeting-outcome weights to content (flagged in slice 1).
- **DESIGN.md open forks** — each as its own slice.
- **Save/load, multiplayer, deployment hosting** — post-polish.
- **Distribution-property tests** for FOG-1 + SHOCK-1 (mean/variance bounds across many seeds).
- **WEB-6 placeholder strings** rewritten by `/frontend-design` slice.
- **Browser engine purity** — engine modules use `import.meta.url`-based path resolution that may need adjusting for Vite's browser builds (could surface in WEB-2 when consuming SESSION-0).

---

## Changelog

- **Draft 1**: Initial Planner pass. 15 SPECs (9 engine + 6 UI). Sequential phases. Single `params.json`.
- **Draft 2 (post-Architect)**:
  - **Synthesis-A adopted:** Engine-first ordering preserved, but UI scaffold (WEB-1/2) runs in parallel after SESSION-0 lands. Avoids UI starvation (Architect antithesis).
  - **F1**: PHILLIPS-1's dependency edge corrected — needs SIM-5 only, not LAG-1.
  - **F2**: GUIDE-1 lands before SESSION-1; SESSION-1 AC asserts hawkish-stance effect.
  - **F3**: PARAMS-1 (new) splits `content/engine/params.json` into per-section files; dissolves serialization rule.
  - **F4**: SESSION-0 (new) ships a real skeleton Session class with internal trajectory + factory methods + `setForwardGuidanceStance`. `useSession` React adapter uses `useSyncExternalStore`.
  - **F5**: Root `npm run check` extended to typecheck `web/`.
  - **F6**: Engine-vars registry folded into SIM-5 AC.
  - **F7**: React 18.3.x pinned in WEB-1.
  - **F8**: Phase 2 split into CAL-2 (content type) + CAL-3 (RMSE emit).
  - **F9**: WEB-3 snapshots chart data, not SVG.
  - **F10**: Session takes seed in constructor; SESSION-1 pins seed=42.
  - SPEC count: 19 (was 15). Wall-clock expected ≤ original via parallelism.
- **Draft 3 (post-Critic)**: addresses 4 MAJOR + 4 MINOR + 5 WEAK ACs:
  - **MAJOR #1** PARAMS-1 — full migration enumeration (5 callsites + `loadValidatedFile` helper); new `test/engine-params-loaders.test.ts`. Renames engine-params committee schema to `committee-params.schema.json` to avoid colliding with the content `committee.schema.json`.
  - **MAJOR #2** SESSION-0 — getter identity contract for `useSyncExternalStore`; `subscribe` protocol; explicit identity-stability AC.
  - **MAJOR #3** Engine-vars registry — `test/engine-vars-registry.test.ts` grep-based enforcement; each engine SPEC AC adds "registry updated" line.
  - **MAJOR #4** Scenario seed pick-one — "constructor only; scenarios never declare default_seed."
  - **MINOR #5** SPEC count harmonized to 19 across §Requirements / Verification / Risks / Tradeoffs / Changelog.
  - **MINOR #6** SHOCK-1 ordering note added inline.
  - **MINOR #7** WEB-6 gains a vitest-jsdom focus/tooltip-render assertion.
  - **MINOR #8** WEB-1 explicit `cd web && npm run X` proxy form; no workspaces.
  - **WEAK ACs tightened**: PARAMS-1 (full migration list + new test); SESSION-0 (identity contract + integration test); PROD-1 (5% drift over 7 years measurable); TERM-1 (EWMA convergence + half-life measurable); WEB-6 (vitest-jsdom test).
- **Draft 4 (post-Architect pass 2)**: addresses 5 new findings, all inline edits — no structural change:
  - **N1**: `committee-params.schema.json` rename phrased as a single declarative sentence; explicit note that the existing content `committee.schema.json` is untouched.
  - **N2**: engine-vars registry test switched from grep to a TS source-of-truth (`src/engine/var-keys.ts` exporting `EngineVarKey` union + `EngineVarRegistry` const tuple) cross-checked against the markdown table. TS itself fails the build on unregistered writes.
  - **N3**: `loadValidatedFile` gains a module-level AJV-compile cache; PARAMS-1 AC includes a cache-test.
  - **N4**: `npm run check` separated from `npm install` — `npm run web:install` is the explicit setup step; CI runs it once.
  - **N5**: SESSION-0 contract adds "no Session mutators called from React render code" — guards against React 18 concurrent-render tearing.
- **Draft 5 (post-Critic pass 2, FINAL — consensus reached)**:
  - **MINOR-A**: AJV cache test pinned to `vi.spyOn(Ajv.prototype, 'compile')` invocation count; dropped the timing fallback.
  - ADR-0002 finalized; status set to **consensus approved — pending execution approval**.
  - Open questions (markdown→TS drift direction, render-purity enforcement) recorded as follow-ups.
