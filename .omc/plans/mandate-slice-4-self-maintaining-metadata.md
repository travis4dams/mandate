# MANDATE Slice 4 — Self-Maintaining Repo Metadata (Consensus Plan)

Status: **CONSENSUS APPROVED — pending execution approval**
(r1→r2 per Architect F1–F8; r2→r3 per Critic C1/M1/M2 + minors; r3→final per Architect
delta re-review SOUND + Critic delta APPROVED; spec manual-block lines amended per the
Critic's residual MINOR)
Source spec: `.omc/specs/deep-interview-mandate-slice-4-self-maintaining-metadata.md`
(deep interview PASSED, ambiguity 14.5%; supersedes the pre-interview draft spec).

## RALPLAN-DR Summary

**Principles**
1. Generated beats hand-maintained: any fact derivable from the checked-out tree is
   never human-edited; humans own only intent — kept in a separate, never-generated file.
2. Determinism enables gating — and determinism is necessary but not sufficient: parsers
   must be format-tolerant or fail loudly, never silently wrong.
3. Governance is honored, not bypassed: every main write goes through a PR under the
   `keep-main-safe` ruleset — including the machinery's own writes, with a credential
   that makes required checks actually run.
4. One source of truth for agent decision logic: `tools/routine-dryrun.ts` is CI-tested;
   the scheduler prompt is a thin wrapper.
5. CI is the verifier: nothing in this slice may require local node execution to verify
   (workstation issue #103).
6. Self-healing over single-point machinery: generators are idempotent on every PR via
   the freshness gate, so the enrichment workflow is an accelerator, not a dependency —
   if it ever breaks, the next PR (or routine cycle) heals the metadata.

**Decision Drivers (top 3)**
1. Verified: the ruleset's `pull_request` rule with zero bypass actors forbids direct
   pushes to main by anyone, including Actions — and (Architect F1) default-token bot
   PRs do not trigger CI at all.
2. The routine agent is stateless; it needs trustworthy committed tree-facts plus a
   clean live-derivation boundary (open PRs/issues and anything git-history-derived are
   never committed to STATE.json).
3. The user's explicit goal: minimize direct maintenance of README/docs/state by humans
   and agents alike.

**Viable Options considered**
- **A′. Auto-PR + auto-merge with re-trigger credential (CHOSEN — user-selected A,
  hardened by Architect synthesis):** post-merge workflow regenerates, opens a PR only
  on diff using a fine-grained PAT (or GitHub App token), auto-merges when required
  checks pass. Generators stay idempotent on every PR, so Option B's self-healing floor
  is inherited as the fallback. Pros: metadata current within minutes, governance real,
  no unbounded staleness even if the workflow dies. Cons: one operator-created secret;
  an extra (meaningful) PR per substantive merge.
- **B. Lazy enrichment via next regular PR only:** zero machinery; staleness bounded by
  routine cadence. Rejected by user (Round 1) as primary, but its mechanism is retained
  as A′'s fallback layer (Principle 6).
- **C. Ruleset bypass actor for Actions:** rejected — weakens the PRs-only guarantee.
- **D. No PR ledger in-repo:** rejected — loses the committed traceability ledger.

---

## Requirements Summary

Four deliverables (typedoc-pages deferred by user):

1. **state-generation (SPEC-META-1):** `tools/gen-state.ts` emits `STATE.json` (repo
   root) from **tree-only facts** — slice plan checkbox tallies, SPEC↔test mapping,
   content-type counts. **Zero git-history-derived fields** (Architect F5: keeps AC-1
   valid offline and on `fetch-depth: 1` checkouts like `spec-check.yml:17`). Human
   intent lives in **`state.manual.json`** (Architect F6): hand-edited, git-tracked,
   never written by any generator; schema-validated shape
   `{activeSlice, gates[], parked[], notes}`. `state:gen`/`state:check` scripts; the
   latter joins `npm run check` AND — because no CI workflow runs `npm run check`
   (Critic C1: `ci.yml` runs `npm test`, not `check`) — is added as an explicit step to
   the `build-and-test` job in `.github/workflows/ci.yml`, which is a required check.
   `state:check` also Ajv-validates `state.manual.json` against
   `schemas/state-manual.schema.json` (Critic M2: this is the named validation owner;
   `validate-content.ts` is scoped to `content/` and will not cover a root file), with a
   fixture test asserting a schema-invalid manual file fails loudly.
2. **docs-generation (SPEC-META-2):** `tools/gen-docs.ts` emits (a) README managed
   sections between `<!-- gen:layout/content/commands -->` marker pairs (one-time manual
   README refresh introduces markers, `web/` layout entry, play instructions);
   (b) `docs/content-reference.md` from `schemas/*.json`; (c) `docs/traceability.md`
   (SPEC → tag → section → tests → PR#). **Two generation modes (Critic M1):** plain
   `docs:gen` is fully tree-pure — it treats ALL existing PR cells as preserved input
   and fills nothing from git history, so output is byte-stable at any fetch depth;
   `docs:gen --enrich` (invoked ONLY by the update-state workflow, `fetch-depth: 0`)
   fills empty PR cells from `(#N)` squash subjects (Architect F4: fill-only, blanks
   legal, existing cells — including hand-filled `Fixes #N —`-era ones — never altered).
   The PR-side freshness gate runs plain `docs:check`, deterministic on CI's shallow
   checkouts. `docs:check` joins `npm run check` AND is an explicit `build-and-test`
   step (Critic C1).
3. **post-merge-enrichment:** `.github/workflows/update-state.yml` on push-to-main:
   skip when the head commit message contains the `[bot-enrichment]` marker (Architect
   F8 — marker-based, not author-based) → regenerate → `git diff --quiet` silent exit →
   else branch `bot/update-state-<run_id>`, commit with the marker in the message, PR
   `chore: regenerate STATE/docs after #<merged-pr> [bot-enrichment]`, enable
   `gh pr merge --auto --squash`. **Credential (Architect F1):** a fine-grained PAT
   stored as secret `ENRICHMENT_TOKEN` (contents: write, pull-requests: write on this
   repo) used for push + PR creation so CI triggers on the bot PR; GitHub App token is
   the documented alternative. Repo-settings prerequisites: `allow_auto_merge=true`;
   ruleset gains required checks `build-and-test`, `validate`, `trace`; **the `validate`
   workflow's path filter is removed** (Architect F2 — an 11s job; always-run preserves
   the user's three-required-checks decision without skipped-check deadlock).
4. **routine dry-run (SPEC-META-3):** `tools/routine-dryrun.ts` with pure core
   `plan(state, manual, live): ActionPlan` + thin CLI (`gh`-gathering, or
   `--no-network --fixtures <dir>`); prints a numbered action plan. Plans covered:
   drain-oldest-`agent-task`-issue, shepherd-open-PRs (3-round STUCK budget — fixtures
   cover the round-3 boundary exactly), idle → zero trace. `docs/routine-prompt-v3.md`
   ships the thin-wrapper scheduler prompt.

## Acceptance Criteria

- AC-1 `npm run check` fails on a clean clone, offline, when `STATE.json` or generated
  docs are stale. (STATE.json contains no git-history-derived field, so this holds on
  shallow checkouts.)
- AC-2 Editing one schema `description` + `docs:gen` changes only
  `docs/content-reference.md`.
- AC-3 `state.manual.json` is never modified by `state:gen`, `docs:gen`, or the
  workflow: checksum-identical after any regeneration (replaces the fragile
  preserved-block round-trip); `STATE.json` contains no manual data.
- AC-4 After a metadata-affecting merge, the workflow opens an enrichment PR whose
  required checks run (PAT-authored) and which auto-merges on green, no human action;
  no-diff merges produce nothing; the enrichment merge itself triggers no second PR.
- AC-5 README managed sections match the tree; prose untouched; missing/malformed
  marker pair fails `docs:gen` loudly with file + marker name.
- AC-6 Repo settings verified live: `allow_auto_merge` on; the three required checks
  block a deliberately-red PR; `validate` runs on a docs-only PR (path filter removed).
- AC-7 `routine-dryrun --no-network` fixture tests cover: oldest-issue selection,
  PR-shepherd verdicts (merge / fix-round 1→2→3 / STUCK exactly at 3), zero-trace idle.
- AC-8 (user gate) Travis eyeballs generated README + content-reference and receives
  the prompt-v3 text before slice close (tracked in `state.manual.json` `gates[]`).
- AC-9 Plan-parser tolerance (Architect F3): checkbox tallies count ALL `- [ ]`/`- [x]`
  lines per plan file regardless of inner format; a plan with zero checkbox lines yields
  `checkboxes: null` (never a silent 0/0); counts are descriptive progress, not
  authoritative completion — `state.manual.json.activeSlice` carries intent.

## Implementation Steps (4 PRs, sequential merges)

### PR 1 — SPEC-META-1: state generation
1. `tools/lib/spec-parse.ts`: SPEC-bullet parser producing the per-id → {tag, section,
   test files} mapping (a superset of `spec-trace.ts`'s boolean check — the extraction's
   justification, Architect F7); `tools/spec-trace.ts` becomes a consumer with CLI
   contract unchanged (existing `trace` CI job is the regression net).
2. `tools/gen-state.ts`: deterministic emit (sorted keys, 2-space indent, trailing
   newline, no Date/locale dependence); slice tallies per AC-9 tolerance rule; content
   counts; spec mapping. Reads nothing from git history.
3. `state.manual.json` (initial content: `activeSlice: "slice-4"`, empty gates/parked)
   + `schemas/state-manual.schema.json` validated in `state:check`.
4. `package.json`: `state:gen`, `state:check`; join `check` chain. **Wire into CI
   (Critic C1):** add `- run: npm run state:check` as a step to the `build-and-test`
   job in `.github/workflows/ci.yml` (CI does not run `npm run check`; the job step is
   the enforcement point, and `build-and-test` becomes a required check in PR 4).
5. `SPEC-META-1` `[testable]` in a new "Repo metadata" section of `spec/requirements.md`;
   `test/gen-state.test.ts`: byte-equality vs committed STATE.json, determinism (two
   in-process runs), AC-9 fixtures with EXACT pinned counts (slice-1-style nested AC
   checkboxes → exactly 14 total, slice-2-style no checkboxes → `null`, slice-3-style
   Step checkboxes → exactly 40 total with the real done count pinned (Architect N2)),
   AC-3 checksum test, invalid-manual-schema test.

### PR 2 — SPEC-META-2: docs generation
1. `tools/gen-docs.ts` (three emitters, shared spec-parse). Traceability PR-cell rule
   per F4 with unit test: regeneration over a fixture containing hand-edited PR cells
   must leave them byte-identical.
2. One-time README refresh introducing markers (+`web/`, play instructions) — AC-8
   eyeball target.
3. `docs:gen`/`docs:check` (plain mode only — no `--enrich` in the gate); add
   `- run: npm run docs:check` step to `build-and-test` in `ci.yml` (Critic C1);
   marker-failure fixture test; AC-2 propagation test; tree-purity test: plain
   regeneration over a fixture with populated PR cells is byte-identical regardless of
   git history (Critic M1).
4. `SPEC-META-2` `[testable]`.

### PR 3 — SPEC-META-3: routine dry-run + prompt v3
1. Pure core + CLI split as specified; fixtures under `test/fixtures/routine/`
   (queue-with-issues, PR-approved, PR-request-changes rounds 1/2/3, idle).
2. `docs/routine-prompt-v3.md` thin-wrapper prompt; includes the contributor note
   (Architect N1): plain `docs:gen` is the contributor command — never run
   `docs:gen --enrich` by hand (harmless per the fill-only rule, but it is the
   workflow's job).
3. `SPEC-META-3` `[testable]`.

### PR 4 — update-state workflow + governance
1. Remove the `paths:` filter from `.github/workflows/validate-content.yml` (F2).
2. Add `.github/workflows/update-state.yml` per Requirements §3 (marker-based skip,
   no-diff exit, `ENRICHMENT_TOKEN`, auto-merge).
3. Operator prerequisites, executed with explicit confirmation at run time:
   (a) create fine-grained PAT (this repo; contents + pull-requests: write) → secret
   `ENRICHMENT_TOKEN` — **expiry/rotation ownership: Travis; record the expiry date in
   `state.manual.json.notes`; the Principle-6 self-healing floor covers the gap if it
   lapses** (Critic "What's Missing");
   (b) `gh api -X PATCH repos/travis4dams/mandate -f allow_auto_merge=true`;
   (c) add `required_status_checks` rule to `keep-main-safe` using the **job names**
   (`build-and-test`, `validate`, `trace`), not the workflow `name:` values (Critic open
   question).
4. Verify AC-4 on this PR's own merge; AC-6 via a scratch red PR (then closed).
   Operator heads-up (Architect N3): `claude-review` also runs on bot enrichment PRs
   (once `ENRICHMENT_TOKEN` makes them trigger workflows) — it stays advisory per the
   interview decision and is not in the required set, so it can never block auto-merge.
5. **Rollback path (Critic "What's Missing"):** if the bot PR's checks never report
   (misconfigured PAT), recovery = close the stuck PR, disable the workflow
   (`gh workflow disable update-state.yml`), and optionally remove the required-checks
   rule (`gh api -X PUT repos/travis4dams/mandate/rulesets/<id>` with the prior rule
   set); metadata continues to self-heal via ordinary PRs (Principle 6), so rollback is
   non-urgent. Honest cost note: each enrichment PR runs the full `build-and-test` job
   (including the web build, ~1–2 min) — the real per-enrichment cost, accepted.

## Risks and Mitigations
- **Bot PR never triggers CI** (F1) → `ENRICHMENT_TOKEN` PAT; documented App-token
  alternative; AC-4 explicitly observes checks running on the bot PR.
- **Required check skipped-pending deadlock** (F2) → `validate` path filter removed;
  AC-6 includes a docs-only-PR validate run.
- **Workflow self-trigger loop** → `[bot-enrichment]` message marker (credential-
  agnostic, F8) + no-diff silent exit; enrichment merges are terminal by construction.
- **Parser silently wrong on heterogeneous plans** (F3) → AC-9 tolerance rule + fixture
  tests for all three historical formats; zero-checkbox plans yield `null`, never 0/0.
- **PR-cell corruption** (F4) → fill-only-from-`(#N)`, preserved-input unit test.
- **Manual-state round-trip fragility** (F6) → eliminated structurally: separate
  `state.manual.json`, never generator-written, checksum-tested (AC-3).
- **Shallow-checkout nondeterminism** (F5 + Critic M1) → STATE.json is tree-pure AND
  plain `docs:gen` (the gate mode) reads no git history at all; only the workflow's
  `--enrich` mode does, under `fetch-depth: 0`. The gate is byte-deterministic at any
  fetch depth by construction, with a tree-purity unit test.
- **Stuck bot PR / PAT misconfiguration or expiry** → PR 4 step 5 rollback path; PAT
  expiry owned by Travis (recorded in `state.manual.json.notes`); self-healing floor
  makes the failure non-urgent.
- **Malformed hand-edit of state.manual.json** (Critic M2) → `state:check` Ajv-validates
  it against `schemas/state-manual.schema.json`; invalid-fixture test asserts loud
  failure.
- **spec-parse regression** → CLI contract unchanged; `trace` job + new unit tests.
- **Local node freeze (issue #103)** → all verification in CI; implementers instructed
  not to run node locally.

## Verification Steps
1. CI green per PR — enforced by the explicit `state:check`/`docs:check` steps in the
   `build-and-test` job (NOT via `npm run check`, which no workflow invokes; the local
   `check` chain gains them too, for humans on healthy machines).
2. AC-2/3/5/7/9 as vitest cases (named in each PR above).
3. Post-PR-4: observe the live enrichment cycle (AC-4); scratch red PR blocked (AC-6);
   docs-only PR runs `validate` (AC-6).
4. AC-8 user gate recorded in `state.manual.json.gates[]`; slice closes on sign-off.

## Dependencies & Order
PR 1 → PR 2 (shared parser) → PR 3 (STATE/manual shapes) → PR 4 (regenerates 1–2's
artifacts; operator secret + settings flip immediately before merge). Serial merges;
only PR 2 touches README.

## Changelog (r1 → r2, per Architect review)
- F1 BLOCKER: added `ENRICHMENT_TOKEN` fine-grained PAT (App-token alternative) so bot
  PRs trigger required checks.
- F2 BLOCKER: kept all three required checks but removed `validate`'s path filter
  (plan deviation from Architect's "drop validate" option — preserves the user's
  interview decision at 11s/PR cost; Architect's option recorded as fallback).
- F3 BLOCKER: AC-9 format-tolerant tallies with `null` for checkbox-less plans +
  three-format fixtures.
- F4: fill-only-from-`(#N)` + preserved-input test.
- F5: STATE.json constitutionally tree-pure; history reads confined to traceability via
  full-checkout workflow.
- F6: `manual` block moved out of STATE.json into `state.manual.json` (+schema);
  AC-3 redefined as checksum-invariance.
- F7: spec-parse extraction kept, justified by the per-id mapping superset.
- F8: loop guard switched to `[bot-enrichment]` commit-message marker.
- Synthesis adopted: Principle 6 (self-healing idempotence) added; Option A relabeled A′.

## ADR — Slice 4 metadata machinery

**Decision:** Generated `STATE.json` (tree-pure) + separate hand-owned
`state.manual.json`; freshness gates (`state:check`, `docs:check`) as explicit
`build-and-test` job steps; two-mode `docs:gen` (tree-pure gate mode / workflow-only
`--enrich` at `fetch-depth: 0`); post-merge enrichment via PAT-authored auto-PR with
auto-merge under three required checks (`validate` path filter removed); routine
decision logic as the CI-tested `tools/routine-dryrun.ts` with the scheduler prompt as
a thin wrapper.

**Drivers:** ruleset forbids all direct main pushes (verified, zero bypass actors);
default-token bot PRs don't trigger CI (Architect F1); stateless routine needs a
trustworthy committed/live state boundary; user goal of minimal human doc/state
maintenance.

**Alternatives considered:** lazy-enrichment-only (B — user-rejected as primary,
retained as the self-healing floor), ruleset bypass actor (C — weakens governance),
no in-repo PR ledger (D — loses the traceability ledger), manual block embedded in
STATE.json (original spec — fragile round-trip, Architect F6), dropping `validate`
from required checks (Architect's F2 option — superseded by removing its path filter,
preserving the user's three-checks decision).

**Why chosen:** the layered design (A′ accelerator + B floor) is the only option that
simultaneously honors the ruleset, keeps metadata current within minutes, and degrades
gracefully (PAT expiry or workflow failure ⇒ next ordinary PR heals everything).

**Consequences:** one operator-owned secret (`ENRICHMENT_TOKEN`, expiry recorded in
`state.manual.json.notes`); `validate` runs on every PR (~11s); each enrichment PR
costs a full `build-and-test` run (~1–2 min); two `docs:gen` code paths share the
fill-only invariant; `claude-review` runs on bot PRs but can never block them.

**Follow-ups:** typedoc-pages (deferred component); TSDoc backfill; consider migrating
the `Fixes #N —`-era traceability cells by hand once, after which fill-only keeps them
stable; routine prompt v3 installation + one observed fire (operator).

## Changelog (r2 → r3, per Critic review)
- C1 CRITICAL: freshness gates wired as explicit `build-and-test` job steps in `ci.yml`
  (no CI workflow runs `npm run check`); PR 1/PR 2 steps updated accordingly.
- M1 MAJOR: traceability generation split into tree-pure plain mode (gate) vs
  `--enrich` mode (workflow-only, `fetch-depth: 0`) — gate now deterministic on shallow
  checkouts; tree-purity unit test added.
- M2 MAJOR: `state:check` named as the Ajv validation owner for `state.manual.json`
  (+invalid-fixture test); `validate-content.ts` scope limitation documented.
- Minors: AC-9 fixtures pin exact expected counts (incl. nested slice-1 fixture = 14);
  stuck-bot-PR rollback path + PAT expiry ownership added (PR 4 step 5); honest
  per-enrichment CI cost noted; ruleset must use job names; spec's stale Technical
  Context checkbox-convention line corrected in the spec file.
