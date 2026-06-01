# Deep Interview Spec: MANDATE — Vertical Slice 1 (Engine-only, 1979 Volcker)

## Metadata
- Interview ID: di-2026-06-01-mandate-slice-1
- Rounds: 10 (Round 0 topology + Rounds 1–10 scoring)
- Final Ambiguity Score: ~17% (excluding deferred component C2)
- Type: brownfield (skeleton present; no engine loop, no UI)
- Generated: 2026-06-01
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no (skeleton was small enough to load directly)
- Status: PASSED

## Clarity Breakdown (final round)
| Dimension | Goal | Constraints | Criteria | Context | Weighted Ambig |
|-----------|------|-------------|----------|---------|----------------|
| C1 Slice Scope        | 0.85 | 0.85 | 0.85 | 0.65 | 15% |
| C2 Runtime & UX       | 0.70 | 0.30 | 0.30 | 0.60 | 49% (DEFERRED) |
| C3 Engine Order       | 0.90 | 0.75 | 0.80 | 0.70 | 14% |
| C4 Skeleton Gap-fill  | 0.85 | 0.90 | 0.85 | 0.75 | 13% |
| C5 Agent Collab       | 0.90 | 0.55 | 0.85 | 0.55 | 20% |
| **Overall (excl. C2)**|      |      |      |      | **~17% ✓** |

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| C1 Vertical-Slice Scope | active | What's in / out of the first playable slice. | Covered by §Goal, §Constraints, §Non-Goals. |
| C2 Runtime & UX Surface | DEFERRED | What shape of "playable" the slice ships. | User chose engine-only + golden replays. Revisit after SPEC-SIM-4 lands and the model can be eyeballed via snapshot output. Platform decision (CLI / TUI / web / native) deferred to a follow-up interview. |
| C3 Engine Implementation Order | active | Order of next SPEC-XXX requirements ralph attacks. | Covered by §Engine SPEC queue. |
| C4 Pre-push Skeleton & Process Gap-fill | active | What must be added before first `git push`. | Covered by §Pre-push checklist. |
| C5 Agent Collaboration Model | active | Who builds the slice and in what mode. | Covered by §Agent collaboration. |

## Goal

Take the existing MANDATE skeleton (engine primitives `rng/state/credibility`, content interpreters `conditions/effects/loader`, JSON-Schema-governed content, vitest + spec-trace + AI PR review CI) and produce **Vertical Slice 1**: a deterministic, engine-only simulation seeded with the **1979 Volcker stagflation** scenario, verified by **golden-replay snapshot tests**, implemented by **ralph in a background loop** after the repo is pushed to GitHub with all blocking gaps closed.

The slice tests one question and only one: *"Is the credibility-and-expectations core of MANDATE coherent enough — under a canned Volcker tightening policy and the 1979 initial state — to produce plausible, narrative-shaped trajectories?"* It does **not** test whether the game is fun. UX taste is intentionally out of scope.

## Constraints

- **Engine purity / determinism** (already in CLAUDE.md): no `Math.random()`, no `Date.now()` in `src/**`; all randomness via `src/engine/rng.ts`; effects return new state.
- **No content in engine** (already in CLAUDE.md): all tunables (scenario vars, fog noise scales, expectation coefficients) live in `content/` under JSON Schema in `schemas/`.
- **No inline player-facing strings** (already in CLAUDE.md): localization keys only.
- **Slice is engine-only**: no UI, no CLI, no TUI ships in this slice. The "interface" is `npm run check` + golden-replay snapshot files committed under `test/__snapshots__/` (or `test/golden/`).
- **Slice is rate-only**: forward guidance is OUT of slice 1 (deferred). The only policy lever modeled is `policy_rate`. Expectations dynamics react to rate + credibility, not stance.
- **Slice scenario window**: 1979-08 through 1986-12 (default, ~7.4 years; user-revisable in spec review). Captures the full Volcker disinflation arc.
- **Pass/fail**: ralph DONE = all pinned SPECs shipped + `npm run check` green on every PR + AI reviewer APPROVE on every PR + at least one 1979 Volcker golden-replay snapshot eyeball-approved by the user.
- **Ralph iteration budget** (default, user-revisable): max 3 self-fix cycles per SPEC after a failed `npm run check` or `REQUEST_CHANGES` verdict. On the 4th failure, ralph pauses and pings the user with a diagnostic.

