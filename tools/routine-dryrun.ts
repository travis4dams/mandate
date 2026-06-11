import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// SPEC-META-3
// Pure-core routine decision planner + thin CLI.
//
// The routine agent's decision procedure lives here as code, not prose:
//   plan(state, manual, live): ActionPlan
//
// This makes the logic CI-testable via --no-network --fixtures <dir>.
// The scheduler prompt (docs/routine-prompt-v3.md) is a thin wrapper that
// reads STATE.json + state.manual.json, runs this CLI, and executes the plan.
//
// Run:
//   tsx tools/routine-dryrun.ts                    — live mode (gh CLI)
//   tsx tools/routine-dryrun.ts --no-network --fixtures <dir>  — fixture mode

// ---- types ------------------------------------------------------------------

export interface IssueSnapshot {
  number: number;
  title: string;
  createdAt: string; // ISO 8601
}

export interface PrSnapshot {
  number: number;
  title: string;
  headRef: string;
  checksGreen: boolean;
  reviewVerdict: "APPROVE" | "REQUEST_CHANGES" | "PENDING" | null;
  fixRounds: number;
}

export interface LiveSnapshot {
  agentTaskIssues: IssueSnapshot[];
  openPRs: PrSnapshot[];
}

export type ActionKind =
  | "drain_issue"
  | "merge_pr"
  | "fix_pr"
  | "stuck_pr"
  | "wait_pr"
  | "idle";

export interface Action {
  kind: ActionKind;
  detail: string;
  ref?: number; // issue or PR number
}

export interface ActionPlan {
  actions: Action[];
  trace: string[];
}

// ManualJson shape — matches schemas/state-manual.schema.json
export interface ManualJson {
  activeSlice: string;
  gates: string[];
  parked: string[];
  notes: string;
}

// StateJson shape — top-level STATE.json (only fields we need here)
export interface StateJson {
  content?: Record<string, number>;
  slices?: unknown[];
  specs?: unknown[];
}

// ---- pure core --------------------------------------------------------------

/**
 * Compute the ActionPlan for one routine fire.
 *
 * Decision procedure (encodes the runbook contract exactly):
 *
 * a) manual.gates non-empty → single idle action, gates park everything.
 * b) Else if agentTaskIssues non-empty → single drain_issue for the oldest
 *    issue (tiebreak: lowest number). One unit of work per fire.
 * c) Else for each open PR (sorted by number):
 *      - checksGreen && reviewVerdict === "APPROVE"      → merge_pr
 *      - reviewVerdict === "REQUEST_CHANGES"
 *          fixRounds < 3  → fix_pr (round N+1 of 3)
 *          fixRounds >= 3 → stuck_pr (post STUCK comment, park)
 *      - otherwise                                       → wait_pr
 * d) If all PRs resolved to wait_pr only, or no PRs and no issues → idle.
 */
