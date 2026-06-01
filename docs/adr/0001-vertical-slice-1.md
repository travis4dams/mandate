# ADR-0001 — Vertical Slice 1: Engine-only + 1979 Volcker + Golden Replays + Ralph

- Status: **Accepted** (consensus reached via deep-interview → omc-plan, 2 iterations)
- Date: 2026-06-01
- Authors: Travis Adams (Chair), with consensus from deep-interview + omc-plan agents
- Source spec: [`.omc/specs/deep-interview-mandate-slice-1-volcker.md`](../../.omc/specs/deep-interview-mandate-slice-1-volcker.md)
- Source plan: [`.omc/plans/mandate-slice-1-volcker-plan.md`](../../.omc/plans/mandate-slice-1-volcker-plan.md)

## Decision

Vertical Slice 1 of MANDATE is an **engine-only, deterministic simulation seeded with the 1979 Volcker stagflation scenario**, verified by **committed golden-replay snapshot tests**, implemented by **`ralph` running autonomously in a background loop** after the repo is pushed to GitHub with all blocking pre-push gaps closed.

The slice ships six SPECs:

| Id | Name |
|----|------|
| `SPEC-SIM-3` | monthly calendar tick + bounded state history |
| `SPEC-SCEN-1` | scenario schema + loader + required-vars assertion + 1979 Volcker content |
| `SPEC-FOG-1` | data fog mechanic (reads from history; never owns it) |
| `SPEC-SIM-4` | golden-replay harness + committed snapshot for 1979 Volcker under canned policy |
| `SPEC-CRED-4` | de-anchoring spiral, completing the existing `it.todo` |
| `SPEC-COMM-1` / `SPEC-COMM-2` | committee schema/content + FOMC vote engine (one concern split into two PRs for review size) |

## Drivers

1. **Verifiable model coherence under autonomy.** The slice produces a deterministic, snapshot-verifiable answer to *"does the credibility-and-expectations machinery, under the 1979 Volcker initial state and canned policy, produce plausible trajectories?"* — without a human in the per-PR loop.
2. **Safe public-repo first push.** The first `git push origin main` must not break CI, leak secrets, or be legally ambiguous. Pre-push gap-fills (lockfile, MIT `LICENSE`, ralph runbook, this ADR, registered SPEC ids) are blocking.
3. **Unambiguous ralph queue with a deterministic stop.** `spec/requirements.md` + `docs/ralph-runbook.md` let ralph read the queue, the verifier (`npm run check`), the retry budget (3 cycles), and the stop condition (AC-1..AC-8 ralph-auto, AC-9 human gate).

## Alternatives considered

### Option A (chosen) — Engine-only + golden replays + ralph + rate-only

- **Pros:** fastest path to verifiable model coherence; deterministic verifier; cleanest TDD / `spec:trace` alignment with existing CI.
- **Cons:** verifier is circular (it verifies *"given my model, my model produces this"* — not *"the model is right"*). Mitigated by AC-9 eyeball + planned post-slice `SPEC-CAL-1` calibration harness.

### Option B — Engine + minimal Ink TUI; user spot-checks each PR; ~8-9 SPECs

- **Pros:** real human-playable surface from day one; catches sign errors and unit confusion that snapshot tests would dutifully record as ground truth.
- **Cons:** sacrifices the autonomous-ralph design choice (rejected by the user in deep-interview Round 2). Adds stack dependencies (Ink, render loop).

### Option C — Engine + LLM-as-playtester scoring each replay's plausibility; ~7 SPECs + judge service

- **Pros:** fully autonomous *including* plausibility scoring — no human eyeball needed for AC-9.
- **Cons:** introduces LLM noise into a verifier that should be deterministic (Principle 3); token cost per replay; judge calibration is its own hard problem.

## Why chosen

