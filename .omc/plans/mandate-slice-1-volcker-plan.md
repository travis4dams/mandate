# Consensus Plan: MANDATE — Vertical Slice 1 (1979 Volcker, engine-only)

**Source spec:** `.omc/specs/deep-interview-mandate-slice-1-volcker.md`
**Mode:** `--consensus --direct` (RALPLAN-DR short mode)
**Status:** **consensus approved — pending execution approval** (Planner → Architect ×2 → Critic ×2, 2 iterations, max 5).

---

## RALPLAN-DR Summary

### Principles (5)

1. **Engine purity is the contract.** No `Math.random()` / `Date.now()` in `src/**`; randomness via `src/engine/rng.ts`; effects return new state. Enforced by CLAUDE.md + `claude-review.yml`.
2. **Spec-first TDD is the heartbeat.** Every change starts with an amendment to `spec/requirements.md` (a `SPEC-XXX-N` `[testable]` id), then a failing test citing that id, then the implementation. `tools/spec-trace.ts` fails CI if a testable id has no referencing test.
3. **Determinism is the verifier.** Golden-replay snapshot tests substitute for human eyeballing — the same seed + scenario + canned policy script produces a bit-identical trajectory. This is how ralph knows "did I break it."
4. **Minimum viable autonomy.** Ralph attempts ≤3 self-fix cycles per SPEC; on the 4th failure it pauses and pings the user with a diagnostic. The AI PR reviewer is the merge gate; the user is the appellate court, not the per-PR reviewer.
5. **Defer aggressively.** Anything not directly testing the credibility-and-expectations core is out of slice 1 — UI, forward guidance, balance sheet, international, supervision, mandate evaluator, FSOC, banking-network, talent draft. Recorded in §Non-Goals of the source spec.

### Decision Drivers (top 3)

1. **Verifiable model coherence under autonomy.** The slice must produce a deterministic, snapshot-verifiable answer to "does the credibility-and-expectations machinery, hit by the 1979 Volcker initial state under canned policy, produce plausible trajectories?" — produced *without* a human in the per-PR loop.
2. **Safe public-repo first push.** The first `git push origin main` must not break CI, not leak secrets, and not be legally ambiguous. Pre-push gap-fills (lockfile / LICENSE / runbook / ADR) are blocking, not nice-to-have.
3. **Unambiguous ralph queue with a deterministic stop.** Ralph must be able to read `spec/requirements.md` + `docs/ralph-runbook.md` and know exactly which SPEC is next, when to give up, when to stop the whole slice.

### Viable Options

| | Option A (chosen) | Option B | Option C |
|---|---|---|---|
| **Approach** | Engine-only + golden-replay snapshots; ralph executor; rate-only; ~6 SPECs. | Engine + minimal Ink TUI; user spot-checks each PR; ~8-9 SPECs. | Engine + LLM-as-playtester scoring each replay's plausibility; ~7 SPECs + new judge service. |
| **Pros** | Fastest path to verifiable model coherence. Deterministic verifier. Cleanest TDD/spec-trace alignment with existing CI. | Real human-playable surface from day one. Catches sign errors and unit confusion that snapshot tests will dutifully record as ground truth. | Fully autonomous *including* plausibility scoring. |
| **Cons** | Verifier is circular — snapshot tests verify "given my model, my model produces this" but not "the model is right." Mitigated by AC-9 eyeball + (post-slice) SPEC-CAL-1. | Sacrifices the autonomous-ralph design choice. Adds stack deps. | Introduces LLM noise in the verifier. Token cost grows per replay. Judge calibration is itself a hard problem. |

