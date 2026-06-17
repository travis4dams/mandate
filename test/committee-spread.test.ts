import { describe, it, expect } from "vitest";
import { loadScenario } from "../src/content/scenarios.js";
import { loadScenarioCatalog } from "../src/content/scenarios.js";
import { loadCommittee } from "../src/content/committees.js";
import { loadTraitCatalog } from "../src/content/traits.js";
import { previewVote, loadCommitteeParams } from "../src/engine/fomc.js";

// SPEC-COMM-8: the committee dot-plot spread must read like a real SEP dot plot —
// bounded disagreement, not the slice-1 trichotomy or an unrealistically wide fan.

const REQUIRED = ["policy_rate", "inflation", "unemployment", "credibility", "expectations_anchor"];
const MAX_SPREAD = 0.015; // 150 bp ceiling

function spreadFor(scenarioId: string): { spread: number; previews: ReturnType<typeof previewVote>["previews"] } {
  const state = loadScenario(scenarioId, REQUIRED);
  const { previews } = previewVote(
    loadCommittee("comm.fomc_1979"),
    state.vars.policy_rate as number,
    state,
    loadCommitteeParams(),
    loadTraitCatalog(),
    undefined,
  );
  const rates = previews.map((p) => p.preferred).sort((a, b) => a - b);
  const spread = (rates[rates.length - 1] ?? 0) - (rates[0] ?? 0);
  return { spread, previews };
}

describe("SPEC-COMM-8: committee dot-plot spread realism", () => {
  const playable = loadScenarioCatalog().filter((s) => s.playable === true);

  it("has playable scenarios to check", () => {
    expect(playable.length).toBeGreaterThan(0);
  });

  for (const s of playable) {
    it(`${s.id}: spread is bounded (<= 150 bp) and positive`, () => {
      const { spread } = spreadFor(s.id);
      expect(spread).toBeGreaterThan(0); // committee is not unanimous
      expect(spread).toBeLessThanOrEqual(MAX_SPREAD);
    });
  }

  it("hawk-leaning members prefer higher rates than dove-leaning members (ordering preserved)", () => {
    // Use the 1979 scenario; the committee tags governor_b/atlanta hawkish and
    // governor_a/governor_d dovish (see content/committees/1979.json).
    const { previews } = spreadFor("scen.1979_stagflation");
    const byId = new Map(previews.map((p) => [p.memberId, p.preferred] as const));
    const hawkB = byId.get("member.governor_b");
    const doveA = byId.get("member.governor_a");
    const doveD = byId.get("member.governor_d");
    expect(hawkB).toBeDefined();
    expect(doveA).toBeDefined();
    expect(doveD).toBeDefined();
    expect(hawkB as number).toBeGreaterThan(doveA as number);
    expect(hawkB as number).toBeGreaterThan(doveD as number);
  });
});