Option A was selected by the user in deep-interview Round 2 (engine-only + golden replays) and Round 3 (ralph background). The Architect's pass-1 antithesis ("the verifier is circular — model is deterministic but possibly wrong") is absorbed by **AC-9** (user eyeballs the SIM-4 trajectory in the PR) and a planned post-slice **`SPEC-CAL-1`** (one-shot comparison of the 1979 Volcker trajectory against actual FRED data). Option B was rejected on autonomy grounds; Option C on Principle 3 (determinism).

## Consequences

- UX / runtime decisions (CLI vs TUI vs web vs native) are **deferred** to the second slice, after `SPEC-SIM-4` lands and the model can be eyeballed via snapshot output.
- Forward guidance is **out of slice 1** — the engine models the `policy_rate` lever only; expectations dynamics react to rate + credibility, not stance. A second slice will introduce `forward_guidance_stance` as `SPEC-GUIDE-1`.
- The three DESIGN.md open forks (banking-network granularity, FSOC peer mechanics, reappointment-denial stakes) are **all deferred** to post-slice and recorded in the source spec's §Non-Goals.
- **Schema fragmentation accepted.** Engine-tunable knobs consolidate to `content/engine/params.json` + `schemas/engine-params.schema.json`, while per-domain content (scenarios, committees, events, tech) keeps its own directory. The loc-key shape regex `^[a-z][a-z0-9_.]+$` is inlined in `scenario.schema.json` and `committee.schema.json`; existing `event.schema.json` / `tech.schema.json` do not yet enforce it — a post-slice harmonization follow-up.
- **Modeling choice:** `months_below_anchor` is **frozen on credibility recovery** (not reset) — represents persistent inflationary memory à la stagflation. If calibration finds this overshoots, a single-line change in `applyMonthlySpiral` swaps to reset-on-recovery; no engine refactor.
- **Author-runs-fresh-clone check (P0.1)** is the one moment the verifier is exercised without CI in front of it. The outcome will be appended to this §Consequences when the first push happens.

### Author-runs-fresh-clone check (record)

**Working-tree pass (P0 completion, not a fresh clone):**

- Date: 2026-06-01
- Command: `npm run check` against the in-place working tree after P0.1-P0.5 + LICENSE + runbook + this ADR + `package-lock.json` from `npm install`
- Outcome: exit 0 — typecheck OK, content validates (1 event + 3 techs), spec-trace clean (8 testable / 8 covered), 10 tests + 1 todo
- Notes: P0.5 originally claimed registering the 6 new SPECs as `[testable]` — this would have caused spec-trace orphan failures. Corrected to `[design]` registration (each Phase N PR flips the tag); see plan Draft 6 changelog. After this fix, the verifier passes cleanly.

**Fresh-clone pass (the author MUST do this immediately before `git push origin main`):**

- Date: _______
- Command: `git clone <local-path-or-future-remote> /tmp/mandate-fresh && cd /tmp/mandate-fresh && npm ci && npm run check`
- Exit code observed: _______
- Notes: _______

## Follow-ups (post-slice, not gating)

- **`SPEC-CAL-1`** — calibration harness (`tools/calibrate.ts`) comparing the 1979 Volcker trajectory to FRED data once. Absorbs the circular-verifier antithesis.
- **`SPEC-GUIDE-1`** — forward-guidance stance + content + expectations coefficient adjustments.
- **Slice 2 — Runtime & UX** — first interactive runtime (platform decision: CLI / Ink TUI / web / native).
- **Required-vars assertion expansion** — extend to event/tech content loaders that today silently default missing vars to 0.
- **Loc-key pattern harmonization** — promote the loc-key regex into `schemas/loc-key.schema.json` and `$ref` it from event/tech/scenario/committee schemas.
- **Engine variables registry** — `docs/engine-vars.md` cataloguing every `state.vars[*]` key, who writes it, who reads it, expected range.
- **Distribution-property tests for `SPEC-FOG-1`** — verify mean ≈ truth and variance ≈ `noise_scale²` across many seeds. Pair with `SPEC-CAL-1`.
- **DESIGN.md open forks** — addressed in their own slices after slices 1+2 prove the architecture: banking-network granularity, FSOC peer mechanics, reappointment-denial stakes.
