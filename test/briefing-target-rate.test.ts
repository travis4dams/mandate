import { describe, it, expect } from "vitest";
import { loadBriefing } from "../src/content/briefings.js";

// SPEC-BRIEF-4: every briefing branch names the analyzed policy rate, ordered
// raise > hold > lower (the rate each policy path assumes).

const BRIEFINGS = [
  "brief.1979_q3_stagflation",
  "brief.2008_q4_crisis",
  "brief.2020_q1_pandemic",
];

describe("SPEC-BRIEF-4: briefing target rates", () => {
  for (const id of BRIEFINGS) {
    it(`${id} carries an ordered target_rate on all three branches`, () => {
      const b = loadBriefing(id);
      const byType = Object.fromEntries(b.scenarios.map((s) => [s.scenario_type, s.target_rate]));
      for (const t of ["raise", "hold", "lower"] as const) {
        expect(typeof byType[t]).toBe("number");
      }
      expect(byType.raise as number).toBeGreaterThan(byType.hold as number);
      expect(byType.hold as number).toBeGreaterThan(byType.lower as number);
    });
  }
});
