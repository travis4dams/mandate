# Routine scheduler prompt — v3

This is the scheduler prompt for the recurring MANDATE routine agent. It is a
**thin wrapper** around `tools/routine-dryrun.ts`, which contains all decision
logic. This file adds no decision logic of its own; it only describes how to
run the harness and execute the printed plan.

---

## What to do on each fire

1. **Read state files** from the repo root:
   - `STATE.json` — generated repo facts (never edit by hand).
   - `state.manual.json` — human intent: active slice, gates, parked items.

2. **Run the dry-run harness** to get this fire's action plan:

   ```
   npx tsx tools/routine-dryrun.ts
   ```

   The harness reads `STATE.json` and `state.manual.json` automatically and
   gathers live data via `gh` (open issues labelled `agent-task`, open PRs,
   their check statuses and review verdicts).

   > **Harness machine caveat:** on machines where `node` freezes (repo issue
   > #103), do not run the harness locally. Instead run it in CI or on a
   > machine where Node is healthy, or use the `--no-network --fixtures <dir>`
   > mode with a hand-crafted `live.json` to reason about the plan offline.

3. **Read the printed plan** top to bottom. Execute each numbered action in
   order. Honor the following rules:

   ### drain_issue
   Implement the referenced `agent-task` issue following
   `docs/agent-task-workflow.md`. Do **one unit of work per fire** — open the
   PR, comment on the issue with the PR URL, and remove the `agent-task` label
   only after both steps succeed. Do not batch multiple issues in one fire.

   ### merge_pr
   Merge the referenced PR using `gh pr merge --squash`. Never use `--admin`
   or `--no-verify`. The PR must have green required checks and an APPROVE
   verdict before this action appears in the plan.

   ### fix_pr
   Address the reviewer's REQUEST_CHANGES feedback on the referenced PR. Push
   a fix commit; the plan detail shows the round number (e.g. "round 2 of 3").
   After pushing, wait for the next fire to re-evaluate — do not loop within a
   single fire.

   ### stuck_pr
   The 3-round fix budget is exhausted. Post a STUCK comment on the PR
   explaining that the fix budget is exhausted and manual intervention is
   needed (merge with admin override, accept a follow-up PR, or redesign).
   Then park — do not push further fixes.

   ### idle
   Zero-trace exit: make no commits, open no PRs, post no progress notes.
   Exit cleanly with code 0.

4. **Never** use `--admin` or `--no-verify` on any git or gh command.

---

## Contributor note

When regenerating documentation or state locally, use:

```
npm run docs:gen
```

**Never** run `npm run docs:gen --enrich` by hand. The `--enrich` flag reads
git history and is the update-state workflow's exclusive job (it runs under
`fetch-depth: 0`). Running it locally is harmless per the fill-only rule, but
it is not your job — the workflow handles it automatically after each merge.
