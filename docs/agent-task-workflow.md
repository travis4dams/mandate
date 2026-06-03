# Agent-task issue workflow

A lightweight queue for handing tasks to the recurring autonomous agent without
needing an interactive session.

## How to file a task

1. Open a GitHub issue describing what you want done. Treat it like a brief PR
   request: a concrete goal, any constraints, and acceptance criteria you care
   about.
2. Apply the **`agent-task`** label.
3. That's it. The recurring agent picks up labelled issues in `created_at` order
   on its next 5-hour fire.

## What the agent does

Each fire, before resuming the slice-2 PRD work, the agent:

1. Runs `gh issue list --state open --label agent-task --sort created --json number,title,body,createdAt`.
2. Picks the **oldest** issue and works only that one (no batching).
3. Opens a PR titled with the issue number (e.g. `Fixes #42 — <short summary>`)
   and links the issue in the PR body.
4. Comments on the issue with the PR URL once it's open.
5. **Removes the `agent-task` label** from the issue when the PR is opened. The
   issue stays open until you close it — that's your verification step.

## What the agent will NOT do

- Touch issues that aren't labelled `agent-task`.
- Push to `main` directly. Everything goes through PR review like normal slice
  work.
- Change the routine's behaviour on its own. Adjusting the cadence, queue
  semantics, or budget happens via this doc + an explicit user instruction.
- Pile multiple PRs on a single issue. If the first attempt is rejected, the
  agent escalates rather than spinning.

## Tips for good agent-task issues

- **Be specific about scope.** "Make the chart prettier" is hard to verify;
  "Replace the inline SVG trajectory chart with Observable Plot, preserving
  the same series and colors" is concrete.
- **List acceptance criteria.** A bulleted "done when:" section makes
  verification fast for both of us.
- **Reference SPEC ids** when relevant. New behaviour usually wants a new
  `SPEC-XXX-N` in `spec/requirements.md`; the agent will add it if missing.
- **Note constraints.** "Don't change the committee schema" or "no new
  dependencies" up-front avoids a rework round.

## Bypassing the queue

If you want a task done now, just ask in chat. The interactive session is
always faster than waiting for the next 5-hour fire.
