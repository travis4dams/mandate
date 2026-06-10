import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// SPEC-HEAR-2: scenario_weights must point at shipped scenarios, and every authored
// starting scenario must be reachable from at least one hearing answer.
describe("SPEC-HEAR-2: hearing/scenario cross-content integrity", () => {
  const hearing = JSON.parse(
    readFileSync("content/hearings/confirmation.json", "utf8"),
  ) as {
    questions: { answers: { id: string; scenario_weights?: Record<string, number> }[] }[];
  };

  const shippedIds = new Set(
    readdirSync("content/scenarios")
      .filter((f) => f.endsWith(".json"))
      .map((f) => (JSON.parse(readFileSync(join("content/scenarios", f), "utf8")) as { id: string }).id),
  );

  const weightedIds = new Set<string>();
  for (const q of hearing.questions) {
    for (const a of q.answers) {
      for (const [scen, w] of Object.entries(a.scenario_weights ?? {})) {
        if (w > 0) weightedIds.add(scen);
      }
    }
  }

  it("every weighted scenario id is a shipped scenario", () => {
    for (const id of weightedIds) {
      expect(shippedIds.has(id), `hearing references unknown scenario: ${id}`).toBe(true);
    }
  });

  it("each authored starting scenario is reachable from some answer", () => {
    // recovery_test.json is a fixture, deliberately excluded from this list.
    for (const id of ["scen.1979_stagflation", "scen.2008_gfc", "scen.covid_2020"]) {
      expect(weightedIds.has(id), `scenario unreachable from hearing: ${id}`).toBe(true);
    }
  });
});
