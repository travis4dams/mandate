# Working in this repository (humans and AI agents)

This project is built to be developed largely by autonomous agents. These rules are
the contract that keeps that safe and coherent. CI enforces most of them, and the
automated PR reviewer (`.github/workflows/claude-review.yml`) checks compliance
against this file on every pull request.

## The loop: spec -> failing test -> implementation
1. **Spec first.** If you're changing behavior, add or amend a requirement in
   `spec/requirements.md` with a stable `SPEC-XXX-N` id. Tag it `[testable]` if it
   can be checked by code.
2. **Failing test second.** Write the test before the implementation and put the
   SPEC id in a comment (e.g. `// SPEC-CRED-3`). `npm run spec:trace` fails if a
   `[testable]` requirement has no referencing test.
3. **Implementation third.** Make the test green with the smallest change.

## Hard rules (CI and the PR reviewer will reject violations)
- **No content in engine code.** Events, techs, numbers, and text live in
  `content/`. `src/engine/**` must never hardcode a specific event or tech.
- **Engine purity / determinism.** No `Math.random()` and no `Date.now()` anywhere
  in `src/**`. All randomness goes through `src/engine/rng.ts` (seeded). Effects
  return new state; they never mutate inputs. (SPEC-SIM-1)
- **No inline player-facing strings.** Logic files reference localization keys; the
  strings live in `content/localization/`. (SPEC-CONTENT-2)
- **Schema-governed content.** New content types need a schema in `schemas/` and
  must pass `npm run validate`. (SPEC-CONTENT-1)
- **No real person names.** Named people in the game (committee members, Chair
  characters, etc.) MUST use randomly-generated names that don't correspond to real
  historical figures. Institution names (FOMC, FRED, Federal Reserve) and period
  markers (1979 stagflation, late-1970s tightening) are fine. This applies to
  content/localization values, scenario/replay ids that reference a person, and any
  future characters.

## Before opening a PR
- Run `npm run check` (typecheck + validate + spec:trace + test) — all green.
- Keep PRs small: ideally one SPEC requirement each.
- Fill in the PR template, including the SPEC id you implemented.

## Where things are
- The vision and the "why": `spec/DESIGN.md`.
- The enforceable "what": `spec/requirements.md`.
- The content contract: `schemas/`.
- Worked examples to copy: `content/events/oil_shock.json`, `content/tech/*.json`.

## Issue-driven autonomous work
GitHub issues labelled **`agent-task`** are picked up by the recurring agent on
its next scheduled fire, in `created_at` order. The agent opens a PR titled
`Fixes #N — …`, comments on the issue with the PR URL, and (only after both
the PR-create and issue-comment steps succeed) removes the `agent-task` label.
The issue stays open until the user closes it as their verification step. See
`docs/agent-task-workflow.md` for the full contract including failure handling,
dedup-check semantics, and retry behaviour.