## Non-Goals (explicit out-of-scope for slice 1)

- No interactive runtime, no CLI/TUI/web/native UI, no graphics.
- No forward-guidance modeling, no balance-sheet policy, no QE.
- No international / FX / capital flows / peer central banks.
- No supervision / regulation / banking-network map.
- No personnel / talent draft, no division org chart, no tech tree progression.
- No mandate-evaluator (single vs dual mandate, tolerance bands, win/lose on mandate).
- No reappointment vote, no Congress testimony, no political-capital resource.
- No FSOC peer mechanics, no fiscal/Treasury AI actor, no event categories beyond what SPEC-SCEN-1 lays down.
- Three DESIGN.md open forks all **DEFERRED** to post-slice:
  - banking-network granularity (named institutions vs aggregated clusters)
  - FSOC peers as mechanically active vs flavor/event hooks
  - reappointment-denial stakes (game-over vs lame-duck epilogue)

## Acceptance Criteria

Each criterion below is the literal done-test for slice 1.

- [ ] **AC-1 (Pre-push readiness)** — Before first `git push origin main`, the repo contains:
  - [ ] `package-lock.json` generated from a clean `npm install` (so `npm ci` in CI succeeds).
  - [ ] `LICENSE` file with **MIT** text.
  - [ ] `docs/ralph-runbook.md` describing: verifier = `npm run check`; SPEC queue lives in `spec/requirements.md`; per-SPEC TDD cycle = failing test first, implementation second; budget = 3 retries per SPEC then ping user; AI PR reviewer is the merge gate.
  - [ ] `docs/adr/0001-vertical-slice-1.md` capturing the decisions in this interview (slice=1979 Volcker engine-only, ralph executor, forward-guidance deferred, etc.).
- [ ] **AC-2 (SPEC-SIM-3 calendar tick)** — `tick(state, days: number): GameState` advances `state.date` deterministically; emits no events yet; pure function; test cites `SPEC-SIM-3`. Added to `spec/requirements.md` as `[testable]`.
- [ ] **AC-3 (SPEC-SCEN-1 scenario loader)** — `schemas/scenario.schema.json` + `content/scenarios/1979_volcker.json` + loader in `src/content/`. Loader returns an initial `GameState` with at minimum `vars: { inflation, unemployment, credibility, expectations_anchor, policy_rate }` and a `date` of `"1979-08"`. Test cites `SPEC-SCEN-1`.
- [ ] **AC-4 (SPEC-FOG-1 data fog)** — A pure function `observe(state, seriesId, rng): number` returns a noisy, lagged view of a true var. Noise/lag parameters come from content, not code. Test cites `SPEC-FOG-1`.
- [ ] **AC-5 (SPEC-SIM-4 golden-replay harness)** — Test utility `replay(scenarioId, policyScript, seed): GameState[]` runs N ticks under a canned policy and returns the trajectory. At least one snapshot test commits the trajectory of the 1979 Volcker scenario under a "Volcker tightening" canned policy. Test cites `SPEC-SIM-4`.
- [ ] **AC-6 (SPEC-CRED-4 de-anchoring spiral)** — The `it.todo` in `test/credibility.test.ts` becomes a passing test. Once credibility falls below `ANCHOR_THRESHOLD` for `N` consecutive months (N from content), expectations drift further from target each subsequent period in a self-reinforcing spiral. Test cites `SPEC-CRED-4`.
- [ ] **AC-7 (SPEC-COMM-1 FOMC vote)** — A pure `vote(committee, proposedRate, state): { decided: number, dissents: number }` simulates an FOMC vote given member ideological leans (content-driven) and the proposed rate. Dissents feed `applyMeetingOutcome` already in `credibility.ts`. Test cites `SPEC-COMM-1`.
- [ ] **AC-8 (CI green throughout)** — Every PR ralph opens has `CI`, `Validate Content`, and `Spec Check` green and the `claude-review` job posts `VERDICT: APPROVE`.
- [ ] **AC-9 (Sanity replay)** — At least one committed golden-replay snapshot for the 1979 Volcker scenario under a "Volcker tightening" canned policy shows the user a credibility-and-inflation trajectory plausible enough to eyeball-approve in PR review.