export function plan(
  _state: StateJson,
  manual: ManualJson,
  live: LiveSnapshot
): ActionPlan {
  const actions: Action[] = [];
  const trace: string[] = [];

  // (a) Gates: any gate in manual.gates parks everything.
  if (manual.gates.length > 0) {
    const gateList = manual.gates.join(", ");
    trace.push(`Gates active: [${gateList}] — parking all work until user clears gates.`);
    actions.push({
      kind: "idle",
      detail: `parked on user gate: ${gateList}`,
    });
    return { actions, trace };
  }

  trace.push("No active gates.");

  // (b) Agent-task issues: drain oldest first (tiebreak: lowest number).
  if (live.agentTaskIssues.length > 0) {
    const oldest = live.agentTaskIssues.slice().sort((a, b) => {
      const dateDiff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.number - b.number;
    })[0];

    trace.push(
      `${live.agentTaskIssues.length} agent-task issue(s) queued; ` +
        `oldest is #${oldest.number} "${oldest.title}" (created ${oldest.createdAt}). ` +
        `Draining it — one unit of work per fire.`
    );
    if (live.agentTaskIssues.length > 1) {
      const rest = live.agentTaskIssues
        .filter((i) => i.number !== oldest.number)
        .map((i) => `#${i.number}`)
        .join(", ");
      trace.push(`Skipping remaining issues this fire: ${rest}.`);
    }

    actions.push({
      kind: "drain_issue",
      ref: oldest.number,
      detail: `implement issue #${oldest.number} per docs/agent-task-workflow.md, one unit of work per fire`,
    });
    return { actions, trace };
  }

  trace.push("No agent-task issues queued.");

  // (c) Shepherd open PRs (sorted by number).
  if (live.openPRs.length === 0) {
    trace.push("No open PRs.");
  } else {
    const sorted = live.openPRs.slice().sort((a, b) => a.number - b.number);

    for (const pr of sorted) {
      const label = `PR #${pr.number} "${pr.title}"`;

      if (pr.checksGreen && pr.reviewVerdict === "APPROVE") {
        trace.push(`${label}: checks green + APPROVE — merging.`);
        actions.push({
          kind: "merge_pr",
          ref: pr.number,
          detail: `merge PR #${pr.number} — checks green and reviewer approved`,
        });
      } else if (pr.reviewVerdict === "REQUEST_CHANGES") {
        if (pr.fixRounds < 3) {
          const round = pr.fixRounds + 1;
          trace.push(
            `${label}: REQUEST_CHANGES, fixRounds=${pr.fixRounds} — fixing (round ${round} of 3).`
          );
          actions.push({
            kind: "fix_pr",
            ref: pr.number,
            detail: `fix PR #${pr.number} per reviewer feedback (round ${round} of 3)`,
          });
        } else {
          // fixRounds >= 3: hard STUCK boundary
          trace.push(
            `${label}: REQUEST_CHANGES, fixRounds=${pr.fixRounds} — STUCK boundary reached (≥3 rounds); parking.`
          );
          actions.push({
            kind: "stuck_pr",
            ref: pr.number,
            detail: `post STUCK comment on PR #${pr.number} and park — 3-round fix budget exhausted`,
          });
        }
      } else {
        // No verdict yet (PENDING or null), or checks not green: wait.
        const reason = pr.reviewVerdict === "PENDING" || pr.reviewVerdict === null
          ? `reviewVerdict=${pr.reviewVerdict}`
          : `checksGreen=${pr.checksGreen}`;
        trace.push(
          `${label}: waiting this fire (${reason}) — no action taken.`
        );
        actions.push({
          kind: "wait_pr",
          ref: pr.number,
          detail: `waiting on PR #${pr.number} (${reason})`,
        });
      }
    }
  }

  // (d) If everything is wait_pr or there are no actions at all → idle.
  const actionable = actions.filter((a) => a.kind !== "wait_pr");
  if (actionable.length === 0) {
    if (actions.length > 0) {
      trace.push("All open PRs are waiting; no actionable work this fire — zero-trace idle.");
    } else {
      trace.push("No open PRs and no issues — zero-trace idle; exit with zero trace.");
    }
    // Remove wait_pr placeholders; they served only for trace reasoning.
    actions.length = 0;
    actions.push({ kind: "idle", detail: "no actionable work; exit with zero trace" });
  }

  return { actions, trace };
}

// ---- fixture / network helpers ----------------------------------------------

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadFixtures(fixturesDir: string): {
  state: StateJson;
  manual: ManualJson;
  live: LiveSnapshot;
} {
  const statePath = join(fixturesDir, "state.json");
  const manualPath = join(fixturesDir, "manual.json");
  const livePath = join(fixturesDir, "live.json");

  // Fall back to repo-root defaults when fixture files are absent
  const state: StateJson = existsSync(statePath)
    ? readJsonFile<StateJson>(statePath)
    : existsSync("STATE.json")
    ? readJsonFile<StateJson>("STATE.json")
    : {};

  const manual: ManualJson = existsSync(manualPath)
    ? readJsonFile<ManualJson>(manualPath)
    : existsSync("state.manual.json")
    ? readJsonFile<ManualJson>("state.manual.json")
    : { activeSlice: "", gates: [], parked: [], notes: "" };

  const live: LiveSnapshot = readJsonFile<LiveSnapshot>(livePath);

  return { state, manual, live };
}

// ---- live gh-gathering helpers (not exercised in CI) ------------------------

