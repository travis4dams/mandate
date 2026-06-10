import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadBriefing } from "../src/content/briefings";

// SPEC-BRIEF-3: the 2008 and COVID scenarios ship with staff briefings whose forecasts
// reflect a demand collapse (tightening lowers the inflation outlook and raises the
// unemployment outlook relative to easing), and whose loc keys all resolve.
describe("SPEC-BRIEF-3: crisis-scenario briefings", () => {
  const locale = JSON.parse(
    readFileSync("content/localization/en.json", "utf8"),
  ) as Record<string, string>;

  for (const id of ["brief.2008_q4_crisis", "brief.2020_q1_pandemic"]) {
    describe(id, () => {
      it("loads via loadBriefing", () => {
        const b = loadBriefing(id);
        expect(b.id).toBe(id);
        expect(b.scenarios).toHaveLength(3);
      });

      it("raise forecasts lower inflation and higher unemployment than lower", () => {
        const b = loadBriefing(id);
        const raise = b.scenarios.find((s) => s.scenario_type === "raise")!;
        const lower = b.scenarios.find((s) => s.scenario_type === "lower")!;
        expect(raise.forecast.inflation_outlook).toBeLessThan(lower.forecast.inflation_outlook);
        expect(raise.forecast.unemployment_outlook).toBeGreaterThan(lower.forecast.unemployment_outlook);
      });

      it("all localization keys resolve", () => {
        const b = loadBriefing(id);
        for (const key of [b.name, b.desc, ...b.scenarios.map((s) => s.name)]) {
          expect(locale[key], `missing en.json key: ${key}`).toBeTypeOf("string");
        }
      });
    });
  }
});