**Why Option A:** chosen by user in deep-interview Rounds 2 (engine-only + golden replays) and 3 (ralph background). The circular-verifier concern (Architect's antithesis) is absorbed by AC-9's eyeball check on the SIM-4 snapshot plus a planned post-slice **SPEC-CAL-1** calibration harness that compares the trajectory to actual FRED data once — this preserves Option A's determinism while neutralizing the "we won't notice sign errors" risk. Option B was implicitly rejected (Runtime/UX deferred in deep-interview Round 2). Option C is rejected for adding model-noise to a verifier that should be deterministic (Principle 3).

---

## Requirements Summary

Take MANDATE from the existing skeleton (engine primitives, content interpreters, vitest + spec-trace + AI PR review CI, no engine loop, no UI) to **Vertical Slice 1**: a deterministic, engine-only simulation seeded with 1979 Volcker, verified by committed golden-replay snapshot tests, implemented by `ralph` in a background loop after the repo is pushed to GitHub with all blocking pre-push gaps closed.

**In scope:** monthly calendar tick + bounded state history, scenario loader + 1979 content with required-vars assertion, data fog (reads from history), golden-replay harness, credibility de-anchoring spiral, FOMC committee schema/content + vote engine, pre-push gap fills (lockfile / MIT LICENSE / ralph runbook / ADR-0001), consolidated engine-params content + schema.

**Out of scope** (recorded in source spec §Non-Goals): UI/CLI/TUI, forward guidance, balance-sheet policy, international, supervision, mandate-evaluator, three open DESIGN.md forks.

---

## Acceptance Criteria (testable)

All criteria below have a verifier (command output, file path, or PR-review outcome). Ralph's `done` = AC-1..AC-8 green; AC-9 is the user's manual sign-off gate.

- [ ] **AC-1 (Pre-push readiness).** Before the first `git push origin main`:
  - [ ] `package-lock.json` at repo root, consistent with `package.json` (verifier: `npm ci` exits 0 in a clean checkout).
  - [ ] `LICENSE` at repo root with MIT text + user copyright line.
  - [ ] `docs/ralph-runbook.md` exists; contains §Verifier, §Task queue, §TDD cycle, §Budget, §Stop (per §P0.3 below).
  - [ ] `docs/adr/0001-vertical-slice-1.md` exists with the six ADR fields (per §P0.4 below).
- [ ] **AC-2 (SPEC-SIM-3 calendar tick + bounded state history).** `src/engine/clock.ts` exports `tick(state: GameState, months: number): GameState`. The function (a) returns a new `GameState`, (b) advances `state.date` by exactly `months` months on the `YYYY-MM` calendar, (c) maintains a bounded `GameState.history: GameStateSnapshot[]` of the last K snapshots (K from `content/engine/params.json#tick.history_size`, default 24), (d) does not mutate input. `GameState` interface in `src/engine/state.ts` extended with `history: GameStateSnapshot[]` where `GameStateSnapshot = { date: string; vars: Record<string, number>; flags: Record<string, boolean> }` (i.e. a non-recursive snapshot). **History convention (locked):** `state.history` excludes the current state; `history[0]` is the most-recent prior snapshot (i.e., `date − 1 month` after a 1-month tick). Callers needing the current snapshot must read it directly from `state`. Test file references `SPEC-SIM-3`. `spec/requirements.md` lists SPEC-SIM-3 as `[testable]`. **Rationale:** monthly cadence matches FOMC meeting and replay-harness use; bounded history is a substrate concern owned by `tick`, not by FOG-1 or CRED-4 (Architect F1, F2, F6); convention added per Critic Defect #2.
- [ ] **AC-3 (SPEC-SCEN-1 scenario loader + required-vars assertion).** `schemas/scenario.schema.json` (draft 2020-12) exists and validates `content/scenarios/1979_volcker.json`. **Schema constrains `name` and `desc` to localization-key shape via `"pattern": "^[a-z][a-z0-9_.]+$"`** so a literal player-facing string in a content file fails `npm run validate` (Critic Defect #3). `src/content/scenarios.ts` exports `loadScenario(id: string, requiredVars?: string[]): GameState`. When `requiredVars` is provided, the loader **throws** `MissingVarsError` if any key is missing — preventing the silent-default-to-0 failure mode. Slice 1 callers pass `["inflation", "unemployment", "credibility", "expectations_anchor", "policy_rate", "months_below_anchor"]`. The 1979 Volcker scenario produces an initial `GameState` with `date == "1979-08"`, the required vars present, and `history: []`. Test references `SPEC-SCEN-1`. `npm run validate` is green. **Rationale:** Architect F4 inversion — promote the silent-default-to-0 mitigation into the SPEC; Critic Defect #3 — schema-level loc-key shape guard.
- [ ] **AC-4 (SPEC-FOG-1 data fog).** `src/engine/fog.ts` exports `observe(state: GameState, seriesId: string, rng: () => number): number`. Noise (`noise_scale`) and lag (`lag_months`) parameters live in `content/engine/params.json#fog[seriesId]` and are validated by `schemas/engine-params.schema.json`. **Lag indexing (locked per Architect pass 2 F9):** when `lag_months === 0`, `observe` reads the series from the *current* `state.vars[seriesId]`; when `lag_months >= 1`, it reads from `state.history[lag_months - 1].vars[seriesId]`; when `state.history.length < lag_months`, it gracefully falls back to the current value. This indexing is consistent with the AC-2 history convention (current excluded; `history[0]` = `date − 1 month`). Given a fixed seed and fixed state, two calls return identical values. **FOG-1 has no upstream dependency on SIM-4** and can be worked in parallel after SIM-3 lands. Test references `SPEC-FOG-1`. **Rationale:** Architect F1 — FOG-1 only reads history, never owns it; Architect pass 2 F9 — zero-lag must read current state, otherwise it would silently return last-month data.
- [ ] **AC-5 (SPEC-SIM-4 golden-replay harness).** `test/replay.ts` (test utility) exports `replay(scenarioId: string, policyScript: PolicyScript, seed: number, months: number): GameState[]`. The replay records the **true** trajectory (not fogged observations), advancing one month per step via `tick`, applying `policyScript[date]` if defined, and returning the trajectory. At least one committed snapshot lives under `test/golden/1979_volcker_tightening.snap.json` and matches the function's output deterministically. **FOG-1 is not upstream of SIM-4** — the snapshot does not include fogged values; FOG-1 and SIM-4 may be parallelized after SIM-3. Test references `SPEC-SIM-4`. **Rationale:** Architect F5 — snapshot scope makes the parallel-able boundary explicit.
- [ ] **AC-6 (SPEC-CRED-4 de-anchoring spiral).** The `it.todo("models a self-reinforcing de-anchoring spiral …")` in `test/credibility.test.ts` becomes a passing `it(...)` that asserts: each tick where `credibility < ANCHOR_THRESHOLD`, the `months_below_anchor` counter in `state.vars` increments; once `months_below_anchor >= params.consecutive_months`, the gap between `expectations_anchor` and target inflation widens by `params.drift_per_period` per month and does not mean-revert until credibility returns above threshold (at which point recovery proceeds at `params.recovery_rate`). Params live in `content/engine/params.json#credibility` (validated by `schemas/engine-params.schema.json`). Test references `SPEC-CRED-4`. **Rationale:** Architect F2 — explicit counter is the cleanest signal; F4 — consolidated schema instead of `content/credibility/params.json` orphan.
- [ ] **AC-7a (SPEC-COMM-1 committee schema + content).** `schemas/committee.schema.json` defines members as `{ id, name (localization key), lean: "hawkish" | "dovish" | "neutral", competence: number in [0,1] }`, with `name` constrained to loc-key shape via the same `"pattern": "^[a-z][a-z0-9_.]+$"` used in AC-3 (Critic Defect #4). `content/committees/1979.json` provides ~7 members reflecting the 1979 FOMC composition. `content/localization/en.json` gains the member-name keys. `npm run validate` green. No engine changes in this SPEC. **Rationale:** Architect F3 — schema/content lands first so content validates in CI before engine is touched; Critic Defect #4 — loc-key shape guard mirrored from scenarios.
- [ ] **AC-7b (SPEC-COMM-2 FOMC vote engine).** `src/engine/fomc.ts` exports `vote(committee: Committee, proposedRate: number, state: GameState): { decided: number; dissents: number }`. Each member computes a preferred rate from their lean + current `inflation`/`unemployment`; `dissents` = count where `|preferred - proposed| > tolerance` (tolerance from `content/engine/params.json#committee.dissent_tolerance`). `decided` = `proposedRate` (Chair sets it for slice 1). The output is consumed by `applyMeetingOutcome` in `src/engine/credibility.ts:25` without modification to that function. Test references `SPEC-COMM-2` (re-uses fixtures from 7a). **Rationale:** Architect F3 — engine + integration in a focused PR.
- [ ] **AC-8 (CI green throughout).** For every PR ralph opens, the four CI jobs (`CI`, `Validate Content`, `Spec Check`, `claude-review`) are green. The `claude-review` summary starts with `VERDICT: APPROVE`.
- [ ] **AC-9 (Sanity replay — human gate).** At least one committed snapshot under `test/golden/` produces a trajectory the user *eyeball-approves* in a PR comment ("looks plausible" or equivalent). This is the only non-automated AC and is the user's gate, not ralph's. **Ralph's "done" is AC-1..AC-8.** Ralph parks the loop after opening the SPEC-SIM-4 PR and waits for user sign-off before resuming on CRED-4 / COMM-1. **Rationale:** Architect F7 — make the human-gate explicit so ralph doesn't loop trying to "verify" AC-9 autonomously.

---

## Implementation Steps

### Phase 0 — Pre-push gap-fills (blocking; one PR per item, or one bundled PR by the user)

- **P0.0** Verifier sanity: confirm `package.json` line 13 already defines `"check": "npm run typecheck && npm run validate && npm run spec:trace && npm test"`. (Architect pass 2 F11 — confirmed present; this step is a smoke check, not a code change. If absent or renamed in the future, P0.0 becomes the corrective action.)
- **P0.1** Generate lockfile: `npm install`; commit `package-lock.json` only. **The author MUST, before the first `git push origin main`, perform a fresh `git clone` of the not-yet-pushed repo and run `npm ci && npm run check` and observe exit 0 — this is the one moment in the slice where the verifier is exercised without CI in front of it** (Critic Defect #6). Document the observed outcome in ADR-0001 §Consequences.
- **P0.2** `LICENSE` (MIT) with the user's copyright line.
- **P0.3** `docs/ralph-runbook.md`. Required sections (verbatim headings):
  - `## Verifier` — "Run `npm run check` (typecheck + validate + spec:trace + test). All four must exit 0."
  - `## Task queue` — "Open `spec/requirements.md`. Slice-1 ordered queue: **SPEC-SIM-3, SPEC-SCEN-1, [SPEC-FOG-1 ∥ SPEC-SIM-4], SPEC-CRED-4, SPEC-COMM-1, SPEC-COMM-2**. FOG-1 and SIM-4 may be parallelized after SIM-3 lands (both depend on SIM-3, neither depends on the other). **Serialization rule (Critic):** any two PRs that both modify `content/engine/params.json` MUST be merged sequentially, not in parallel — ralph waits for the upstream PR to merge before opening the next one that touches that file. Concretely: SPEC-CRED-4 and SPEC-COMM-2 both add sections to that file, so they cannot share a queue slot."
  - `## TDD cycle` — "(1) amend `spec/requirements.md`, (2) failing test citing `// SPEC-XXX-N`, (3) implement until green, (4) PR. CLAUDE.md is the contract."
  - `## Budget` — "3 self-fix cycles per SPEC after failed `npm run check` or AI-reviewer `REQUEST_CHANGES`. On the 4th failure, pause and post diagnostic. Never bypass hooks (`--no-verify`, `--no-gpg-sign`, etc.). **Budget pauses when the loop parks** (Architect pass 2 tradeoff #3): only `npm run check` failures or `REQUEST_CHANGES` consume retries. While ralph is parked awaiting AC-9 sign-off, the retry counter does not advance regardless of wall-clock time. **If a `REQUEST_CHANGES` arrives while parked, it is queued — not consumed — until the user lifts the park** (Critic pass 2 item 9 clarification)."
  - `## Stop` — "Slice 1 ralph-done = AC-1..AC-8 in `.omc/plans/mandate-slice-1-volcker-plan.md` all green. AC-9 is the user's human gate. After opening the SIM-4 PR, **park** the loop and wait for the user's `looks plausible` comment before resuming on CRED-4."
- **P0.4** `docs/adr/0001-vertical-slice-1.md` with: `## Decision`, `## Drivers`, `## Alternatives considered`, `## Why chosen`, `## Consequences`, `## Follow-ups`.
- **P0.5** Amend `spec/requirements.md` registering: `SPEC-SIM-3`, `SPEC-SCEN-1`, `SPEC-FOG-1`, `SPEC-SIM-4`, `SPEC-COMM-1`, `SPEC-COMM-2` as `[design]` (NOT `[testable]` upfront — this was a defect in Drafts 1-5 that survived all four consensus passes; registering as `[testable]` without a referencing test in `test/**` causes `npm run spec:trace` to fail with orphan-SPEC errors, breaking AC-1's `npm run check exits 0` invariant). Each Phase N implementing PR then flips its SPEC's tag from `[design]` to `[testable]` as part of the TDD cycle (step 1: amend tag; step 2: write failing test citing the id; step 3: implement). `SPEC-CRED-4` is the exception: its existing `it.todo` in `test/credibility.test.ts:36` already contains the `// SPEC-CRED-4` comment, so it can be `[testable]` immediately. **Naming note** (Architect pass 2 F8): annotate the `SPEC-COMM-1` and `SPEC-COMM-2` rows with "*split for PR-size, single committee concern*" so future agents do not allocate `SPEC-COMM-3` to an unrelated committee feature. **Spec-trace caveat:** never use the literal token `[testable]` in narrative text on any line in `spec/requirements.md` — the parser at `tools/spec-trace.ts:13-15` is line-based and treats any `[testable]` substring as a tag, including in parentheticals. Use bare "testable" in narrative.
- **Push gate:** user generates `CLAUDE_CODE_OAUTH_TOKEN` via `claude setup-token`, adds as the repo secret named in `claude-review.yml`. Optionally branch-protect `main` so the four CI jobs are required status checks.

### Phase 1 — SPEC-SIM-3 (calendar tick + bounded state history) — bootstrap

- Extend `src/engine/state.ts`: add `history: GameStateSnapshot[]` to `GameState`; export `GameStateSnapshot` type (a non-recursive snapshot — flat `date/vars/flags`).
- New `src/engine/clock.ts`: `tick(state, months): GameState` returns a new state with `date` advanced N months on the `YYYY-MM` calendar, `history` updated by pushing the *prior* snapshot and truncating to `params.tick.history_size` (default 24).
- New `content/engine/params.json` + `schemas/engine-params.schema.json` (consolidated): root sections `tick`, `fog`, `credibility`, `committee`. Validate via existing `loadValidated`.
- New `test/clock.test.ts` referencing `// SPEC-SIM-3`. Cases: 1-month advance crosses year on Dec→Jan; input state JSON-stringify-equal before/after; history capped at size; zero-month advance is a pure clone.
- Update `src/index.ts` exports.

### Phase 2 — SPEC-SCEN-1 (scenario loader + required-vars assertion)

- `schemas/scenario.schema.json` (draft 2020-12): `id` pattern `^scen\.[a-z0-9_]+$`, `name` (loc key), `date` (`YYYY-MM`), `vars` (`Record<string, number>`), `flags` (`Record<string, boolean>`), optional `desc` (loc key).
- `content/scenarios/1979_volcker.json` — strawman vars: `inflation 0.114`, `unemployment 0.058`, `credibility 25`, `expectations_anchor 0.090`, `policy_rate 0.1075`, `months_below_anchor 6`. `name` and `desc` are **literal loc keys** (e.g. `"name": "scen.1979_volcker.name"`), never inline player-facing strings — schema regex enforces this.
- `src/content/scenarios.ts` exports `loadScenario(id, requiredVars?: string[]): GameState`. Throws `MissingVarsError` listing all absent keys. Returns `GameState` with `history: []`.
- `content/localization/en.json` gains `scen.1979_volcker.name`, `scen.1979_volcker.desc`.
- `test/scenarios.test.ts` cites `// SPEC-SCEN-1`. Cases: 1979 Volcker loads cleanly; loader throws on missing required var; schema validator rejects malformed file.

### Phase 3 — SPEC-FOG-1 (data fog; parallelizable with SIM-4 after SIM-3)

- `src/engine/fog.ts`: `observe(state, seriesId, rng): number`. Reads `fog[seriesId]` from `content/engine/params.json`. Noise: Box-Muller via `rng`. Lag: walks `state.history` back `lag_months` snapshots and reads the same `seriesId`; falls back to current value when history is shorter than lag.
- Extend `content/engine/params.json` `fog` section with per-series entries for `inflation`, `unemployment`, `policy_rate`, `expectations_anchor` (lower noise on policy_rate; higher noise/lag on expectations).
- `test/fog.test.ts` cites `// SPEC-FOG-1`. Cases: same seed → same value; `noise_scale=0, lag_months=0` → exact truth; `lag_months > history.length` → graceful current-value fallback; non-zero lag returns a past value.

### Phase 4 — SPEC-SIM-4 (golden-replay harness; parallelizable with FOG-1 after SIM-3)

- `test/replay.ts` (test utility, NOT engine code) exports `replay(scenarioId, policyScript, seed, months): GameState[]`. Loads scenario → seeds RNG → loop `months` times: apply `policyScript[date]` partial-update to vars if defined; call `tick(state, 1)`; record snapshot. Returns array.
- `PolicyScript = Record<YYYY-MM, Partial<{ policy_rate: number }>>` for slice 1.
- `test/golden/1979_volcker_tightening.snap.json` — committed snapshot of trajectory for canned Volcker tightening: policy_rate ramps to ~20% by mid-1981, decays to ~6% by 1986. Snapshot fields: `date, policy_rate, inflation, credibility, expectations_anchor` per month. **No fog values in the snapshot.**
- `test/replay.test.ts` cites `// SPEC-SIM-4`. Cases: same seed + same policy → bit-identical trajectory; snapshot equality; trajectory length matches `months` input.

### Phase 5 — SPEC-CRED-4 (de-anchoring spiral) — requires SIM-4 sign-off first

- Extend `src/engine/credibility.ts`: `applyMonthlySpiral(state, params): GameState` (pure). Algorithm (locked, no ambiguity): if `credibility < ANCHOR_THRESHOLD`, increment `state.vars.months_below_anchor` and, when `months_below_anchor >= params.consecutive_months`, widen `expectations_anchor` toward target inflation by `params.drift_per_period` per month. If `credibility >= ANCHOR_THRESHOLD`, `months_below_anchor` is **frozen (not reset)**; `expectations_anchor` recovers toward target inflation by `params.recovery_rate` per month until the gap is closed (Critic Defect #5).
- Extend `content/engine/params.json` `credibility` section with `consecutive_months`, `drift_per_period`, `recovery_rate`.
- Replace `it.todo` in `test/credibility.test.ts` with passing `it(...)` citing `// SPEC-CRED-4`. Cases: below-threshold for `consecutive_months` → expectations gap widens monotonically; above-threshold restoration → drift stops then recovers; spiral activation is reproducible from `1979_volcker` initial state when policy is held flat.

### Phase 6 — SPEC-COMM-1 (committee schema/content) — parallel-safe with Phase 5

- `schemas/committee.schema.json`: members `{ id, name (loc key), lean: "hawkish"|"dovish"|"neutral", competence: [0,1] }`.
- `content/committees/1979.json`: ~7 members.
- `content/localization/en.json` gets member-name keys.
- `test/committee.test.ts` (or a slice of `test/content.test.ts`) cites `// SPEC-COMM-1`. Cases: validator accepts 1979 committee; rejects malformed member.

### Phase 7 — SPEC-COMM-2 (FOMC vote engine)

- `src/engine/fomc.ts`: `vote(committee, proposedRate, state): { decided, dissents }`. Each member's preferred rate = simple Taylor-ish blend of lean + inflation + unemployment (params tunable in `content/engine/params.json#committee`). Dissents = count where `|preferred - proposed| > dissent_tolerance`. `decided = proposedRate`.
- Wire output into existing `applyMeetingOutcome(credibility, { dissents, … })` at a higher-level call site (e.g., a smoke test that constructs the chain). Do not modify `credibility.ts`.
- `test/fomc.test.ts` cites `// SPEC-COMM-2`. Cases: hawkish-majority + low-rate proposal → many dissents; neutral committee + median rate → zero dissents; chained smoke test shows dissents → `applyMeetingOutcome` → reduced credibility.

### Phase 8 — Sanity replay PR (AC-9, human gate)

- Bundled into SPEC-SIM-4's PR. Ralph posts the trajectory chart (or table) in the PR body and explicitly requests an `looks plausible` (or equivalent) comment from the user before resuming the loop on CRED-4.

### Phase 9 (post-slice, optional) — SPEC-CAL-1 (calibration harness)

- `tools/calibrate.ts` runs the 1979 Volcker golden replay and emits a CSV of `(date, inflation, unemployment, policy_rate, credibility)`. User compares once against FRED data for 1979-1986 (inflation falls ~13% → ~4% by 1983; unemployment peaks ~10.8% late 1982). Mismatch → tune content params, not engine code. **Not gating slice 1; absorbs the Architect's antithesis about circular verification.**

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Ralph stalls on a hidden inter-SPEC dependency | Medium | High | Runbook orders the queue + marks the FOG-1∥SIM-4 parallel boundary explicitly. SIM-3 is bootstrap. |
| Golden-replay snapshots become brittle as engine tuning evolves | Medium | Medium | Snapshot scope is one seed + one canned policy. Re-baselining requires PR-review approval. **Tension with autonomy** (next row). |
| Snapshot brittleness undermines ralph's 3-retry budget | Medium | Medium | Numerical tweaks that change the snapshot trigger AC-9 (human gate). Park-the-loop after SIM-4 PR until user approves. This is a *designed* friction, not a bug. |
| Verifier is circular — model is deterministic but possibly *wrong* (sign errors, unit confusion) | Medium | High | AC-9 eyeball check on the SIM-4 snapshot. Post-slice **SPEC-CAL-1** does a one-shot FRED comparison. (Architect's antithesis absorbed.) |
| Stochastic dynamics (fog) test only determinism, not distribution shape | Low | Medium | FOG-1 tests verify determinism + bounds; distribution-shape tests deferred to post-slice. Documented in §Tradeoff tensions below. |
| SPEC-CRED-4 spiral overshoots / produces wildly implausible trajectories | Medium | Medium | AC-9 gates merge of CRED-4 (since SIM-4 snapshot will visibly change). Params are content-tunable. |
| Schema fragmentation across `events/`, `tech/`, `scenarios/`, `fog/`, `credibility/`, `committees/` | Medium | Low | Engine-tunable params consolidated into one `content/engine/params.json` + one `schemas/engine-params.schema.json`. Content directories per domain remain. Documented in `docs/adr/0001-vertical-slice-1.md` §Consequences. |
| AI PR reviewer inconsistent across PRs (false REQUEST_CHANGES) | Medium | Low | Reviewer advisory; `npm run check` is the deterministic gate. 3-retry budget burns through transients; the 4th failure pings the user. |
| Lockfile drift on a different Node version | Low | Medium | Node version pinned to 20 in CI; documented in runbook. |
| Required-vars assertion in `loadScenario` rejects content that *should* default | Low | Low | Scenarios opt into requiredVars by passing the list at the call site. Default to no required vars when omitted. |
| `state.history` ring grows unbounded in tests that don't go through `tick` | Low | Low | `tick` is the only writer to `history`. Tests that build a `GameState` directly start with `history: []`; this is documented in `state.ts`. |
| User secret `CLAUDE_CODE_OAUTH_TOKEN` accidentally committed | Very low | High | Token is a GitHub repo secret only; never written to a file. Consider a pre-commit pattern guard later (not gating). |
| **SPEC id naming convention drift breaks `tools/spec-trace.ts` silently** (e.g., `SPEC-COMM-1a` was rejected by the `/\bSPEC-[A-Z]+-\d+\b/g` regex — confirmed empirically by the Critic; would cause `spec:trace` to exit 0 without checking that SPEC's tests) | Low | High | Every new SPEC id must round-trip through the regex. Runbook §TDD cycle requires: `node -e "console.log('SPEC-FOO-1'.match(/\\bSPEC-[A-Z]+-\\d+\\b/g))"` returns the id, or the id is invalid. Reject compound suffixes (`-1a`, `-1.1`, etc.) — split into separate ids instead. |
| **Inline player-facing string smuggled into content via permissive schema** (e.g., `name: "Volcker Disinflation"` instead of `name: "scen.volcker.name"`) | Low | Medium | Schemas constrain loc-key fields with `"pattern": "^[a-z][a-z0-9_.]+$"`; `npm run validate` rejects strings outside this shape. AC-3 and AC-7a apply this guard. |
| **Parallel ralph PRs race on `content/engine/params.json`** (CRED-4 adds `credibility` section, COMM-2 adds `committee` section; concurrent edits cause merge conflicts or silent drop of one section) | Medium | Low | **Runbook discipline (not an engine guarantee — Architect pass 2 F10):** before opening any PR that touches `content/engine/params.json`, ralph runs `gh pr list --state open --search "content/engine/params.json"` and aborts if any result returns. The runbook §Task queue enforces this as a pre-open checklist item, *not* as a refusal-by-engine. |

---

## Verification Steps

1. **After P0** in a fresh clone: `npm ci && npm run check` exits 0. First push CI green on all four jobs.
2. **After each Phase N PR**: `CI`, `Validate Content`, `Spec Check`, `claude-review` all green; reviewer comment `VERDICT: APPROVE`.
3. **After Phase 4 (SIM-4)**: `test/golden/1979_volcker_tightening.snap.json` exists; `npm test` twice produces no diff; the seed parameter genuinely controls reproducibility (changing the seed changes the snapshot).
4. **AC-9 sign-off**: in the SIM-4 PR, the user comments "looks plausible" (or equivalent). Ralph resumes the loop on CRED-4 only after this.
5. **After Phase 7 (COMM-1b)**: smoke test chains `vote → applyMeetingOutcome → credibility delta` to prove integration with existing `credibility.ts`.
6. **End of slice**: `npm run spec:trace` exits 0 — every `[testable]` SPEC id has a referencing test. SIM-3, SCEN-1, FOG-1, SIM-4, CRED-4, COMM-1a, COMM-1b all appear in `// SPEC-XXX-N` test comments. SPEC-CAL-1 (post-slice) is the only follow-up tracked.

---

## Tradeoff Tensions (acknowledged explicitly)

1. **Schema-per-concern vs. fragmentation.** Engine-tunable knobs consolidated into `content/engine/params.json`; per-domain content (scenarios, committees, events, tech) keeps its own directory. Trade is: discovery (one place for knobs) vs. flexibility (per-domain authors don't fight one another's schema).
2. **Snapshot brittleness vs. autonomy.** Numerical tweaks that change the SIM-4 snapshot will require AC-9 re-approval. This is a deliberate human gate on numerical reality, not an autonomy bug. Documented in ralph runbook §Stop.
3. **Stochastic determinism vs. distributional correctness.** FOG-1 verifies *determinism* (same seed → same value) but not the *distribution shape* of fogged observations. Distribution-property tests deferred to post-slice (could pair with SPEC-CAL-1).
4. **Loc-key pattern duplication vs. shared `$ref`** (Architect pass 2). The `"pattern": "^[a-z][a-z0-9_.]+$"` constraint is inlined in `schemas/scenario.schema.json` and `schemas/committee.schema.json` instead of being centralized in a `schemas/loc-key.schema.json` shared definition. Existing `schemas/event.schema.json` / `schemas/tech.schema.json` don't enforce the pattern at all today — slice 1 thereby creates a partial fork in the loc-key contract. Trade: per-schema duplication (current — simpler, no `$ref` resolver concerns) vs. shared `$ref` (cleaner, adds a dependency on `loadValidated` resolving cross-schema refs). Tracked as a post-slice harmonization follow-up, not gating.
5. **Frozen `months_below_anchor` vs. credibility scar tissue** (Architect pass 2). Phase 5 locks "frozen, not reset" — a scenario where credibility briefly recovers then dips again retains stale counter state and re-triggers the spiral instantly. This is a *modeling choice* (it represents persistent inflationary memory à la stagflation), not a correctness invariant. Documented here so future tuners know it's a knob, not a bug. If undesired, swap to "reset on recovery" by changing one line in `applyMonthlySpiral`; no engine refactor required.

---

## ADR-0001 — Vertical Slice 1: Engine-only + 1979 Volcker + Golden Replays + Ralph

### Decision

Vertical Slice 1 of MANDATE is an **engine-only, deterministic simulation seeded with the 1979 Volcker stagflation scenario**, verified by **committed golden-replay snapshot tests**, implemented by **`ralph` running autonomously in a background loop** after the repo is pushed to GitHub with all blocking pre-push gaps closed. The slice ships six SPECs: `SPEC-SIM-3` (monthly calendar tick + bounded state history), `SPEC-SCEN-1` (scenario loader + required-vars assertion + 1979 Volcker content), `SPEC-FOG-1` (data fog mechanic, reads from history), `SPEC-SIM-4` (golden-replay harness), `SPEC-CRED-4` (de-anchoring spiral, completing the existing TODO), and `SPEC-COMM-1 / SPEC-COMM-2` (committee schema/content + FOMC vote engine, one concern split into two PRs for review size).

### Drivers

1. **Verifiable model coherence under autonomy** — the slice must produce a deterministic, snapshot-verifiable answer to "does the credibility-and-expectations machinery, under the 1979 initial state and canned policy, produce plausible trajectories?" — without a human in the per-PR loop.
2. **Safe public-repo first push** — the first `git push origin main` must not break CI, leak secrets, or be legally ambiguous. Pre-push gap-fills (lockfile, MIT LICENSE, ralph runbook, ADR-0001 itself, registered SPEC ids) are blocking.
3. **Unambiguous ralph queue with a deterministic stop** — `spec/requirements.md` + `docs/ralph-runbook.md` must let ralph read the queue, the verifier (`npm run check`), the retry budget (3 cycles), and the stop condition (AC-1..AC-8 auto, AC-9 human gate).

### Alternatives considered

- **Option A (chosen).** Engine-only + golden replays + ralph + rate-only; ~6 SPECs. *Pros:* fastest path to verifiable model coherence; deterministic verifier; cleanest TDD/spec-trace alignment. *Cons:* verifier is circular (verifies "given my model, my model produces this", not "the model is right"). Mitigated by AC-9 eyeball + post-slice `SPEC-CAL-1` calibration harness.
- **Option B.** Engine + minimal Ink TUI; user spot-checks each PR; ~8-9 SPECs. *Pros:* real human-playable surface from day one; catches sign errors snapshot tests would dutifully record as ground truth. *Cons:* sacrifices the autonomous-ralph design (rejected by the user in deep-interview Round 2).
- **Option C.** Engine + LLM-as-playtester scoring each replay's plausibility; ~7 SPECs + new judge service. *Pros:* fully autonomous including plausibility scoring. *Cons:* introduces LLM noise into a verifier that should be deterministic (Principle 3); token cost per replay; judge calibration is its own hard problem.

### Why chosen

Option A was selected by the user in deep-interview Rounds 2 (engine-only + golden replays) and 3 (ralph background). The Architect's pass-1 antithesis ("the verifier is circular — model is deterministic but possibly wrong") is absorbed by AC-9 (user eyeballs the SIM-4 trajectory in the PR) and a planned post-slice `SPEC-CAL-1` (one-shot comparison of the 1979 Volcker trajectory against actual FRED data). Option B was rejected on autonomy grounds; Option C was rejected on Principle 3 (determinism).

### Consequences

- UX / runtime decisions (CLI vs TUI vs web vs native) are **deferred** to the second slice, after SPEC-SIM-4 lands and the model can be eyeballed via snapshot output.
- Forward guidance is **out of slice 1** — the engine models the `policy_rate` lever only; expectations dynamics react to rate + credibility, not stance. A second slice introduces `forward_guidance_stance` as `SPEC-GUIDE-1`.
- The three DESIGN.md open forks (banking-network granularity, FSOC peer mechanics, reappointment-denial stakes) are **all deferred** to post-slice and recorded in §Non-Goals of the source spec.
- Schema fragmentation accepted: engine-tunable knobs consolidate to `content/engine/params.json` + `schemas/engine-params.schema.json`, while per-domain content (scenarios, committees, events, tech) keeps its own directory. Loc-key shape regex is duplicated in `scenario.schema.json` and `committee.schema.json` (Tradeoff #4); existing `event.schema.json` and `tech.schema.json` do not yet enforce it — a post-slice harmonization follow-up.
- Modeling choice: `months_below_anchor` is **frozen on credibility recovery**, not reset (Tradeoff #5) — represents persistent inflationary memory. If the calibration harness finds this overshoots, a single-line change in `applyMonthlySpiral` swaps to reset-on-recovery.
- Author-runs-fresh-clone check (P0.1) is the one moment the verifier is exercised without CI in front of it; the outcome must be documented here in §Consequences when the slice's first push happens.

### Follow-ups (post-slice, not gating)

- **SPEC-CAL-1** — calibration harness (`tools/calibrate.ts`) comparing 1979 Volcker trajectory to FRED data once.
- **SPEC-GUIDE-1** — forward-guidance stance + content + expectations coefficient adjustments.
- **Slice 2 — Runtime & UX** — first interactive runtime (platform decision: CLI / Ink TUI / web / native).
- **Required-vars assertion expansion** — extend to other content loaders (events, tech) that today silently default missing vars to 0.
- **Loc-key pattern harmonization** — promote the `"pattern": "^[a-z][a-z0-9_.]+$"` constraint into `schemas/loc-key.schema.json` and `$ref` it from event/tech/scenario/committee schemas.
- **Engine variables registry** — `docs/engine-vars.md` cataloguing every `state.vars[*]` key, who writes it, who reads it, expected range.
- **Distribution-property tests for FOG-1** — verify mean ≈ truth and variance ≈ `noise_scale²` across many seeds. Pair with `SPEC-CAL-1`.
- **Open DESIGN.md forks** — addressed in their own slices after slice 1+2 prove the architecture: banking-network granularity, FSOC peer mechanics, reappointment-denial stakes.

---

## Changelog

- **Draft 1 (Planner pass 1)**: Initial 6-SPEC plan; ring buffer hidden in FOG-1; `tick(days)`; single `COMM-1`; CRED-4 params in orphan content file.
- **Draft 2 (post-Architect)**:
  - F1+F6 applied: SIM-3 owns bounded state history; tick takes `months` not `days`.
  - F2 applied: explicit `months_below_anchor` counter; required-vars assertion in SCEN-1.
  - F3 applied: SPEC-COMM-1 split into 1a (schema/content/localization) and 1b (engine + integration).
  - F4 applied: engine params consolidated into `content/engine/params.json` + `schemas/engine-params.schema.json`.
  - F5 applied: SIM-4 snapshot is true trajectory only; FOG-1 ⊥ SIM-4; parallelization boundary marked.
  - F7 applied: AC-9 is human gate, AC-1..AC-8 ralph-auto; ralph parks after SIM-4 PR.
  - Added optional post-slice SPEC-CAL-1 (calibration harness) absorbing Architect's antithesis.
  - Added explicit Tradeoff Tensions section.
- **Draft 3 (post-Critic, this revision)**:
  - **CRITICAL (Defect #1)** — renamed `SPEC-COMM-1a/1b` → `SPEC-COMM-1`/`SPEC-COMM-2` so they survive `tools/spec-trace.ts`'s `/\bSPEC-[A-Z]+-\d+\b/g` regex. Empirically verified the renames now match.
  - Defect #2: AC-2 + Phase 1 lock the history convention (current state excluded; `history[0]` = `date − 1 month`).
  - Defect #3: AC-3 schema constrains `name`/`desc` to loc-key shape `^[a-z][a-z0-9_.]+$`; Phase 2 strawman shows the literal loc-key value.
  - Defect #4: AC-7a applies the same loc-key pattern to committee member names.
  - Defect #5: Phase 5 resolves the reset-vs-decay ambiguity — `months_below_anchor` is frozen (not reset) when credibility recovers; expectations recover via `recovery_rate`.
  - Defect #6: Phase 0 P0.1 mandates an author-runs-`npm ci`-in-fresh-clone check before the first push.
  - Added three risks: SPEC-id regex drift, loc-key smuggling, params.json merge serialization.
  - Runbook §Task queue gains a serialization rule for any PR touching `content/engine/params.json`.
- **Draft 4 (post-Architect pass 2, this revision)**:
  - F8: P0.5 annotation that `SPEC-COMM-1/2` is one concern split, not two; future `SPEC-COMM-3` reserved for genuinely-new committee work.
  - F9: AC-4 now spells out FOG-1 lag indexing — `lag_months === 0` reads current state; `lag_months >= 1` reads `state.history[lag_months - 1]`; out-of-range falls back to current. Closes the zero-lag contradiction the locked history convention would otherwise have introduced.
  - F10: parallel-PR-race risk mitigation reframed as runbook discipline with a concrete `gh pr list` call, not an engine guarantee.
  - F11: P0.0 added as a smoke check that the `npm run check` script exists in `package.json:13` (it does).
  - Tradeoff #3: runbook §Budget clarified — parked loop pauses the retry counter; only `check` failures / `REQUEST_CHANGES` consume retries.
  - Added Tradeoff #4 (loc-key schema duplication) and #5 (frozen-counter modeling choice).
- **Draft 5 (post-Critic pass 2, FINAL — consensus reached)**:
  - Critic pass 2 item-9 minor clarification: REQUEST_CHANGES arriving while parked is queued, not consumed.
  - ADR-0001 finalized with all six fields (Decision / Drivers / Alternatives / Why chosen / Consequences / Follow-ups) replacing the placeholder.
  - Status changed to **consensus approved — pending execution approval**.
- **Draft 6 (P0-execution patch)**:
  - **Real defect surfaced during P0 execution that the consensus loop missed:** P0.5 instructed registering all 6 new SPECs as `[testable]`, but without referencing tests in `test/**`, `tools/spec-trace.ts` flags them as orphans and `npm run check` fails — violating AC-1. The fix is `[design]` registration upfront; each Phase N PR flips the tag to testable as part of its TDD cycle. `SPEC-CRED-4` is the exception (existing `it.todo` already references the id in a comment).
  - Documented spec-trace's line-based parsing caveat: any line containing the literal `[testable]` substring is treated as a tag line, even in narrative. Use bare "testable" in narrative.
  - Recommended follow-up: harden `tools/spec-trace.ts` so it only treats `[testable]` as a tag when it appears in the requirement-header position (e.g., next to a `SPEC-XXX-N` id), not anywhere in the line. Tracked as a post-slice follow-up.