async function gatherLiveSnapshot(): Promise<LiveSnapshot> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  // Gather agent-task issues
  let agentTaskIssues: IssueSnapshot[] = [];
  try {
    const { stdout } = await exec("gh", [
      "issue",
      "list",
      "--label",
      "agent-task",
      "--state",
      "open",
      "--json",
      "number,title,createdAt",
    ]);
    agentTaskIssues = JSON.parse(stdout) as IssueSnapshot[];
  } catch (err) {
    console.error("gh issue list failed:", err);
    process.exit(1);
  }

  // Gather open PRs
  let prList: Array<{ number: number; title: string; headRefName: string }> = [];
  try {
    const { stdout } = await exec("gh", [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,headRefName",
    ]);
    prList = JSON.parse(stdout);
  } catch (err) {
    console.error("gh pr list failed:", err);
    process.exit(1);
  }

  const openPRs: PrSnapshot[] = [];
  for (const pr of prList) {
    // Gather checks for each PR
    let checksGreen = false;
    try {
      const { stdout } = await exec("gh", [
        "pr",
        "checks",
        String(pr.number),
        "--json",
        "state",
      ]);
      const checks = JSON.parse(stdout) as Array<{ state: string }>;
      checksGreen =
        checks.length > 0 && checks.every((c) => c.state === "SUCCESS");
    } catch {
      checksGreen = false;
    }

    // Gather review verdict for each PR
    let reviewVerdict: PrSnapshot["reviewVerdict"] = null;
    let fixRounds = 0;
    try {
      const { stdout } = await exec("gh", [
        "pr",
        "reviews",
        String(pr.number),
        "--json",
        "state,body",
      ]);
      const reviews = JSON.parse(stdout) as Array<{ state: string; body: string }>;
      // Latest verdict wins; count prior REQUEST_CHANGES rounds as heuristic for fixRounds.
      // A "fix round" is a subsequent push after a REQUEST_CHANGES review — approximated
      // here by counting distinct REQUEST_CHANGES reviews. In practice, the scheduler
      // should pass fixRounds from a more detailed source (e.g., PR timeline), but
      // review-count is a reasonable conservative proxy.
      const rcReviews = reviews.filter((r) => r.state === "CHANGES_REQUESTED");
      fixRounds = rcReviews.length;
      if (reviews.length > 0) {
        const last = reviews[reviews.length - 1];
        if (last.state === "APPROVED") reviewVerdict = "APPROVE";
        else if (last.state === "CHANGES_REQUESTED") reviewVerdict = "REQUEST_CHANGES";
        else reviewVerdict = "PENDING";
      }
    } catch {
      reviewVerdict = null;
    }

    openPRs.push({
      number: pr.number,
      title: pr.title,
      headRef: pr.headRefName,
      checksGreen,
      reviewVerdict,
      fixRounds,
    });
  }

  return { agentTaskIssues, openPRs };
}

// ---- CLI entry point --------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noNetwork = args.includes("--no-network");
  const fixturesIdx = args.indexOf("--fixtures");
  const fixturesDir = fixturesIdx !== -1 ? args[fixturesIdx + 1] : undefined;

  let state: StateJson;
  let manual: ManualJson;
  let live: LiveSnapshot;

  if (noNetwork && fixturesDir) {
    ({ state, manual, live } = loadFixtures(fixturesDir));
  } else if (noNetwork) {
    // --no-network without --fixtures: use repo-root files
    state = existsSync("STATE.json") ? readJsonFile<StateJson>("STATE.json") : {};
    manual = existsSync("state.manual.json")
      ? readJsonFile<ManualJson>("state.manual.json")
      : { activeSlice: "", gates: [], parked: [], notes: "" };
    live = { agentTaskIssues: [], openPRs: [] };
  } else {
    // Live mode: gather from gh
    state = existsSync("STATE.json") ? readJsonFile<StateJson>("STATE.json") : {};
    manual = existsSync("state.manual.json")
      ? readJsonFile<ManualJson>("state.manual.json")
      : { activeSlice: "", gates: [], parked: [], notes: "" };
    live = await gatherLiveSnapshot();
  }

  const result = plan(state, manual, live);

  // Print trace
  console.log("=== Routine dry-run trace ===");
  for (const line of result.trace) {
    console.log("  " + line);
  }
  console.log("");

  // Print numbered action plan
  console.log("=== Action plan ===");
  if (result.actions.length === 0) {
    console.log("  (no actions)");
  } else {
    for (let i = 0; i < result.actions.length; i++) {
      const a = result.actions[i];
      const ref = a.ref !== undefined ? ` [#${a.ref}]` : "";
      console.log(`  ${i + 1}. [${a.kind}]${ref} ${a.detail}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
