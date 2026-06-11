# Slice 4 spec — Self-maintaining repo metadata (interview record)

Date: 2026-06-11. Interviewed: Travis. This document is the runbook-mandated
fresh-interview record for the next slice; the implementation plan derives from it.

## Problem statement (Travis's words, paraphrased)

1. The routine agent should be more stateless: it should pick up state from a
   file that is updated with each PR, instead of a freeform progress.txt buried
   in a session-scoped `.omc/state/` path (which also caused no-op "cycle
   progress" PRs every fire).
2. The README should be kept more up to date.
3. Documentation should be generated from the code itself so that neither the
   user, the orchestrator, nor the agents maintain it directly — or as
   minimally as possible.

## Interview decisions

**Q1 — state model.** Chosen: **generated state file + tiny manual section.**
Rationale: nearly all routine-relevant state is derivable from the repo
(plan checkboxes, SPEC/test mapping, content inventory); hand-maintained state
files rot, and the burden lands on every future agent. The only hand-edited
content is what a repo cannot know: user gates, parked work, intent.

**Q2 — docs scope.** Chosen: **all four** — README generated sections, content
reference from schemas, SPEC traceability matrix, TypeDoc API docs.

**Section C (post-merge auto-commit to main) was explicitly surfaced as the one
deviation from the PR-only flow and accepted without objection.**

## Design

### 1. STATE.json (repo root) — `tools/gen-state.ts`

- Generated, deterministic (sorted keys, no wall-clock timestamps — output must
  be byte-stable for a regenerate-and-diff freshness check):
  - `slices[]`: parsed from `.omc/plans/*.md` — file, title, checkbox
    done/total, `complete` flag.
  - `specs[]`: id, tag (`testable`/`design`), section, covering test files —
    reusing/extracting the parser from `tools/spec-trace.ts` rather than
    duplicating it.
  - `content`: per-type file counts under `content/`.
- `manual` block preserved verbatim across regeneration:
  `{ activeSlice, gates[], parked[], notes }`. The generator reads the existing
  file and carries the block through; it never invents or deletes manual state.
- Explicitly excluded: anything live (open PRs, pending reviews, CI status).
  A committed file may only hold merge-time facts; the routine derives live
  state with `gh` at fire time. This boundary is what keeps STATE.json
  trustworthy.
- `npm run state:gen` writes it; `npm run state:check` regenerates and fails on
  diff; `state:check` joins the `npm run check` chain and CI.

### 2. Generated docs — `tools/gen-docs.ts`

Three emitters, one script, same gating pattern (`docs:gen` / `docs:check`,
joined to `npm run check` and CI):

1. **README managed sections** between `<!-- gen:NAME -->` / `<!-- /gen:NAME -->`
   markers: `layout` (directory tree with one-line descriptions), `content`
   (content-type inventory with counts), `commands` (from package.json
   scripts). Prose outside markers stays human-owned. Generator fails loudly if
   a marker pair is missing or malformed. A one-time manual README refresh
   accompanies the marker introduction: add `web/` to layout, a "Play it"
   section (`npm run web:install`, `npm run web:dev`), and current content dirs.
2. **docs/content-reference.md** from `schemas/*.json`: per content type — id
   pattern, required fields, field table (name, type, bounds, description — the
   description strings already in the schemas), and a worked-example file
   pointer. Schema edits regenerate authoring docs for free.
3. **docs/traceability.md**: SPEC id → tag → section → covering test files →
   implementing PR. The PR column is enrichment data: the generator treats
   existing PR-number cells as preserved input (same rule as STATE's manual
   block) and only the update-state workflow fills new ones from git log. This
   keeps regenerate-and-diff valid at PR time even though PR numbers are
   history-derived: a plain `docs:gen` run never adds, removes, or alters a
   PR-number cell.

### 3. Post-merge enrichment — `.github/workflows/update-state.yml`

History-derived facts (which merged PR implemented each SPEC) change at merge
time and therefore cannot be PR-gated. A workflow on push-to-main reruns the
generators with `git log` enrichment (PR numbers from squash-commit subjects)
and auto-commits `chore: regenerate STATE/docs [skip ci]` only when a diff
exists. This is the accepted deviation from PR-only writes to main, replacing
the old no-op cycle-progress PRs with meaningful, automatic, zero-PR commits.
Guard: the workflow must skip when the diff is empty and must use `[skip ci]`
to avoid loops.

### 4. TypeDoc

`typedoc` devDependency; HTML published to GitHub Pages by a main-branch
workflow. NOT committed to the repo (HTML churn would drown diffs). TSDoc
backfill across `src/engine` is follow-up content for a later task, not this
slice.

### 5. Routine prompt v3 (operator-applied; the routine lives outside the repo)

Delta to the v2 prompt already delivered: read STATE.json first (slices,
manual gates/parks), derive only live PR/issue state via `gh`, never touch
progress.txt (deleted concept). The LOGGING rule stays: real work leaves a
trace via PRs; empty cycles leave zero trace.

## Spec ids

- **SPEC-META-1** `[testable]` STATE.json generation: deterministic output,
  manual-block preservation, freshness gate in the check chain. Test runs the
  generator in-process and asserts byte-equality with the committed file, plus
  a unit test that a synthetic manual block survives regeneration.
- **SPEC-META-2** `[testable]` Docs generation: README managed sections,
  content reference, traceability; marker-failure behavior; freshness gate.
  Same in-process byte-equality testing pattern.

(The update-state workflow and Pages deploy are CI config, exercised by CI
itself; no SPEC id.)

## Out of scope

- TSDoc comment backfill (follow-up).
- Any engine/content/gameplay change.
- Migrating old `.omc/state/sessions/**` artifacts (left as history).
- The routine prompt itself (lives in the operator's scheduler, not the repo;
  v3 text is delivered to the operator alongside this slice).

## Acceptance criteria

- AC-1: `npm run check` fails when STATE.json or generated docs are stale, on a
  clean clone, with no network.
- AC-2: Editing a schema description and running `docs:gen` updates
  content-reference.md; nothing else changes.
- AC-3: A manual `gates` entry in STATE.json survives `state:gen`.
- AC-4: Merging a SPEC PR results (within one update-state workflow run) in
  traceability.md showing the PR number, with no human action.
- AC-5: README layout/content/commands sections match the tree exactly;
  the human prose is untouched by the generator.
- AC-6: TypeDoc publishes to Pages from main without committing HTML.
- AC-7 (user gate): Travis eyeballs the generated README/content-reference once
  before the slice is declared done.