## Engine SPEC queue (the order ralph attacks)

1. **SPEC-SIM-3** — calendar tick (the substrate)
2. **SPEC-SCEN-1** — scenario schema + loader + `1979_volcker.json` content
3. **SPEC-FOG-1** — observe/fog mechanic
4. **SPEC-SIM-4** — golden-replay harness
5. **SPEC-CRED-4** — de-anchoring spiral (already named in `spec/requirements.md`)
6. **SPEC-COMM-1** — FOMC vote

This order is fixed: each later SPEC depends on the existence of earlier ones. Ralph picks SPEC-SIM-3 first.

## Pre-push checklist (do before `git push origin main`)

1. `npm install` to generate `package-lock.json`; commit it.
2. Add `LICENSE` (MIT, copyright the user).
3. Add `docs/ralph-runbook.md` (see AC-1 for required content).
4. Add `docs/adr/0001-vertical-slice-1.md` (see AC-1).
5. Amend `spec/requirements.md` to register `SPEC-SIM-3`, `SPEC-SCEN-1`, `SPEC-FOG-1`, `SPEC-SIM-4`, `SPEC-COMM-1` as `[testable]` (SPEC-CRED-4 already present).
6. (Optional, before push) Generate `CLAUDE_CODE_OAUTH_TOKEN` via `claude setup-token` and add as repo secret so `.github/workflows/claude-review.yml` runs on the very first PR.
7. (Optional) Configure branch protection on `main` so the `CI`, `Validate Content`, `Spec Check`, and `claude-review` jobs are required status checks.

## Agent collaboration

