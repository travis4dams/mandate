# Deep Interview Spec: Slice 4 — Self-Maintaining Repo Metadata

## Metadata
- Interview ID: di-slice4-meta-20260611
- Rounds: 3 (+ Round 0 topology gate)
- Final Ambiguity Score: 14.5%
- Type: brownfield
- Generated: 2026-06-11
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: yes (full prior session summarized into the initial idea)
- Status: PASSED
- Supersedes: `.omc/specs/mandate-slice-4-self-maintaining-metadata.md` (the pre-interview
  brainstorm draft, branch `chore/slice-4-spec`). Where the two disagree, THIS file wins;
  the §3 auto-commit design in the draft is explicitly invalidated by repo evidence.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.855** |
| **Ambiguity** | | | **14.5%** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| state-generation | active | `tools/gen-state.ts` → `STATE.json` (repo root): tree-derivable facts + preserved manual block + freshness gate | AC-1, AC-3; SPEC-META-1 |
| docs-generation | active | `tools/gen-docs.ts`: README managed sections, `docs/content-reference.md` from schemas, `docs/traceability.md` | AC-2, AC-5; SPEC-META-2 |
| post-merge-enrichment | active | `.github/workflows/update-state.yml`: regenerates after merge, opens an auto-PR with auto-merge (NOT a direct push) | AC-4; repo-settings prerequisites in Constraints |
| routine-prompt-v3 | active | `tools/routine-dryrun.ts` as the single source of truth for the routine's decision procedure; scheduler prompt v3 is a thin wrapper | AC-7, AC-8; SPEC-META-3 |
| typedoc-pages | **deferred** | TypeDoc API docs to GitHub Pages | User-confirmed deferral 2026-06-11: external enablement dependencies (Pages setup); revisit after the slice |

## Goal
Make the repo's operational metadata self-maintaining: a generated `STATE.json` (with a
small preserved manual block) replaces the session-scoped `progress.txt` as the stateless
routine agent's state source; README/content-reference/traceability docs are generated
from the tree and freshness-gated in `npm run check`; post-merge enrichment lands via an
auto-merging machine PR; and the routine's decision procedure lives in a CI-testable
in-repo dry-run script that the scheduler prompt merely executes.

## Constraints
- **Determinism:** generator output is byte-stable per commit (sorted keys, no wall-clock
  timestamps) so regenerate-and-diff is a valid freshness check (`state:check`,
  `docs:check`, both joined to `npm run check` and CI).
- **STATE.json contents:** tree-derivable facts only (slice plan checkbox progress,
  SPEC↔test mapping reusing the `spec-trace` parser, content counts). Human intent
  (`activeSlice`, `gates[]`, `parked[]`, `notes`) lives in a separate, never-generated
  `state.manual.json` (consensus amendment per Architect F6 — supersedes the original
  embedded-manual-block design throughout this spec). Live facts (open PRs/issues, CI
  status) are NEVER committed — derived at fire time.
- **PR-number enrichment:** generators read PR numbers from local `git log` squash
  subjects; existing PR-number cells are preserved input (never altered by plain
  `docs:gen`), so PR-time freshness checks stay valid.
- **Ruleset reality (verified):** `keep-main-safe` enforces `pull_request` with zero
  bypass actors — no direct pushes to main by anyone, including Actions. The enrichment
  workflow therefore opens a PR and enables auto-merge; it must exit silently when
  regeneration produces no diff (loop guard) and declare
  `permissions: contents: write, pull-requests: write` explicitly (default token is read-only).
- **Repo-settings changes (user-approved in interview):**
  1. `allow_auto_merge: true` (currently false).
  2. Add required status checks to `keep-main-safe`: `build-and-test`, `validate`,
     `trace`. `claude-review` stays advisory (avoids auto-merge deadlock on slow/flaky
     reviews). Approvals stay at 0.
- **Dry-run harness:** `tools/routine-dryrun.ts` reads `STATE.json` + live `gh` data and
  emits the routine's action plan (drain oldest agent-task issue / shepherd open PRs /
  idle: exit silently). It is the single source of truth; prompt v3 must contain no
  decision logic beyond "run the dry-run and execute its plan." A `--no-network` fixture
  mode makes the decision logic unit-testable in CI.
