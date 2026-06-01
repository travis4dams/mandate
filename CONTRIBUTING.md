# Contributing

## Setup
```bash
npm ci
npm run check
```

## Test-driven development
This repo is TDD by policy and by CI. The cycle is red -> green -> refactor:
write a failing test that cites a `SPEC-XXX-N` id, implement until green, then tidy.
See [CLAUDE.md](./CLAUDE.md) for the full ruleset (it applies to humans too).

## Commit / PR conventions
- One requirement per PR where possible.
- Reference the SPEC id in the PR body.
- CI must be green: **CI** (typecheck + tests), **Validate Content** (schemas),
  **Spec Check** (traceability).

## Enabling coverage gates (optional, recommended)
Add `@vitest/coverage-v8` and set thresholds in `vitest.config.ts`, then add
`--coverage` to the test step in `.github/workflows/ci.yml`.

## The automated PR reviewer
Every pull request is reviewed by `.github/workflows/claude-review.yml`, which runs
the official PR Review Toolkit and checks compliance against `CLAUDE.md`. To enable it:
1. Add a repository secret named `CLAUDE_CODE_OAUTH_TOKEN` (subscription auth; usage
   counts against your Max/Pro plan). Generate it with `claude setup-token`.
2. Optionally make the `claude-review` job a **required status check** in branch
   protection so PRs can't merge without a passing review.
The reviewer posts inline comments plus one top-level summary that begins with
`VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`.