- **Executor:** `ralph` runs in the background after the slice spec is pushed. The user reviews outcomes; the AI PR reviewer is the gating reviewer of each PR. The user is not in the per-PR loop.
- **TDD discipline:** strictly enforced by CLAUDE.md + `npm run spec:trace`. For each SPEC, ralph: (1) amends `spec/requirements.md`, (2) writes a failing test citing the SPEC id, (3) implements until green, (4) opens PR.
- **Budget per SPEC:** 3 self-fix attempts after a failed `npm run check` or AI-reviewer `REQUEST_CHANGES`. On the 4th failure, ralph pauses and reports.
- **Subagent-driven parallel work** (the user's invoked `/subagent-driven-development` skill): once SPEC-SIM-3 lands, SPEC-SCEN-1 and SPEC-FOG-1 are largely independent and *may* be parallelized via subagents — but only after a green merge proves the ralph loop works end-to-end. Default: serial until the loop is trusted, then opt in to parallel.

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| The slice tests "is the game fun?" (DESIGN.md framing) | Round 2 question on runtime exposed that engine-only + golden replays *cannot* answer the fun question — there's no room to be in. | Slice's purpose redefined: tests **model coherence**, not fun. UX/fun-test deferred to a later slice with a real runtime. |
| The next SPEC is obvious (SPEC-CRED-4 is the named TODO) | Round 4 contrarian framing exposed that SPEC-CRED-4 needs multi-period state, which requires a clock the engine doesn't have. | Bootstrap = SPEC-SIM-3 calendar tick. SPEC-CRED-4 moves later in the queue. |
| Forward guidance is in any monetary-policy slice by default | Round 9 question forced an explicit IN/OUT call. | OUT of slice 1 — rate-only. Forward guidance comes in a later slice once the rate-only model is verified. |
| The skeleton is push-ready as-is | Round 5+6 brownfield exploration surfaced **no committed `package-lock.json`** (CI calls `npm ci` and will fail) and **no LICENSE**. | Pre-push checklist made these two items blocking. |
| Three DESIGN.md open forks need answering before development starts | Round 8 confirmation. | All three deferred to post-slice; recorded in §Non-Goals. |

## Technical Context (brownfield findings)

Present (and good):
- `src/engine/rng.ts` (mulberry32 seeded PRNG) — satisfies SPEC-SIM-1 randomness contract.
- `src/engine/state.ts` (`GameState` with `date`, `vars`, `flags`) — substrate the tick will extend.
- `src/engine/credibility.ts` (`applyMeetingOutcome`, `expectationsAnchored`, `painMultiplier`) — slice's emotional engine; SPEC-CRED-4 hooks here.
- `src/content/conditions.ts`, `src/content/effects.ts`, `src/content/loader.ts` — Ajv-validated content pipeline; SPEC-SCEN-1 reuses `loadValidated`.
- `schemas/event.schema.json`, `schemas/tech.schema.json` — pattern to copy for `schemas/scenario.schema.json`.
- `content/events/oil_shock.json`, `content/tech/*.json` — worked examples to mirror for `content/scenarios/1979_volcker.json`.
- CI: `ci.yml`, `validate-content.yml`, `spec-check.yml`, `claude-review.yml` — full TDD + content + spec-trace + AI review gate.
- `tools/spec-trace.ts` — enforces `[testable]` ↔ test reference; ralph must keep this green.

Missing (slice blockers, captured above):
- `package-lock.json` (CI calls `npm ci`)
- `LICENSE`
- `docs/ralph-runbook.md`
- `docs/adr/`

Missing (slice scope):
- Calendar / clock mechanic
- Scenario schema + loader + content
- Data-fog mechanic
- Golden-replay harness
- De-anchoring spiral (`SPEC-CRED-4` is specced but `it.todo`'d)
- FOMC committee vote

## Ontology (Key Entities — final round)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Chair | core domain | (implicit player) | makes PolicyRate decisions; receives MeetingOutcome |
| GameState | core domain | date, vars, flags | mutated only via pure tick/effects |
| Scenario | core domain | id, name, initial_state, window | seeds GameState; produces SanityReplay |
| Tick | core domain | days | advances GameState.date |
| PolicyRate | supporting | numeric var | input to inflation/expectations dynamics |
| CredibilityTrack | core domain | numeric var, clamped [0,100] | drives ExpectationsAnchor; via applyMeetingOutcome |
| ExpectationsAnchor | core domain | bool / drift var | de-anchors below ANCHOR_THRESHOLD; spirals (SPEC-CRED-4) |
| DataSeries | supporting | inflation, unemployment, ... | observed via Fog from true vars |
| Fog | core domain | noise_scale, lag_months | hides true DataSeries values from observer |
| FOMC | core domain | committee, voters, dissents | produces MeetingOutcome which feeds CredibilityTrack |
| GoldenReplay | core domain | scenarioId, policyScript, seed, trajectory | the verifier artifact ralph must produce |
| SanityReplay | supporting | one specific snapshot | eyeball-approved by user for AC-9 |
| RalphLoop | external system | iteration_budget=3, verifier=`npm run check` | executes each SPEC end-to-end |
| AIPRReviewer | external system | VERDICT verdict | gates merge |
| Pre-pushChecklist | supporting | 4 items (lockfile, LICENSE, runbook, ADR) | gates first `git push` |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 (baseline) | 12 | 12 | – | – | N/A |
| 2 | 12 | 3 (GoldenReplay, SnapshotTest, Seed) | – | 9 | 75% |
| 3 | 14 | 2 (RalphLoop, AcceptanceCriterion) | – | 12 | 87.5% |
| 4 | 15 | 1 (Tick) | – | 14 | 93.3% |
| 5 | 16 | 1 (ScenarioSeed → merged into Scenario) | 1 | 14 | 93.75% |
| 6 | 18 | 3 (Lockfile, LicenseChoice, RalphRunbook, ADR) | – | 16 | 88.9% (gap-fill expansion) |
| 7 | 18 | 0 | – | 18 | 100% |
| 8 | 19 | 1 (DeferralAll) | – | 18 | 94.7% |
| 9 | 19 | 0 | – | 19 | 100% ✓ converged |
| 10 | 19 | 0 | – | 19 | 100% ✓ locked |

Ontology stabilized over the last three rounds at 19 entities (100% stable across rounds 9–10). Domain model is locked.

## Interview Transcript

<details>
<summary>Full Q&A (10 rounds)</summary>

### Round 0 — Topology
**Q:** Is the 4-component topology right? **A:** Reshape — added Agent Collaboration Model as a 5th component.

### Round 1 — Slice Scope / Goal
**Q:** What ends a single slice playthrough and decides win/lose? **A:** Credibility crash / time cutoff (sandbox shape).

### Round 2 — Runtime & UX / Goal
**Q:** What player-facing runtime do we build for the first slice? **A:** Engine-only + golden-replays (UX deferred).

### Round 3 — Agent Collab / Goal
**Q:** Who executes the slice implementation, and in what mode? **A:** Ralph loop (background) after spec lock.

### Round 4 — Engine Order / Goal (Contrarian mode)
**Q:** What's the FIRST SPEC ralph implements? **A:** SPEC-SIM-3 calendar tick.

### Round 5 — Slice Scope / Constraints
**Q:** Which scenario seeds the first slice's golden replays? **A:** 1979 Volcker stagflation.

### Round 6 — Skeleton Gap-fill / Criteria (Simplifier mode)
**Q:** Which pre-push gaps are blocking? **A:** All four — lockfile, LICENSE, ralph runbook, ADR.

### Round 7 — Cross-component Criteria
**Q:** When is ralph DONE with the slice? **A:** Pinned SPECs + green CI + 1 sanity-eyeball Volcker replay snapshot.

### Round 8 — Residual constraints (multi-select)
**Q:** Lock these defaults? **A:** Only "defer all 3 open forks" locked. Cutoff date = 1986-12 and ralph budget = 3 retries left as proposed defaults in this spec (user-revisable in review).

### Round 9 — Forward guidance scope
**Q:** Is forward guidance IN the first slice's engine? **A:** OUT — rate-only slice (~6 SPECs).

### Round 10 — License
**Q:** Which LICENSE? **A:** MIT.

</details>

## Things flagged for your review (please confirm or change in spec review)

1. **Cutoff date defaulted to 1986-12.** Change if you prefer a tighter (1984-12) or longer (1989-12) Volcker arc.
2. **Ralph iteration budget defaulted to 3 retries.** Change if you want a tighter (1–2) or looser (5+) leash.
3. **SPEC ids for the new requirements** are proposed as `SPEC-SIM-3`, `SPEC-SCEN-1`, `SPEC-FOG-1`, `SPEC-SIM-4`, `SPEC-COMM-1`. The existing `spec/requirements.md` uses `SPEC-XXX-N` style with `XXX` being a category — confirm these category prefixes (or pick `SPEC-TIME-1`, `SPEC-SCENARIO-1`, etc.).
4. **AC-1 details on `docs/ralph-runbook.md`** are a strawman — confirm the runbook should live at that exact path, or pick `.ralph/task.md` / `AGENTS.md`-section / etc.
5. **`/subagent-driven-development` parallelism** — strawman is "serial until ralph loop is proven, then opt-in parallel for SCEN-1 / FOG-1." Confirm or change.