- **Engine untouched:** no `src/engine`, content, or gameplay changes in this slice.
- **Workstation caveat (issue #103):** generators and tests must also run in CI; nothing
  in this slice may require local node execution to verify.

## Non-Goals
- TypeDoc/GitHub Pages publishing (deferred component).
- TSDoc comment backfill across `src/engine`.
- Migrating or rewriting historical `.omc/state/sessions/**` artifacts.
- Installing prompt v3 into the scheduler (operator action; the repo ships the dry-run
  and the prompt text).
- Any change to claude-review behavior.

## Acceptance Criteria
- [ ] AC-1: `npm run check` fails on a clean clone, offline, when `STATE.json` or any
      generated doc is stale.
- [ ] AC-2: Editing a schema `description` and running `docs:gen` updates
      `docs/content-reference.md` and nothing else.
- [ ] AC-3: `state.manual.json` is never modified by any generator (checksum-identical
      after regeneration); `STATE.json` contains no manual data. (Amended per Architect
      F6; the original "manual block inside STATE.json survives byte-for-byte" form is
      superseded.)
- [ ] AC-4: After a SPEC PR merges, the update-state workflow opens an enrichment PR
      (only when a diff exists) that auto-merges once the three required checks pass,
      with no human action; a no-diff merge produces no PR and no commit.
- [ ] AC-5: README managed sections (`layout`, `content`, `commands`) match the tree;
      human prose outside markers is untouched; a missing/malformed marker pair fails
      `docs:gen` loudly.
- [ ] AC-6: Repo settings verified in-slice: `allow_auto_merge=true`; ruleset requires
      `build-and-test`, `validate`, `trace`; a deliberately red PR cannot merge.
- [ ] AC-7: `tools/routine-dryrun.ts --no-network` against fixtures asserts: oldest
      agent-task issue selected; open-PR shepherding plan correct (merge approved+green /
      fix REQUEST_CHANGES round-counted / STUCK at 3); zero-trace idle plan when queue
      empty and no PRs.
- [ ] AC-8 (user gate): Travis eyeballs the generated README/content-reference once, and
      receives prompt-v3 text that wraps the dry-run script, before the slice closes.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Workflow can push regenerated files to main | Queried branch protection: ruleset `keep-main-safe` has `pull_request` rule, zero bypass actors | Auto-PR + auto-merge instead of direct push (Round 1) |
| "History facts can't be PR-gated" (draft §3) | Squash subjects carry `(#N)`; post-merge history exists in every later branch | PR numbers ARE derivable at gen time; enrichment cells preserved-input; workflow only covers the merge→next-PR gap |
| Auto-merge is safe by default | Repo facts: `allow_auto_merge=false`; ruleset requires NO status checks (green-CI-was-convention) | Flip auto-merge on; require the 3 deterministic checks; claude-review stays advisory (Round 3) |
| Routine correctness is verifiable only operationally | Asked DoD options; user initially chose "delivered = done", then revised | In-repo dry-run harness as single source of truth; prompt v3 is a thin wrapper; CI-testable (Round 2, user-revised) |
| TypeDoc ships in this slice | Topology gate surfaced its external dependencies | Deferred by user (Round 0) |

## Technical Context
- `tools/` pattern: tsx scripts (`spec-trace.ts` already parses SPEC bullets + test
  citations — extract/reuse its parser rather than duplicating).
- CI: `ci.yml` (build-and-test), `validate-content.yml` (validate), `spec-check.yml`
  (trace), `claude-review.yml` (advisory). Check names above are the required-check
  identifiers.
- `.omc/plans/*.md` checkbox formats are heterogeneous (correction from consensus
  review): slice-3 uses `- [x] **Step`, slice-1 uses nested `- [ ] **AC-N**` style,
  slice-2 has no checkboxes at all — parsers must tally all `- [ ]`/`- [x]` lines and
  yield `null` for checkbox-less plans (plan AC-9).
- Old state path `.omc/state/sessions/<id>/progress.txt` is git-tracked history; new
  `STATE.json` lives at repo root.
- Spec ids: SPEC-META-1 (state gen), SPEC-META-2 (docs gen), SPEC-META-3 (dry-run
  harness), all `[testable]`, tests assert byte-equality with committed artifacts plus
  unit tests for manual-block preservation and dry-run fixtures.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| STATE.json | core artifact | slices[], specs[], content counts, manual block | generated by gen-state; read by routine dry-run; gated by state:check |
| gen-state / gen-docs | core tools | deterministic emitters | write STATE.json + managed docs; invoked by check chain and workflow |
| Freshness gate | CI check | state:check, docs:check | part of npm run check; required on main |
| Manual block | preserved data | activeSlice, gates, parked, notes | carried verbatim through regeneration |
| Managed docs | artifacts | README sections, content-reference, traceability | generated from tree + schemas + git log |
| Enrichment PR | process artifact | regenerated files only | opened by update-state workflow; auto-merges on green |
| Ruleset/repo settings | external system | pull_request rule, required checks, allow_auto_merge | gates all merges incl. enrichment PRs |
| Routine agent | consumer | scheduler prompt v3 | executes dry-run plan; zero trace when idle |
| Dry-run harness | core tool | tools/routine-dryrun.ts, --no-network fixtures | single source of routine decision logic; SPEC-META-3 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2 | 9 | 1 (dry-run harness) | 0 | 8 | 89% |
| 3 | 9 | 0 | 0 | 9 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 3 rounds)</summary>

### Round 0 — Topology
**Q:** 5 components proposed (state-generation, docs-generation, post-merge-enrichment, typedoc-pages, routine-prompt-v3) — confirm/adjust?
**A:** Defer typedoc-pages.

### Round 1 — post-merge-enrichment / Constraints
**Q:** Ruleset blocks all direct pushes to main (evidence: `keep-main-safe`, `pull_request` rule, no bypass actors). How should enrichment land? (lazy-via-next-PR / auto-PR+auto-merge / ruleset bypass / drop PR column)
**A:** Auto-PR with auto-merge.
**Ambiguity:** 27% (Goal 0.85, Constraints 0.65, Criteria 0.60, Context 0.80)

### Round 2 — routine-prompt-v3 / Success Criteria
**Q:** What counts as done-and-verified for the scheduler-side prompt? (supervised fire / delivered=done / repo-side dry-run harness)
**A:** Initially "delivered = done"; user revised to **repo-side dry-run harness** ("doing a dry run in the repo makes a lot of sense"). Spec consequence: dry-run script becomes the single source of truth; prompt is a thin wrapper.
**Ambiguity:** 19.5% (Goal 0.90, Constraints 0.65, Criteria 0.80, Context 0.85)

### Round 3 — post-merge-enrichment / Constraints (governance)
**Q:** Ruleset requires no status checks; auto-merge would complete before CI. Add required checks? (3 deterministic / all 4 incl. claude-review / none)
**A:** Require the 3 deterministic checks (build-and-test, validate, trace); claude-review stays advisory.
**Ambiguity:** 14.5% (Goal 0.90, Constraints 0.80, Criteria 0.85, Context 0.85)

</details>
