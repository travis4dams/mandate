# Ralph runbook — MANDATE

This document tells `ralph` (and any autonomous agent in its shape) how to work
this repository. The canonical project contract is [CLAUDE.md](../CLAUDE.md);
the active work plan is
[`.omc/plans/mandate-slice-1-volcker-plan.md`](../.omc/plans/mandate-slice-1-volcker-plan.md);
the source spec is
[`.omc/specs/deep-interview-mandate-slice-1-volcker.md`](../.omc/specs/deep-interview-mandate-slice-1-volcker.md).

If anything below conflicts with `CLAUDE.md`, `CLAUDE.md` wins.

## Verifier

Run `npm run check` — it chains `tsc --noEmit && npm run validate && npm run spec:trace && npm test`. All four steps must exit 0. This is the single deterministic verifier; an AI PR reviewer (`.github/workflows/claude-review.yml`) is an *additional* advisory gate, not a substitute.

## Task queue

Open [`spec/requirements.md`](../spec/requirements.md). Slice-1 ordered queue:

**SPEC-SIM-3, SPEC-SCEN-1, [SPEC-FOG-1 ∥ SPEC-SIM-4], SPEC-CRED-4, SPEC-COMM-1, SPEC-COMM-2**

`SPEC-FOG-1` and `SPEC-SIM-4` may be worked in parallel (both depend on `SPEC-SIM-3` landing first; neither depends on the other). Everything else is strictly sequential.

**Serialization rule.** Any two PRs that both modify `content/engine/params.json` MUST be merged sequentially, not in parallel. Concretely: `SPEC-CRED-4` and `SPEC-COMM-2` both add sections to that file, so they cannot share a queue slot. Before opening any PR that touches `content/engine/params.json`, run:

```sh
gh pr list --state open --search "content/engine/params.json"
```

If any open PR is returned, do not open the second PR until the first merges.

**SPEC id discipline.** Every new SPEC id must round-trip through `tools/spec-trace.ts`'s regex `/\bSPEC-[A-Z]+-\d+\b/g`. Quick check before opening a PR that introduces a new SPEC id:

```sh
node -e "console.log('SPEC-FOO-1'.match(/\\bSPEC-[A-Z]+-\\d+\\b/g))"
```

If the result is `null`, the id is invalid (e.g. compound suffixes like `-1a`, `-1.1` will not match — split into separate ids instead).

## TDD cycle

For each SPEC:

1. Amend `spec/requirements.md` — register the `SPEC-XXX-N` id with `[testable]` (or `[design]` if narrative-only).
2. Write a failing test that cites the id in a comment, e.g. `// SPEC-FOO-N`. The comment text — not just the test name — is what `tools/spec-trace.ts` matches.
3. Implement the smallest change that makes the test green.
4. Open a PR titled with the SPEC id (e.g. `SPEC-SIM-3: calendar tick + bounded state history`). Reference the SPEC id in the PR body.

## Budget

Three self-fix cycles per SPEC after a failed `npm run check` or an AI-reviewer `REQUEST_CHANGES` verdict. On the 4th failure, pause and post a diagnostic in the PR (or in a parent issue) describing what was tried and what failed. Never bypass hooks (`--no-verify`, `--no-gpg-sign`, etc.).

**Budget pauses when the loop parks.** Only `npm run check` failures or `REQUEST_CHANGES` consume retries. While ralph is parked awaiting AC-9 sign-off (see §Stop), the retry counter does not advance regardless of wall-clock time. If a `REQUEST_CHANGES` arrives while parked, it is queued — not consumed — until the user lifts the park.

## Stop

Slice-1 ralph-done = `AC-1..AC-8` in [`.omc/plans/mandate-slice-1-volcker-plan.md`](../.omc/plans/mandate-slice-1-volcker-plan.md) all green. `AC-9` (sanity-replay eyeball check) is the **user's** human gate, not ralph's.

After opening the `SPEC-SIM-4` PR, **park the loop** and wait for the user's `looks plausible` (or equivalent) comment on the committed `test/golden/1979_volcker_tightening.snap.json` trajectory before resuming on `SPEC-CRED-4`. Do not advance the queue while parked.

When `AC-1..AC-8` are green and `AC-9` is signed off by the user, post a final summary in a tracking issue and stop. The slice is complete; the next slice begins with a fresh interview + plan, not by extrapolating from this one.
